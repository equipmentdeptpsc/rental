BEGIN;
SET search_path TO erp, pg_catalog;

CREATE OR REPLACE FUNCTION protect_deur_event_history()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = erp, pg_catalog
AS $$
DECLARE database_owner name;
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.is_open = true
     AND NEW.is_open = false
     AND (to_jsonb(NEW) - 'is_open') = (to_jsonb(OLD) - 'is_open') THEN
    RETURN NEW;
  END IF;

  SELECT pg_get_userbyid(datdba) INTO database_owner
    FROM pg_database WHERE datname = current_database();

  IF TG_OP = 'DELETE'
     AND session_user = database_owner
     AND current_user = database_owner
     AND (
       (current_setting('erp.c7_fixture_cleanup', true) = 'TENANT-UAT-C7-001'
         AND OLD.company_id = 'TENANT-UAT-C7-001')
       OR
       (current_setting('erp.c7_release_fixture_cleanup', true) = 'TENANT-UAT-C7-RELEASE-001'
         AND OLD.company_id = 'TENANT-UAT-C7-RELEASE-001')
     ) THEN
    RETURN OLD;
  END IF;

  RAISE EXCEPTION 'immutable historical record cannot be changed'
    USING ERRCODE = '55000';
END;
$$;

ALTER FUNCTION protect_deur_event_history() OWNER TO postgres;
REVOKE ALL ON FUNCTION protect_deur_event_history() FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION cleanup_c7_release_certification_fixture(
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
  removed jsonb := '{}'::jsonb;
  affected integer := 0;
BEGIN
  IF target_tenant_id IS DISTINCT FROM 'TENANT-UAT-C7-RELEASE-001'
     OR expected_tenant_code IS DISTINCT FROM 'TENANT-UAT-C7-RELEASE-001'
     OR confirmation IS DISTINCT FROM 'CONFIRM-C7-RELEASE-CLEANUP' THEN
    RAISE EXCEPTION 'C7 release cleanup rejected: exact allowlist confirmation required'
      USING ERRCODE = '22023';
  END IF;

  IF target_tenant_id = 'TENANT-LOCAL-001' THEN
    RAISE EXCEPTION 'C7 release cleanup rejected: protected local tenant'
      USING ERRCODE = '22023';
  END IF;

  SELECT pg_get_userbyid(datdba) INTO database_owner
    FROM pg_database WHERE datname = current_database();
  IF session_user <> database_owner OR current_user <> database_owner THEN
    RAISE EXCEPTION 'C7 release cleanup rejected: database-owner session required'
      USING ERRCODE = '42501';
  END IF;

  IF (SELECT count(*) FROM companies
       WHERE id = 'TENANT-LOCAL-001' AND code = 'LOCAL' AND environment_class = 'compatibility') <> 1 THEN
    RAISE EXCEPTION 'C7 release cleanup rejected: protected local tenant invariant failed'
      USING ERRCODE = '55000';
  END IF;
  IF EXISTS (SELECT 1 FROM companies WHERE environment_class = 'approved') THEN
    RAISE EXCEPTION 'C7 release cleanup rejected: approved environment detected'
      USING ERRCODE = '55000';
  END IF;
  IF EXISTS (SELECT 1 FROM companies WHERE id = target_tenant_id
    AND (code <> expected_tenant_code OR environment_class <> 'test')) THEN
    RAISE EXCEPTION 'C7 release cleanup rejected: retained tenant identity mismatch'
      USING ERRCODE = '55000';
  END IF;

  PERFORM set_config('erp.c7_release_fixture_cleanup', target_tenant_id, true);

  DELETE FROM notification_delivery_attempts WHERE company_id = target_tenant_id;
  GET DIAGNOSTICS affected = ROW_COUNT; removed := removed || jsonb_build_object('notification_delivery_attempts', affected);
  DELETE FROM notification_outbox WHERE company_id = target_tenant_id;
  GET DIAGNOSTICS affected = ROW_COUNT; removed := removed || jsonb_build_object('notification_intents', affected);

  DELETE FROM customer_review_outcomes WHERE company_id = target_tenant_id;
  GET DIAGNOSTICS affected = ROW_COUNT; removed := removed || jsonb_build_object('customer_review_outcomes', affected);
  DELETE FROM customer_correction_requests WHERE company_id = target_tenant_id;
  GET DIAGNOSTICS affected = ROW_COUNT; removed := removed || jsonb_build_object('customer_corrections', affected);
  DELETE FROM customer_review_requests WHERE company_id = target_tenant_id;
  GET DIAGNOSTICS affected = ROW_COUNT; removed := removed || jsonb_build_object('customer_review_requests', affected);
  DELETE FROM manager_review_outcomes WHERE company_id = target_tenant_id;
  GET DIAGNOSTICS affected = ROW_COUNT; removed := removed || jsonb_build_object('manager_review_outcomes', affected);
  DELETE FROM manager_correction_requests WHERE company_id = target_tenant_id;
  GET DIAGNOSTICS affected = ROW_COUNT; removed := removed || jsonb_build_object('manager_corrections', affected);
  DELETE FROM manager_review_requests WHERE company_id = target_tenant_id;
  GET DIAGNOSTICS affected = ROW_COUNT; removed := removed || jsonb_build_object('manager_review_requests', affected);

  DELETE FROM recovery_compensations WHERE company_id = target_tenant_id;
  GET DIAGNOSTICS affected = ROW_COUNT; removed := removed || jsonb_build_object('recoveries', affected);
  DELETE FROM deur_activity_logs WHERE deur_id IN (SELECT id FROM deurs WHERE company_id = target_tenant_id);
  GET DIAGNOSTICS affected = ROW_COUNT; removed := removed || jsonb_build_object('deur_activity_logs', affected);
  DELETE FROM deur_meter_checkpoints WHERE company_id = target_tenant_id;
  GET DIAGNOSTICS affected = ROW_COUNT; removed := removed || jsonb_build_object('deur_checkpoints', affected);
  DELETE FROM deur_review_history WHERE company_id = target_tenant_id;
  GET DIAGNOSTICS affected = ROW_COUNT; removed := removed || jsonb_build_object('deur_review_history', affected);
  DELETE FROM billing_statement_lines WHERE company_id = target_tenant_id;
  GET DIAGNOSTICS affected = ROW_COUNT; removed := removed || jsonb_build_object('billing_lines', affected);
  DELETE FROM deur_events WHERE company_id = target_tenant_id;
  GET DIAGNOSTICS affected = ROW_COUNT; removed := removed || jsonb_build_object('deur_events', affected);
  DELETE FROM deurs WHERE company_id = target_tenant_id;
  GET DIAGNOSTICS affected = ROW_COUNT; removed := removed || jsonb_build_object('deurs', affected);
  DELETE FROM billing_statements WHERE company_id = target_tenant_id;
  GET DIAGNOSTICS affected = ROW_COUNT; removed := removed || jsonb_build_object('billing_statements', affected);

  DELETE FROM rental_contracts WHERE rental_id IN (SELECT id FROM rentals WHERE company_id = target_tenant_id);
  GET DIAGNOSTICS affected = ROW_COUNT; removed := removed || jsonb_build_object('rental_contracts', affected);
  DELETE FROM commercial_snapshots WHERE rental_id IN (SELECT id FROM rentals WHERE company_id = target_tenant_id);
  GET DIAGNOSTICS affected = ROW_COUNT; removed := removed || jsonb_build_object('commercial_snapshots', affected);
  DELETE FROM rental_shift_window_snapshots WHERE rental_id IN (SELECT id FROM rentals WHERE company_id = target_tenant_id);
  GET DIAGNOSTICS affected = ROW_COUNT; removed := removed || jsonb_build_object('shift_snapshots', affected);

  DELETE FROM audit_log WHERE company_id = target_tenant_id;
  GET DIAGNOSTICS affected = ROW_COUNT; removed := removed || jsonb_build_object('audit_rows', affected);
  DELETE FROM deur_command_idempotency WHERE company_id = target_tenant_id;
  GET DIAGNOSTICS affected = ROW_COUNT; removed := removed || jsonb_build_object('deur_commands', affected);
  DELETE FROM operational_command_idempotency WHERE company_id = target_tenant_id;
  GET DIAGNOSTICS affected = ROW_COUNT; removed := removed || jsonb_build_object('operational_commands', affected);
  DELETE FROM number_sequences WHERE company_id = target_tenant_id;
  GET DIAGNOSTICS affected = ROW_COUNT; removed := removed || jsonb_build_object('number_sequences', affected);

  DELETE FROM equipment_history WHERE equipment_id IN (SELECT id FROM equipment WHERE company_id = target_tenant_id);
  GET DIAGNOSTICS affected = ROW_COUNT; removed := removed || jsonb_build_object('equipment_history', affected);
  DELETE FROM equipment_daily_logs WHERE equipment_id IN (SELECT id FROM equipment WHERE company_id = target_tenant_id);
  GET DIAGNOSTICS affected = ROW_COUNT; removed := removed || jsonb_build_object('daily_logs', affected);
  DELETE FROM maintenance_records WHERE equipment_id IN (SELECT id FROM equipment WHERE company_id = target_tenant_id);
  GET DIAGNOSTICS affected = ROW_COUNT; removed := removed || jsonb_build_object('maintenance_rows', affected);

  DELETE FROM rental_equipment_lines WHERE company_id = target_tenant_id;
  GET DIAGNOSTICS affected = ROW_COUNT; removed := removed || jsonb_build_object('rental_lines', affected);
  DELETE FROM rentals WHERE company_id = target_tenant_id;
  GET DIAGNOSTICS affected = ROW_COUNT; removed := removed || jsonb_build_object('rentals', affected);
  DELETE FROM assignments WHERE company_id = target_tenant_id;
  GET DIAGNOSTICS affected = ROW_COUNT; removed := removed || jsonb_build_object('assignments', affected);
  DELETE FROM users WHERE company_id = target_tenant_id;
  GET DIAGNOSTICS affected = ROW_COUNT; removed := removed || jsonb_build_object('application_users', affected);
  DELETE FROM equipment WHERE company_id = target_tenant_id;
  GET DIAGNOSTICS affected = ROW_COUNT; removed := removed || jsonb_build_object('equipment', affected);
  DELETE FROM operators WHERE company_id = target_tenant_id;
  GET DIAGNOSTICS affected = ROW_COUNT; removed := removed || jsonb_build_object('operators', affected);
  DELETE FROM projects WHERE company_id = target_tenant_id;
  GET DIAGNOSTICS affected = ROW_COUNT; removed := removed || jsonb_build_object('projects', affected);
  DELETE FROM customers WHERE company_id = target_tenant_id;
  GET DIAGNOSTICS affected = ROW_COUNT; removed := removed || jsonb_build_object('customers', affected);

  DELETE FROM equipment_statuses r WHERE r.id LIKE 'REF-UAT-C7-RELEASE-%'
    AND NOT EXISTS (SELECT 1 FROM equipment e WHERE e.status_id = r.id);
  GET DIAGNOSTICS affected = ROW_COUNT; removed := removed || jsonb_build_object('release_reference_rows', affected);

  DELETE FROM companies WHERE id = target_tenant_id
    AND code = expected_tenant_code AND environment_class = 'test';
  GET DIAGNOSTICS affected = ROW_COUNT; removed := removed || jsonb_build_object('tenants', affected);

  RETURN removed;
END;
$$;

ALTER FUNCTION cleanup_c7_release_certification_fixture(text, text, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION cleanup_c7_release_certification_fixture(text, text, text)
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION cleanup_c7_release_certification_fixture(text, text, text) IS
  'Owner-only exact cleanup for disposable TENANT-UAT-C7-RELEASE-001 certification data; returns aggregate counts only.';

COMMIT;
