BEGIN;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
SET search_path TO erp, public;

-- The compatibility company is a migration waypoint and must never be treated
-- as an approved production tenant.
ALTER TABLE companies ADD COLUMN IF NOT EXISTS environment_class text NOT NULL DEFAULT 'approved'
  CHECK(environment_class IN('compatibility','test','approved'));
UPDATE companies SET environment_class='compatibility' WHERE id='TENANT-LOCAL-001';

-- Scope tables introduced before the canonical company identity and backfill
-- from their authoritative parent. Stable business IDs are not changed.
ALTER TABLE billing_statement_lines ADD COLUMN IF NOT EXISTS company_id text REFERENCES companies(id);
UPDATE billing_statement_lines l SET company_id=s.company_id
FROM billing_statements s WHERE s.id=l.billing_statement_id AND l.company_id IS NULL;
ALTER TABLE billing_statement_lines ALTER COLUMN company_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS ix_billing_statement_lines_company ON billing_statement_lines(company_id);

ALTER TABLE deur_review_history ADD COLUMN IF NOT EXISTS company_id text REFERENCES companies(id);
UPDATE deur_review_history h SET company_id=d.company_id FROM deurs d WHERE d.id=h.deur_id AND h.company_id IS NULL;
ALTER TABLE deur_review_history ALTER COLUMN company_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS ix_deur_review_history_company ON deur_review_history(company_id);

-- Composite parent identities are indexed before adding tenant-bearing FKs.
DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'operators','customers','projects','equipment','assignments','rentals',
    'rental_equipment_lines','deurs','billing_statements'
  ] LOOP
    EXECUTE format('CREATE UNIQUE INDEX IF NOT EXISTS %I ON %I(company_id,id)',
      'uq_'||table_name||'_company_id',table_name);
  END LOOP;
END $$;

ALTER TABLE users DROP CONSTRAINT IF EXISTS fk_users_company_operator;
ALTER TABLE users ADD CONSTRAINT fk_users_company_operator
  FOREIGN KEY(company_id,operator_id) REFERENCES operators(company_id,id) NOT VALID;
ALTER TABLE projects DROP CONSTRAINT IF EXISTS fk_projects_company_customer;
ALTER TABLE projects ADD CONSTRAINT fk_projects_company_customer
  FOREIGN KEY(company_id,customer_id) REFERENCES customers(company_id,id) NOT VALID;
ALTER TABLE equipment DROP CONSTRAINT IF EXISTS fk_equipment_company_project;
ALTER TABLE equipment ADD CONSTRAINT fk_equipment_company_project
  FOREIGN KEY(company_id,project_id) REFERENCES projects(company_id,id) NOT VALID;
ALTER TABLE equipment DROP CONSTRAINT IF EXISTS fk_equipment_company_operator;
ALTER TABLE equipment ADD CONSTRAINT fk_equipment_company_operator
  FOREIGN KEY(company_id,operator_id) REFERENCES operators(company_id,id) NOT VALID;
ALTER TABLE assignments DROP CONSTRAINT IF EXISTS fk_assignments_company_equipment;
ALTER TABLE assignments ADD CONSTRAINT fk_assignments_company_equipment
  FOREIGN KEY(company_id,equipment_id) REFERENCES equipment(company_id,id) NOT VALID;
ALTER TABLE assignments DROP CONSTRAINT IF EXISTS fk_assignments_company_operator;
ALTER TABLE assignments ADD CONSTRAINT fk_assignments_company_operator
  FOREIGN KEY(company_id,operator_id) REFERENCES operators(company_id,id) NOT VALID;
ALTER TABLE assignments DROP CONSTRAINT IF EXISTS fk_assignments_company_project;
ALTER TABLE assignments ADD CONSTRAINT fk_assignments_company_project
  FOREIGN KEY(company_id,project_id) REFERENCES projects(company_id,id) NOT VALID;
ALTER TABLE rentals DROP CONSTRAINT IF EXISTS fk_rentals_company_customer;
ALTER TABLE rentals ADD CONSTRAINT fk_rentals_company_customer
  FOREIGN KEY(company_id,customer_id) REFERENCES customers(company_id,id) NOT VALID;
ALTER TABLE rentals DROP CONSTRAINT IF EXISTS fk_rentals_company_project;
ALTER TABLE rentals ADD CONSTRAINT fk_rentals_company_project
  FOREIGN KEY(company_id,project_id) REFERENCES projects(company_id,id) NOT VALID;
ALTER TABLE rentals DROP CONSTRAINT IF EXISTS fk_rentals_company_assignment;
ALTER TABLE rentals ADD CONSTRAINT fk_rentals_company_assignment
  FOREIGN KEY(company_id,assignment_id) REFERENCES assignments(company_id,id) NOT VALID;
ALTER TABLE rental_equipment_lines DROP CONSTRAINT IF EXISTS fk_lines_company_rental;
ALTER TABLE rental_equipment_lines ADD CONSTRAINT fk_lines_company_rental
  FOREIGN KEY(company_id,rental_id) REFERENCES rentals(company_id,id) NOT VALID;
ALTER TABLE rental_equipment_lines DROP CONSTRAINT IF EXISTS fk_lines_company_assignment;
ALTER TABLE rental_equipment_lines ADD CONSTRAINT fk_lines_company_assignment
  FOREIGN KEY(company_id,assignment_id) REFERENCES assignments(company_id,id) NOT VALID;
ALTER TABLE rental_equipment_lines DROP CONSTRAINT IF EXISTS fk_lines_company_equipment;
ALTER TABLE rental_equipment_lines ADD CONSTRAINT fk_lines_company_equipment
  FOREIGN KEY(company_id,equipment_id) REFERENCES equipment(company_id,id) NOT VALID;
ALTER TABLE rental_equipment_lines DROP CONSTRAINT IF EXISTS fk_lines_company_operator;
ALTER TABLE rental_equipment_lines ADD CONSTRAINT fk_lines_company_operator
  FOREIGN KEY(company_id,operator_id) REFERENCES operators(company_id,id) NOT VALID;
ALTER TABLE deurs DROP CONSTRAINT IF EXISTS fk_deurs_company_rental;
ALTER TABLE deurs ADD CONSTRAINT fk_deurs_company_rental
  FOREIGN KEY(company_id,rental_id) REFERENCES rentals(company_id,id) NOT VALID;
ALTER TABLE deurs DROP CONSTRAINT IF EXISTS fk_deurs_company_line;
ALTER TABLE deurs ADD CONSTRAINT fk_deurs_company_line
  FOREIGN KEY(company_id,rental_equipment_line_id) REFERENCES rental_equipment_lines(company_id,id) NOT VALID;
ALTER TABLE deurs DROP CONSTRAINT IF EXISTS fk_deurs_company_assignment;
ALTER TABLE deurs ADD CONSTRAINT fk_deurs_company_assignment
  FOREIGN KEY(company_id,assignment_id) REFERENCES assignments(company_id,id) NOT VALID;
ALTER TABLE deurs DROP CONSTRAINT IF EXISTS fk_deurs_company_previous_revision;
ALTER TABLE deurs ADD CONSTRAINT fk_deurs_company_previous_revision
  FOREIGN KEY(company_id,previous_revision_id) REFERENCES deurs(company_id,id) NOT VALID;

-- Child tables without text IDs use tenant-validation triggers because a
-- composite FK would require changing their established primary identity.
CREATE OR REPLACE FUNCTION reject_cross_company_child()
RETURNS trigger LANGUAGE plpgsql SET search_path=erp,public AS $$
DECLARE expected_company text;
BEGIN
  IF TG_TABLE_NAME='deur_events' THEN SELECT company_id INTO expected_company FROM deurs WHERE id=NEW.deur_id;
  ELSIF TG_TABLE_NAME='deur_review_history' THEN SELECT company_id INTO expected_company FROM deurs WHERE id=NEW.deur_id;
  ELSIF TG_TABLE_NAME='customer_review_requests' THEN SELECT company_id INTO expected_company FROM deurs WHERE id=NEW.revision_id;
  ELSIF TG_TABLE_NAME='deur_meter_checkpoints' THEN SELECT company_id INTO expected_company FROM deurs WHERE id=NEW.deur_id;
  ELSIF TG_TABLE_NAME='billing_statement_lines' THEN SELECT company_id INTO expected_company FROM billing_statements WHERE id=NEW.billing_statement_id;
  END IF;
  IF expected_company IS NULL OR NEW.company_id IS DISTINCT FROM expected_company THEN
    RAISE EXCEPTION 'tenant relationship mismatch' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['deur_events','deur_review_history','customer_review_requests','deur_meter_checkpoints','billing_statement_lines'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS enforce_company_relationship ON %I',table_name);
    EXECUTE format('CREATE TRIGGER enforce_company_relationship BEFORE INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION reject_cross_company_child()',table_name);
  END LOOP;
END $$;

ALTER TABLE users VALIDATE CONSTRAINT fk_users_company_operator;
ALTER TABLE projects VALIDATE CONSTRAINT fk_projects_company_customer;
ALTER TABLE equipment VALIDATE CONSTRAINT fk_equipment_company_project;
ALTER TABLE equipment VALIDATE CONSTRAINT fk_equipment_company_operator;
ALTER TABLE assignments VALIDATE CONSTRAINT fk_assignments_company_equipment;
ALTER TABLE assignments VALIDATE CONSTRAINT fk_assignments_company_operator;
ALTER TABLE assignments VALIDATE CONSTRAINT fk_assignments_company_project;
ALTER TABLE rentals VALIDATE CONSTRAINT fk_rentals_company_customer;
ALTER TABLE rentals VALIDATE CONSTRAINT fk_rentals_company_project;
ALTER TABLE rentals VALIDATE CONSTRAINT fk_rentals_company_assignment;
ALTER TABLE rental_equipment_lines VALIDATE CONSTRAINT fk_lines_company_rental;
ALTER TABLE rental_equipment_lines VALIDATE CONSTRAINT fk_lines_company_assignment;
ALTER TABLE rental_equipment_lines VALIDATE CONSTRAINT fk_lines_company_equipment;
ALTER TABLE rental_equipment_lines VALIDATE CONSTRAINT fk_lines_company_operator;
ALTER TABLE deurs VALIDATE CONSTRAINT fk_deurs_company_rental;
ALTER TABLE deurs VALIDATE CONSTRAINT fk_deurs_company_line;
ALTER TABLE deurs VALIDATE CONSTRAINT fk_deurs_company_assignment;
ALTER TABLE deurs VALIDATE CONSTRAINT fk_deurs_company_previous_revision;

CREATE TABLE operational_command_idempotency (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id text NOT NULL REFERENCES companies(id),
  actor_key text NOT NULL,
  idempotency_key text NOT NULL,
  command_type text NOT NULL,
  target_aggregate_type text NOT NULL,
  target_aggregate_id text NOT NULL,
  payload_hash text NOT NULL,
  command_status text NOT NULL CHECK(command_status IN('COMPLETED','REJECTED')),
  safe_response jsonb NOT NULL,
  error_classification text,
  final_aggregate_version bigint,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL DEFAULT(clock_timestamp()+interval '30 days'),
  UNIQUE(company_id,actor_key,idempotency_key)
);
CREATE INDEX ix_operational_idempotency_target
  ON operational_command_idempotency(company_id,target_aggregate_type,target_aggregate_id);
ALTER TABLE operational_command_idempotency ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON operational_command_idempotency FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION begin_operational_command(
  command jsonb, command_type text, target_type text, target_id text,
  resolved_company_id text, resolved_actor_key text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,public,auth AS $$
DECLARE existing operational_command_idempotency; payload_hash text;
BEGIN
  IF resolved_company_id IS NULL OR resolved_actor_key IS NULL OR
     nullif(command->>'idempotencyKey','') IS NULL THEN
    RETURN jsonb_build_object('state','INVALID');
  END IF;
  payload_hash=pg_catalog.encode(extensions.digest((command-'commandId'-'idempotencyKey'-'token')::text,'sha256'),'hex');
  PERFORM pg_advisory_xact_lock(hashtextextended(resolved_company_id||':'||resolved_actor_key||':'||(command->>'idempotencyKey'),0));
  SELECT * INTO existing FROM operational_command_idempotency
  WHERE company_id=resolved_company_id AND actor_key=resolved_actor_key
    AND idempotency_key=command->>'idempotencyKey' FOR UPDATE;
  IF existing.id IS NULL THEN RETURN jsonb_build_object('state','NEW','payloadHash',payload_hash); END IF;
  IF existing.command_type<>command_type OR existing.payload_hash<>payload_hash THEN
    RETURN jsonb_build_object('state','MISMATCH');
  END IF;
  RETURN jsonb_build_object('state','REPLAY','response',existing.safe_response);
END $$;

CREATE OR REPLACE FUNCTION finish_operational_command(
  command jsonb, command_type text, target_type text, target_id text,
  resolved_company_id text, resolved_actor_key text, payload_hash text,
  response jsonb, final_version bigint DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,public,auth AS $$
BEGIN
  INSERT INTO operational_command_idempotency(
    company_id,actor_key,idempotency_key,command_type,target_aggregate_type,
    target_aggregate_id,payload_hash,command_status,safe_response,final_aggregate_version
  ) VALUES(
    resolved_company_id,resolved_actor_key,command->>'idempotencyKey',command_type,
    target_type,target_id,payload_hash,'COMPLETED',response,final_version
  );
  RETURN response;
END $$;
REVOKE ALL ON FUNCTION begin_operational_command(jsonb,text,text,text,text,text),
  finish_operational_command(jsonb,text,text,text,text,text,text,jsonb,bigint)
  FROM PUBLIC,anon,authenticated;

-- Remove permissive Phase B policies. RLS policies are OR-combined, so leaving
-- any USING(true) policy would nullify tenant isolation.
DROP POLICY IF EXISTS users_authenticated_read ON users;
DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'operators','customers','projects','equipment','assignments','rentals',
    'rental_equipment_lines','deurs','deur_events','billing_statements',
    'billing_statement_lines','audit_log','number_sequences'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I',table_name||'_authenticated_read',table_name);
  END LOOP;
END $$;
DROP POLICY IF EXISTS tenant_read ON billing_statement_lines;
CREATE POLICY tenant_read ON billing_statement_lines FOR SELECT TO authenticated
  USING(company_id=current_company_id());
DROP POLICY IF EXISTS tenant_read ON deur_review_history;
CREATE POLICY tenant_read ON deur_review_history FOR SELECT TO authenticated
  USING(company_id=current_company_id());

CREATE OR REPLACE FUNCTION compatibility_tenant_report()
RETURNS TABLE(table_name text,record_count bigint,missing_company_count bigint,cross_tenant_mismatch_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=erp,public AS $$
  SELECT 'rentals',count(*) FILTER(WHERE company_id='TENANT-LOCAL-001'),count(*) FILTER(WHERE company_id IS NULL),
    count(*) FILTER(WHERE customer_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM customers c WHERE c.id=rentals.customer_id AND c.company_id=rentals.company_id)) FROM rentals
  UNION ALL SELECT 'rental_equipment_lines',count(*) FILTER(WHERE company_id='TENANT-LOCAL-001'),count(*) FILTER(WHERE company_id IS NULL),
    count(*) FILTER(WHERE NOT EXISTS(SELECT 1 FROM rentals r WHERE r.id=rental_equipment_lines.rental_id AND r.company_id=rental_equipment_lines.company_id)) FROM rental_equipment_lines
  UNION ALL SELECT 'deurs',count(*) FILTER(WHERE company_id='TENANT-LOCAL-001'),count(*) FILTER(WHERE company_id IS NULL),
    count(*) FILTER(WHERE NOT EXISTS(SELECT 1 FROM rentals r WHERE r.id=deurs.rental_id AND r.company_id=deurs.company_id)) FROM deurs
$$;
REVOKE ALL ON FUNCTION compatibility_tenant_report() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION next_deur_number()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,public,auth AS $$
DECLARE sequence_value bigint; sequence_year integer=extract(year from clock_timestamp())::integer; tenant text=current_company_id();
BEGIN
  IF tenant IS NULL THEN RAISE EXCEPTION 'authenticated company required' USING ERRCODE='42501'; END IF;
  INSERT INTO number_sequences(company_id,scope,sequence_year,current_value,prefix)
  VALUES(tenant,'DEUR',sequence_year,1,'DEUR')
  ON CONFLICT(company_id,scope,sequence_year) DO UPDATE
  SET current_value=number_sequences.current_value+1,updated_at=clock_timestamp(),row_version=number_sequences.row_version+1
  RETURNING current_value INTO sequence_value;
  RETURN 'DEUR-'||sequence_year||'-'||lpad(sequence_value::text,6,'0');
END $$;

COMMIT;
