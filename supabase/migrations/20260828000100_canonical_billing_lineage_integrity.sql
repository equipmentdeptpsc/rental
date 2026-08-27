BEGIN;

SET search_path TO erp, auth, extensions, pg_catalog;

ALTER TABLE erp.billing_statement_lines
  ADD COLUMN IF NOT EXISTS commercial_snapshot_id text REFERENCES erp.commercial_snapshots(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS commercial_snapshot_hash text,
  ADD COLUMN IF NOT EXISTS rental_number_snapshot text,
  ADD COLUMN IF NOT EXISTS rental_equipment_line_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS equipment_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS assignment_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS operator_snapshot jsonb;

CREATE OR REPLACE FUNCTION erp.capture_billing_statement_line_lineage()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = erp, auth, extensions, pg_catalog
AS $$
DECLARE
  statement_record erp.billing_statements;
  deur_record erp.deurs;
  line_record erp.rental_equipment_lines;
  rental_record erp.rentals;
  equipment_record erp.equipment;
  assignment_record erp.assignments;
  operator_record erp.operators;
  commercial_record erp.commercial_snapshots;
BEGIN
  IF NEW.commercial_terms_source IS DISTINCT FROM 'IMMUTABLE_SNAPSHOT' THEN
    RETURN NEW;
  END IF;

  SELECT * INTO statement_record FROM erp.billing_statements WHERE id=NEW.billing_statement_id;
  SELECT * INTO deur_record FROM erp.deurs WHERE id=NEW.deur_id;
  SELECT * INTO line_record FROM erp.rental_equipment_lines WHERE id=deur_record.rental_equipment_line_id;
  SELECT * INTO rental_record FROM erp.rentals WHERE id=deur_record.rental_id;
  SELECT * INTO equipment_record FROM erp.equipment WHERE id=deur_record.equipment_id;
  SELECT * INTO assignment_record FROM erp.assignments WHERE id=deur_record.assignment_id;
  SELECT * INTO operator_record FROM erp.operators WHERE id=deur_record.operator_id;
  SELECT * INTO commercial_record FROM erp.commercial_snapshots WHERE id=deur_record.commercial_snapshot_id;

  IF statement_record.id IS NULL OR deur_record.id IS NULL OR line_record.id IS NULL
     OR rental_record.id IS NULL OR equipment_record.id IS NULL OR operator_record.id IS NULL
     OR commercial_record.id IS NULL
     OR statement_record.company_id IS DISTINCT FROM deur_record.company_id
     OR statement_record.rental_id IS DISTINCT FROM deur_record.rental_id
     OR line_record.company_id IS DISTINCT FROM deur_record.company_id
     OR line_record.rental_id IS DISTINCT FROM deur_record.rental_id
     OR line_record.equipment_id IS DISTINCT FROM deur_record.equipment_id
     OR NEW.rental_equipment_line_id IS DISTINCT FROM deur_record.rental_equipment_line_id
     OR NEW.equipment_id IS DISTINCT FROM deur_record.equipment_id
     OR NEW.operator_id IS DISTINCT FROM deur_record.operator_id
     OR deur_record.status::text <> 'Acknowledged'
     OR deur_record.superseded_by_revision_id IS NOT NULL
     OR deur_record.billing_locked
     OR commercial_record.rental_id IS DISTINCT FROM deur_record.rental_id
     OR commercial_record.rental_equipment_line_id IS DISTINCT FROM deur_record.rental_equipment_line_id THEN
    RAISE EXCEPTION 'CANONICAL_BILLING_LINEAGE_MISMATCH' USING ERRCODE='23514';
  END IF;

  IF deur_record.assignment_id IS NOT NULL AND (
    assignment_record.id IS NULL
    OR assignment_record.company_id IS DISTINCT FROM deur_record.company_id
    OR assignment_record.equipment_id IS DISTINCT FROM deur_record.equipment_id
    OR assignment_record.operator_id IS DISTINCT FROM deur_record.operator_id
  ) THEN
    RAISE EXCEPTION 'CANONICAL_BILLING_ASSIGNMENT_MISMATCH' USING ERRCODE='23514';
  END IF;

  NEW.commercial_snapshot_id := commercial_record.id;
  NEW.commercial_snapshot_hash := coalesce(commercial_record.snapshot_hash,encode(digest(to_jsonb(commercial_record)::text,'sha256'),'hex'));
  NEW.rental_number_snapshot := rental_record.rental_number;
  NEW.rental_equipment_line_snapshot := jsonb_build_object(
    'id',line_record.id,'rentalId',line_record.rental_id,'equipmentId',line_record.equipment_id,
    'assignmentId',deur_record.assignment_id,'operatorId',deur_record.operator_id
  );
  NEW.equipment_snapshot := jsonb_build_object(
    'id',equipment_record.id,'assetNo',equipment_record.asset_no,'name',equipment_record.equipment_name
  );
  NEW.assignment_snapshot := CASE WHEN assignment_record.id IS NULL THEN NULL ELSE jsonb_build_object(
    'id',assignment_record.id,'equipmentId',assignment_record.equipment_id,
    'operatorId',assignment_record.operator_id,'projectId',assignment_record.project_id
  ) END;
  NEW.operator_snapshot := jsonb_build_object('id',operator_record.id,'name',operator_record.name);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS capture_billing_statement_line_lineage ON erp.billing_statement_lines;
CREATE TRIGGER capture_billing_statement_line_lineage
BEFORE INSERT ON erp.billing_statement_lines
FOR EACH ROW EXECUTE FUNCTION erp.capture_billing_statement_line_lineage();

UPDATE erp.billing_statement_lines target
SET commercial_snapshot_id=source.commercial_snapshot_id,
    commercial_snapshot_hash=source.commercial_snapshot_hash,
    rental_number_snapshot=source.rental_number_snapshot,
    rental_equipment_line_snapshot=source.rental_equipment_line_snapshot,
    equipment_snapshot=source.equipment_snapshot,
    assignment_snapshot=source.assignment_snapshot,
    operator_snapshot=source.operator_snapshot
FROM (
  SELECT billing_line.id,
    commercial.id AS commercial_snapshot_id,
    coalesce(commercial.snapshot_hash,encode(digest(to_jsonb(commercial)::text,'sha256'),'hex')) AS commercial_snapshot_hash,
    rental.rental_number AS rental_number_snapshot,
    jsonb_build_object('id',line.id,'rentalId',line.rental_id,'equipmentId',deur.equipment_id,'assignmentId',deur.assignment_id,'operatorId',deur.operator_id) AS rental_equipment_line_snapshot,
    jsonb_build_object('id',equipment.id,'assetNo',equipment.asset_no,'name',equipment.equipment_name) AS equipment_snapshot,
    CASE WHEN assignment.id IS NULL THEN NULL ELSE jsonb_build_object('id',assignment.id,'equipmentId',assignment.equipment_id,'operatorId',assignment.operator_id,'projectId',assignment.project_id) END AS assignment_snapshot,
    jsonb_build_object('id',operator_record.id,'name',operator_record.name) AS operator_snapshot
  FROM erp.billing_statement_lines billing_line
  JOIN erp.deurs deur ON deur.id=billing_line.deur_id AND deur.company_id=billing_line.company_id
  JOIN erp.rental_equipment_lines line ON line.id=deur.rental_equipment_line_id AND line.company_id=deur.company_id
  JOIN erp.rentals rental ON rental.id=deur.rental_id AND rental.company_id=deur.company_id
  JOIN erp.equipment equipment ON equipment.id=deur.equipment_id AND equipment.company_id=deur.company_id
  LEFT JOIN erp.assignments assignment ON assignment.id=deur.assignment_id AND assignment.company_id=deur.company_id
  JOIN erp.operators operator_record ON operator_record.id=deur.operator_id AND operator_record.company_id=deur.company_id
  JOIN erp.commercial_snapshots commercial ON commercial.id=deur.commercial_snapshot_id
    AND commercial.rental_id=deur.rental_id AND commercial.rental_equipment_line_id=deur.rental_equipment_line_id
  WHERE billing_line.commercial_terms_source='IMMUTABLE_SNAPSHOT'
) source
WHERE target.id=source.id;

ALTER TABLE erp.billing_statement_lines
  ADD CONSTRAINT billing_statement_lines_canonical_lineage_required CHECK (
    commercial_terms_source IS DISTINCT FROM 'IMMUTABLE_SNAPSHOT' OR (
      commercial_snapshot_id IS NOT NULL AND commercial_snapshot_hash IS NOT NULL
      AND rental_number_snapshot IS NOT NULL AND rental_equipment_line_snapshot IS NOT NULL
      AND equipment_snapshot IS NOT NULL AND operator_snapshot IS NOT NULL
    )
  ) NOT VALID;

CREATE OR REPLACE FUNCTION erp.reject_billing_statement_line_lineage_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = erp, pg_catalog
AS $$
BEGIN
  IF ROW(
    NEW.billing_statement_id,NEW.rental_equipment_line_id,NEW.equipment_id,NEW.deur_id,NEW.operator_id,
    NEW.deur_revision_chain_id,NEW.deur_revision_number,NEW.effective_deur_id,NEW.work_date,
    NEW.commercial_snapshot_id,NEW.commercial_snapshot_hash,NEW.rental_number_snapshot,
    NEW.rental_equipment_line_snapshot,NEW.equipment_snapshot,NEW.assignment_snapshot,NEW.operator_snapshot
  ) IS DISTINCT FROM ROW(
    OLD.billing_statement_id,OLD.rental_equipment_line_id,OLD.equipment_id,OLD.deur_id,OLD.operator_id,
    OLD.deur_revision_chain_id,OLD.deur_revision_number,OLD.effective_deur_id,OLD.work_date,
    OLD.commercial_snapshot_id,OLD.commercial_snapshot_hash,OLD.rental_number_snapshot,
    OLD.rental_equipment_line_snapshot,OLD.equipment_snapshot,OLD.assignment_snapshot,OLD.operator_snapshot
  ) THEN
    RAISE EXCEPTION 'BILLING_LINEAGE_IMMUTABLE' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS reject_billing_statement_line_lineage_mutation ON erp.billing_statement_lines;
CREATE TRIGGER reject_billing_statement_line_lineage_mutation
BEFORE UPDATE ON erp.billing_statement_lines
FOR EACH ROW EXECUTE FUNCTION erp.reject_billing_statement_line_lineage_mutation();

ALTER FUNCTION erp.capture_billing_statement_line_lineage() OWNER TO postgres;
ALTER FUNCTION erp.reject_billing_statement_line_lineage_mutation() OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.capture_billing_statement_line_lineage(),erp.reject_billing_statement_line_lineage_mutation() FROM PUBLIC,anon,authenticated,service_role;

COMMIT;
