BEGIN;

-- The canonical return command owns the state transition.  This append-only
-- trigger records exactly one tenant-scoped audit fact for each transition to
-- Returned, including child transitions issued by Return All.
CREATE OR REPLACE FUNCTION erp.audit_canonical_rental_line_return()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = erp, auth, extensions, pg_catalog
AS $$
DECLARE
  prior_status text = coalesce(OLD.canonical_line_status::text, OLD.status::text);
  next_status text = coalesce(NEW.canonical_line_status::text, NEW.status::text);
  actor text = coalesce(NEW.updated_by, auth.uid()::text);
BEGIN
  IF prior_status <> 'Returned' AND next_status = 'Returned' THEN
    INSERT INTO erp.audit_log(
      id, company_id, aggregate_type, aggregate_id, action, actor_id, occurred_at,
      correlation_id, previous_values, new_values, metadata
    ) VALUES (
      extensions.gen_random_uuid()::text, NEW.company_id, 'RENTAL_LINE', NEW.id,
      'RETURN_RENTAL_LINE', actor, clock_timestamp(),
      'return-line:' || NEW.id || ':' || NEW.row_version,
      jsonb_build_object('status', prior_status),
      jsonb_build_object('status', next_status, 'actualReturnDate', NEW.actual_return_date, 'version', NEW.row_version),
      jsonb_build_object('rentalId', NEW.rental_id, 'rentalEquipmentLineId', NEW.id, 'equipmentId', NEW.equipment_id, 'assignmentId', NEW.assignment_id, 'actualReturnDate', NEW.actual_return_date, 'source', 'canonical_return_line_transition')
    );
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION erp.audit_canonical_rental_line_return() OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.audit_canonical_rental_line_return() FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS audit_canonical_rental_line_return ON erp.rental_equipment_lines;
CREATE TRIGGER audit_canonical_rental_line_return
AFTER UPDATE OF status, canonical_line_status, actual_return_date ON erp.rental_equipment_lines
FOR EACH ROW EXECUTE FUNCTION erp.audit_canonical_rental_line_return();

COMMIT;
