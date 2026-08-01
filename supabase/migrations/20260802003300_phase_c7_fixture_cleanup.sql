BEGIN;
SET search_path TO erp, pg_catalog;

CREATE OR REPLACE FUNCTION protect_deur_event_history()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = erp, pg_catalog
AS $$
DECLARE
  database_owner name;
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.is_open = true
     AND NEW.is_open = false
     AND (to_jsonb(NEW) - 'is_open') = (to_jsonb(OLD) - 'is_open') THEN
    RETURN NEW;
  END IF;

  SELECT pg_get_userbyid(datdba)
    INTO database_owner
    FROM pg_database
   WHERE datname = current_database();

  IF TG_OP = 'DELETE'
     AND session_user = database_owner
     AND current_user = database_owner
     AND current_setting('erp.c7_fixture_cleanup', true) = 'TENANT-UAT-C7-001'
     AND OLD.company_id = 'TENANT-UAT-C7-001' THEN
    RETURN OLD;
  END IF;

  RAISE EXCEPTION 'immutable historical record cannot be changed'
    USING ERRCODE = '55000';
END;
$$;

ALTER FUNCTION protect_deur_event_history() OWNER TO postgres;
REVOKE ALL ON FUNCTION protect_deur_event_history() FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION cleanup_c7_certification_fixture(
  target_tenant_id text,
  expected_tenant_code text,
  confirmation text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = erp, pg_catalog
AS $$
DECLARE
  database_owner name;
  deleted_events integer := 0;
  deleted_deurs integer := 0;
  deleted_lines integer := 0;
  deleted_rentals integer := 0;
  deleted_assignments integer := 0;
  deleted_users integer := 0;
  deleted_equipment integer := 0;
  deleted_operators integer := 0;
  deleted_projects integer := 0;
  deleted_customers integer := 0;
  deleted_references integer := 0;
  deleted_tenants integer := 0;
  affected_rows integer := 0;
BEGIN
  IF target_tenant_id IS DISTINCT FROM 'TENANT-UAT-C7-001'
     OR expected_tenant_code IS DISTINCT FROM 'TENANT-UAT-C7-001'
     OR confirmation IS DISTINCT FROM 'CONFIRM-C7-FIXTURE-CLEANUP' THEN
    RAISE EXCEPTION 'C7 cleanup rejected: exact allowlist confirmation required'
      USING ERRCODE = '22023';
  END IF;

  SELECT pg_get_userbyid(datdba)
    INTO database_owner
    FROM pg_database
   WHERE datname = current_database();

  IF session_user <> database_owner OR current_user <> database_owner THEN
    RAISE EXCEPTION 'C7 cleanup rejected: database-owner session required'
      USING ERRCODE = '42501';
  END IF;

  IF (SELECT count(*) FROM companies
       WHERE id = 'TENANT-LOCAL-001'
         AND code = 'LOCAL'
         AND environment_class = 'compatibility') <> 1 THEN
    RAISE EXCEPTION 'C7 cleanup rejected: protected local tenant invariant failed'
      USING ERRCODE = '55000';
  END IF;

  IF EXISTS (SELECT 1 FROM companies WHERE environment_class = 'approved') THEN
    RAISE EXCEPTION 'C7 cleanup rejected: approved environment detected'
      USING ERRCODE = '55000';
  END IF;

  IF EXISTS (
    SELECT 1 FROM companies
     WHERE id LIKE 'TENANT-UAT-C7-%'
       AND id <> 'TENANT-UAT-C7-001'
  ) THEN
    RAISE EXCEPTION 'C7 cleanup rejected: another C7 tenant exists'
      USING ERRCODE = '55000';
  END IF;

  IF EXISTS (
    SELECT 1 FROM companies
     WHERE id = 'TENANT-UAT-C7-001'
       AND (code <> 'TENANT-UAT-C7-001' OR environment_class <> 'test')
  ) THEN
    RAISE EXCEPTION 'C7 cleanup rejected: retained tenant identity mismatch'
      USING ERRCODE = '55000';
  END IF;

  IF EXISTS (SELECT 1 FROM customers WHERE company_id = target_tenant_id AND id <> 'CUST-UAT-C7-001')
     OR EXISTS (SELECT 1 FROM projects WHERE company_id = target_tenant_id AND id <> 'PRJ-UAT-C7-001')
     OR EXISTS (SELECT 1 FROM operators WHERE company_id = target_tenant_id AND id <> 'OPR-UAT-C7-001')
     OR EXISTS (SELECT 1 FROM equipment WHERE company_id = target_tenant_id AND id <> 'EQP-UAT-C7-001')
     OR EXISTS (SELECT 1 FROM assignments WHERE company_id = target_tenant_id AND id <> 'ASN-UAT-C7-001')
     OR EXISTS (SELECT 1 FROM rentals WHERE company_id = target_tenant_id AND id <> 'RENT-UAT-C7-001')
     OR EXISTS (SELECT 1 FROM rental_equipment_lines WHERE company_id = target_tenant_id AND id <> 'LINE-UAT-C7-001')
     OR EXISTS (SELECT 1 FROM deurs WHERE company_id = target_tenant_id AND id <> 'DEUR-UAT-C7-001')
     OR EXISTS (
       SELECT 1 FROM deur_events
        WHERE company_id = target_tenant_id
          AND id NOT IN ('EVENT-UAT-C7-001', 'EVENT-UAT-C7-002', 'EVENT-UAT-C7-003', 'EVENT-UAT-C7-004')
     ) THEN
    RAISE EXCEPTION 'C7 cleanup rejected: fixture contains records outside the allowlist'
      USING ERRCODE = '55000';
  END IF;

  IF EXISTS (SELECT 1 FROM billing_statements WHERE company_id = target_tenant_id)
     OR EXISTS (SELECT 1 FROM billing_statement_lines WHERE company_id = target_tenant_id)
     OR EXISTS (SELECT 1 FROM customer_review_requests WHERE company_id = target_tenant_id)
     OR EXISTS (SELECT 1 FROM customer_review_outcomes WHERE company_id = target_tenant_id)
     OR EXISTS (SELECT 1 FROM customer_correction_requests WHERE company_id = target_tenant_id)
     OR EXISTS (SELECT 1 FROM manager_review_requests WHERE company_id = target_tenant_id)
     OR EXISTS (SELECT 1 FROM manager_review_outcomes WHERE company_id = target_tenant_id)
     OR EXISTS (SELECT 1 FROM manager_correction_requests WHERE company_id = target_tenant_id)
     OR EXISTS (SELECT 1 FROM notification_outbox WHERE company_id = target_tenant_id)
     OR EXISTS (SELECT 1 FROM notification_delivery_attempts WHERE company_id = target_tenant_id)
     OR EXISTS (SELECT 1 FROM deur_meter_checkpoints WHERE company_id = target_tenant_id)
     OR EXISTS (SELECT 1 FROM deur_review_history WHERE company_id = target_tenant_id)
     OR EXISTS (SELECT 1 FROM audit_log WHERE company_id = target_tenant_id)
     OR EXISTS (SELECT 1 FROM deur_command_idempotency WHERE company_id = target_tenant_id)
     OR EXISTS (SELECT 1 FROM operational_command_idempotency WHERE company_id = target_tenant_id)
     OR EXISTS (SELECT 1 FROM number_sequences WHERE company_id = target_tenant_id)
     OR EXISTS (SELECT 1 FROM recovery_compensations WHERE company_id = target_tenant_id)
     OR EXISTS (SELECT 1 FROM rental_contracts WHERE rental_id = 'RENT-UAT-C7-001')
     OR EXISTS (SELECT 1 FROM commercial_snapshots WHERE rental_id = 'RENT-UAT-C7-001')
     OR EXISTS (SELECT 1 FROM rental_shift_window_snapshots WHERE rental_id = 'RENT-UAT-C7-001')
     OR EXISTS (SELECT 1 FROM deur_activity_logs WHERE deur_id = 'DEUR-UAT-C7-001')
     OR EXISTS (SELECT 1 FROM equipment_history WHERE equipment_id = 'EQP-UAT-C7-001')
     OR EXISTS (SELECT 1 FROM equipment_daily_logs WHERE equipment_id = 'EQP-UAT-C7-001')
     OR EXISTS (SELECT 1 FROM maintenance_records WHERE equipment_id = 'EQP-UAT-C7-001') THEN
    RAISE EXCEPTION 'C7 cleanup rejected: downstream business evidence exists'
      USING ERRCODE = '55000';
  END IF;

  PERFORM set_config('erp.c7_fixture_cleanup', target_tenant_id, true);

  DELETE FROM deur_events
   WHERE company_id = target_tenant_id
     AND id IN ('EVENT-UAT-C7-001', 'EVENT-UAT-C7-002', 'EVENT-UAT-C7-003', 'EVENT-UAT-C7-004');
  GET DIAGNOSTICS deleted_events = ROW_COUNT;

  DELETE FROM deurs WHERE company_id = target_tenant_id AND id = 'DEUR-UAT-C7-001';
  GET DIAGNOSTICS deleted_deurs = ROW_COUNT;
  DELETE FROM rental_equipment_lines WHERE company_id = target_tenant_id AND id = 'LINE-UAT-C7-001';
  GET DIAGNOSTICS deleted_lines = ROW_COUNT;
  DELETE FROM rentals WHERE company_id = target_tenant_id AND id = 'RENT-UAT-C7-001';
  GET DIAGNOSTICS deleted_rentals = ROW_COUNT;
  DELETE FROM assignments WHERE company_id = target_tenant_id AND id = 'ASN-UAT-C7-001';
  GET DIAGNOSTICS deleted_assignments = ROW_COUNT;
  DELETE FROM users WHERE company_id = target_tenant_id;
  GET DIAGNOSTICS deleted_users = ROW_COUNT;
  DELETE FROM equipment WHERE company_id = target_tenant_id AND id = 'EQP-UAT-C7-001';
  GET DIAGNOSTICS deleted_equipment = ROW_COUNT;
  DELETE FROM operators WHERE company_id = target_tenant_id AND id = 'OPR-UAT-C7-001';
  GET DIAGNOSTICS deleted_operators = ROW_COUNT;
  DELETE FROM projects WHERE company_id = target_tenant_id AND id = 'PRJ-UAT-C7-001';
  GET DIAGNOSTICS deleted_projects = ROW_COUNT;
  DELETE FROM customers WHERE company_id = target_tenant_id AND id = 'CUST-UAT-C7-001';
  GET DIAGNOSTICS deleted_customers = ROW_COUNT;

  DELETE FROM equipment_statuses WHERE id IN ('REF-UAT-C7-AVAILABLE', 'REF-UAT-C7-ASSIGNED');
  GET DIAGNOSTICS deleted_references = ROW_COUNT;
  DELETE FROM equipment_types WHERE id = 'REF-UAT-C7-TYPE';
  GET DIAGNOSTICS affected_rows = ROW_COUNT;
  deleted_references := deleted_references + affected_rows;
  DELETE FROM equipment_categories WHERE id = 'REF-UAT-C7-CATEGORY';
  GET DIAGNOSTICS affected_rows = ROW_COUNT;
  deleted_references := deleted_references + affected_rows;

  DELETE FROM companies
   WHERE id = target_tenant_id
     AND code = expected_tenant_code
     AND environment_class = 'test';
  GET DIAGNOSTICS deleted_tenants = ROW_COUNT;

  RETURN jsonb_build_object(
    'events', deleted_events,
    'deurs', deleted_deurs,
    'lines', deleted_lines,
    'rentals', deleted_rentals,
    'assignments', deleted_assignments,
    'users', deleted_users,
    'equipment', deleted_equipment,
    'operators', deleted_operators,
    'projects', deleted_projects,
    'customers', deleted_customers,
    'reference_rows', deleted_references,
    'tenants', deleted_tenants
  );
END;
$$;

ALTER FUNCTION cleanup_c7_certification_fixture(text, text, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION cleanup_c7_certification_fixture(text, text, text)
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION cleanup_c7_certification_fixture(text, text, text) IS
  'Owner-only, exact-allowlist cleanup for disposable TENANT-UAT-C7-001 certification data.';

COMMIT;
