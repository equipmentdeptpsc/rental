BEGIN;
SET search_path TO erp, pg_catalog;

CREATE OR REPLACE FUNCTION protect_deur_event_history() RETURNS trigger LANGUAGE plpgsql SET search_path=erp,pg_catalog AS $$
DECLARE database_owner name;
BEGIN
  IF TG_OP='UPDATE' AND OLD.is_open=true AND NEW.is_open=false AND (to_jsonb(NEW)-'is_open')=(to_jsonb(OLD)-'is_open') THEN RETURN NEW; END IF;
  SELECT pg_get_userbyid(datdba) INTO database_owner FROM pg_database WHERE datname=current_database();
  IF TG_OP='DELETE' AND session_user=database_owner AND current_user=database_owner AND (
    (current_setting('erp.c7_fixture_cleanup',true)='TENANT-UAT-C7-001' AND OLD.company_id='TENANT-UAT-C7-001') OR
    (current_setting('erp.c7_release_fixture_cleanup',true)='TENANT-UAT-C7-RELEASE-001' AND OLD.company_id='TENANT-UAT-C7-RELEASE-001') OR
    (current_setting('erp.c7_normalization_fixture_cleanup',true)='TENANT-UAT-C7-NORMALIZE-001' AND OLD.company_id='TENANT-UAT-C7-NORMALIZE-001')
  ) THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'immutable historical record cannot be changed' USING ERRCODE='55000';
END $$;

CREATE OR REPLACE FUNCTION reject_immutable_change() RETURNS trigger LANGUAGE plpgsql SET search_path=erp,pg_catalog AS $$
DECLARE database_owner name; target_company text; row_data jsonb=to_jsonb(OLD);
BEGIN
  SELECT pg_get_userbyid(datdba) INTO database_owner FROM pg_database WHERE datname=current_database(); target_company=row_data->>'company_id';
  IF target_company IS NULL AND TG_TABLE_NAME='commercial_snapshots' THEN SELECT company_id INTO target_company FROM rentals WHERE id=row_data->>'rental_id';
  ELSIF target_company IS NULL AND TG_TABLE_NAME='deur_activity_logs' THEN SELECT company_id INTO target_company FROM deurs WHERE id=row_data->>'deur_id';
  ELSIF target_company IS NULL AND TG_TABLE_NAME='equipment_history' THEN SELECT company_id INTO target_company FROM equipment WHERE id=row_data->>'equipment_id'; END IF;
  IF TG_OP='DELETE' AND TG_TABLE_SCHEMA='erp' AND TG_TABLE_NAME IN('commercial_snapshots','deur_activity_logs','deur_review_history','equipment_history','audit_log','recovery_compensations')
    AND session_user=database_owner AND current_user=database_owner AND (
      (current_setting('erp.c7_release_fixture_cleanup',true)='TENANT-UAT-C7-RELEASE-001' AND target_company='TENANT-UAT-C7-RELEASE-001') OR
      (current_setting('erp.c7_normalization_fixture_cleanup',true)='TENANT-UAT-C7-NORMALIZE-001' AND target_company='TENANT-UAT-C7-NORMALIZE-001')
    ) THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'immutable historical record cannot be changed' USING ERRCODE='55000';
END $$;

CREATE OR REPLACE FUNCTION reject_customer_review_evidence_change() RETURNS trigger LANGUAGE plpgsql SET search_path=erp,pg_catalog AS $$
DECLARE database_owner name; BEGIN SELECT pg_get_userbyid(datdba) INTO database_owner FROM pg_database WHERE datname=current_database();
 IF TG_OP='DELETE' AND session_user=database_owner AND current_user=database_owner AND ((current_setting('erp.c7_release_fixture_cleanup',true)='TENANT-UAT-C7-RELEASE-001' AND OLD.company_id='TENANT-UAT-C7-RELEASE-001') OR (current_setting('erp.c7_normalization_fixture_cleanup',true)='TENANT-UAT-C7-NORMALIZE-001' AND OLD.company_id='TENANT-UAT-C7-NORMALIZE-001')) THEN RETURN OLD; END IF;
 RAISE EXCEPTION 'customer review evidence is immutable' USING ERRCODE='55000'; END $$;
CREATE OR REPLACE FUNCTION reject_manager_review_outcome_change() RETURNS trigger LANGUAGE plpgsql SET search_path=erp,pg_catalog AS $$
DECLARE database_owner name; BEGIN SELECT pg_get_userbyid(datdba) INTO database_owner FROM pg_database WHERE datname=current_database();
 IF TG_OP='DELETE' AND session_user=database_owner AND current_user=database_owner AND ((current_setting('erp.c7_release_fixture_cleanup',true)='TENANT-UAT-C7-RELEASE-001' AND OLD.company_id='TENANT-UAT-C7-RELEASE-001') OR (current_setting('erp.c7_normalization_fixture_cleanup',true)='TENANT-UAT-C7-NORMALIZE-001' AND OLD.company_id='TENANT-UAT-C7-NORMALIZE-001')) THEN RETURN OLD; END IF;
 RAISE EXCEPTION 'manager review evidence is immutable' USING ERRCODE='55000'; END $$;
CREATE OR REPLACE FUNCTION reject_terminal_notification_change() RETURNS trigger LANGUAGE plpgsql SET search_path=erp,pg_catalog AS $$
DECLARE database_owner name; BEGIN SELECT pg_get_userbyid(datdba) INTO database_owner FROM pg_database WHERE datname=current_database();
 IF TG_OP='DELETE' AND session_user=database_owner AND current_user=database_owner AND ((current_setting('erp.c7_release_fixture_cleanup',true)='TENANT-UAT-C7-RELEASE-001' AND OLD.company_id='TENANT-UAT-C7-RELEASE-001') OR (current_setting('erp.c7_normalization_fixture_cleanup',true)='TENANT-UAT-C7-NORMALIZE-001' AND OLD.company_id='TENANT-UAT-C7-NORMALIZE-001')) THEN RETURN OLD; END IF;
 IF OLD.status='ProviderAccepted' AND NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'provider-accepted notification evidence is immutable' USING ERRCODE='55000'; END IF; RETURN NEW; END $$;
CREATE OR REPLACE FUNCTION protect_statement_line() RETURNS trigger LANGUAGE plpgsql SET search_path=erp,pg_catalog AS $$
DECLARE state billing_approval_status; database_owner name; BEGIN SELECT pg_get_userbyid(datdba) INTO database_owner FROM pg_database WHERE datname=current_database();
 IF TG_OP='DELETE' AND session_user=database_owner AND current_user=database_owner AND ((current_setting('erp.c7_release_fixture_cleanup',true)='TENANT-UAT-C7-RELEASE-001' AND OLD.company_id='TENANT-UAT-C7-RELEASE-001') OR (current_setting('erp.c7_normalization_fixture_cleanup',true)='TENANT-UAT-C7-NORMALIZE-001' AND OLD.company_id='TENANT-UAT-C7-NORMALIZE-001')) THEN RETURN OLD; END IF;
 SELECT approval_status INTO state FROM billing_statements WHERE id=coalesce(OLD.billing_statement_id,NEW.billing_statement_id); IF state<>'Draft' THEN RAISE EXCEPTION 'non-draft billing evidence is immutable' USING ERRCODE='55000'; END IF; IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW; END $$;

CREATE OR REPLACE FUNCTION cleanup_c7_normalization_fixture(target_tenant_id text,expected_tenant_code text,confirmation text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,pg_catalog AS $$
DECLARE database_owner name; removed jsonb='{}'::jsonb; affected integer;
BEGIN
  IF target_tenant_id IS DISTINCT FROM 'TENANT-UAT-C7-NORMALIZE-001' OR expected_tenant_code IS DISTINCT FROM 'TENANT-UAT-C7-NORMALIZE-001' OR confirmation IS DISTINCT FROM 'CONFIRM-C7-NORMALIZATION-CLEANUP' THEN RAISE EXCEPTION 'C7 normalization cleanup rejected: exact allowlist confirmation required' USING ERRCODE='22023'; END IF;
  SELECT pg_get_userbyid(datdba) INTO database_owner FROM pg_database WHERE datname=current_database();
  IF session_user<>database_owner OR current_user<>database_owner THEN RAISE EXCEPTION 'C7 normalization cleanup rejected: database-owner session required' USING ERRCODE='42501'; END IF;
  IF (SELECT count(*) FROM companies WHERE id='TENANT-LOCAL-001' AND code='LOCAL' AND environment_class='compatibility')<>1 THEN RAISE EXCEPTION 'protected local tenant invariant failed' USING ERRCODE='55000'; END IF;
  IF EXISTS(SELECT 1 FROM companies WHERE environment_class='approved') THEN RAISE EXCEPTION 'approved environment detected' USING ERRCODE='55000'; END IF;
  IF EXISTS(SELECT 1 FROM companies WHERE id=target_tenant_id AND (code<>expected_tenant_code OR environment_class<>'test')) THEN RAISE EXCEPTION 'normalization tenant identity mismatch' USING ERRCODE='55000'; END IF;
  PERFORM set_config('erp.c7_normalization_fixture_cleanup',target_tenant_id,true);

  DELETE FROM notification_delivery_attempts WHERE company_id=target_tenant_id; GET DIAGNOSTICS affected=ROW_COUNT; removed=removed||jsonb_build_object('notification_delivery_attempts',affected);
  DELETE FROM notification_outbox WHERE company_id=target_tenant_id; GET DIAGNOSTICS affected=ROW_COUNT; removed=removed||jsonb_build_object('notification_intents',affected);
  DELETE FROM customer_review_outcomes WHERE company_id=target_tenant_id; GET DIAGNOSTICS affected=ROW_COUNT; removed=removed||jsonb_build_object('customer_review_outcomes',affected);
  DELETE FROM customer_correction_requests WHERE company_id=target_tenant_id; GET DIAGNOSTICS affected=ROW_COUNT; removed=removed||jsonb_build_object('customer_corrections',affected);
  DELETE FROM customer_review_requests WHERE company_id=target_tenant_id; GET DIAGNOSTICS affected=ROW_COUNT; removed=removed||jsonb_build_object('customer_review_requests',affected);
  DELETE FROM manager_review_outcomes WHERE company_id=target_tenant_id; GET DIAGNOSTICS affected=ROW_COUNT; removed=removed||jsonb_build_object('manager_review_outcomes',affected);
  DELETE FROM manager_correction_requests WHERE company_id=target_tenant_id; GET DIAGNOSTICS affected=ROW_COUNT; removed=removed||jsonb_build_object('manager_corrections',affected);
  DELETE FROM manager_review_requests WHERE company_id=target_tenant_id; GET DIAGNOSTICS affected=ROW_COUNT; removed=removed||jsonb_build_object('manager_review_requests',affected);
  DELETE FROM recovery_compensations WHERE company_id=target_tenant_id; GET DIAGNOSTICS affected=ROW_COUNT; removed=removed||jsonb_build_object('recoveries',affected);
  DELETE FROM deur_activity_logs WHERE deur_id IN(SELECT id FROM deurs WHERE company_id=target_tenant_id); GET DIAGNOSTICS affected=ROW_COUNT; removed=removed||jsonb_build_object('deur_activity_logs',affected);
  DELETE FROM deur_meter_checkpoints WHERE company_id=target_tenant_id; GET DIAGNOSTICS affected=ROW_COUNT; removed=removed||jsonb_build_object('deur_checkpoints',affected);
  DELETE FROM deur_review_history WHERE company_id=target_tenant_id; GET DIAGNOSTICS affected=ROW_COUNT; removed=removed||jsonb_build_object('deur_review_history',affected);
  DELETE FROM billing_statement_lines WHERE company_id=target_tenant_id; GET DIAGNOSTICS affected=ROW_COUNT; removed=removed||jsonb_build_object('billing_lines',affected);
  DELETE FROM deur_events WHERE company_id=target_tenant_id; GET DIAGNOSTICS affected=ROW_COUNT; removed=removed||jsonb_build_object('deur_events',affected);
  DELETE FROM deurs WHERE company_id=target_tenant_id; GET DIAGNOSTICS affected=ROW_COUNT; removed=removed||jsonb_build_object('deurs',affected);
  DELETE FROM collections WHERE billing_statement_id IN(SELECT id FROM billing_statements WHERE company_id=target_tenant_id); GET DIAGNOSTICS affected=ROW_COUNT; removed=removed||jsonb_build_object('collections',affected);
  DELETE FROM billing_statements WHERE company_id=target_tenant_id; GET DIAGNOSTICS affected=ROW_COUNT; removed=removed||jsonb_build_object('billing_statements',affected);
  DELETE FROM rental_contracts WHERE rental_id IN(SELECT id FROM rentals WHERE company_id=target_tenant_id); GET DIAGNOSTICS affected=ROW_COUNT; removed=removed||jsonb_build_object('rental_contracts',affected);
  DELETE FROM commercial_snapshots WHERE rental_id IN(SELECT id FROM rentals WHERE company_id=target_tenant_id); GET DIAGNOSTICS affected=ROW_COUNT; removed=removed||jsonb_build_object('commercial_snapshots',affected);
  DELETE FROM rental_shift_window_snapshots WHERE rental_id IN(SELECT id FROM rentals WHERE company_id=target_tenant_id); GET DIAGNOSTICS affected=ROW_COUNT; removed=removed||jsonb_build_object('shift_snapshots',affected);
  DELETE FROM audit_log WHERE company_id=target_tenant_id; GET DIAGNOSTICS affected=ROW_COUNT; removed=removed||jsonb_build_object('audit_rows',affected);
  DELETE FROM deur_command_idempotency WHERE company_id=target_tenant_id; GET DIAGNOSTICS affected=ROW_COUNT; removed=removed||jsonb_build_object('deur_commands',affected);
  DELETE FROM operational_command_idempotency WHERE company_id=target_tenant_id; GET DIAGNOSTICS affected=ROW_COUNT; removed=removed||jsonb_build_object('operational_commands',affected);
  DELETE FROM number_sequences WHERE company_id=target_tenant_id; GET DIAGNOSTICS affected=ROW_COUNT; removed=removed||jsonb_build_object('number_sequences',affected);
  DELETE FROM equipment_history WHERE equipment_id IN(SELECT id FROM equipment WHERE company_id=target_tenant_id); GET DIAGNOSTICS affected=ROW_COUNT; removed=removed||jsonb_build_object('equipment_history',affected);
  DELETE FROM equipment_daily_logs WHERE equipment_id IN(SELECT id FROM equipment WHERE company_id=target_tenant_id); GET DIAGNOSTICS affected=ROW_COUNT; removed=removed||jsonb_build_object('daily_logs',affected);
  DELETE FROM maintenance_records WHERE equipment_id IN(SELECT id FROM equipment WHERE company_id=target_tenant_id); GET DIAGNOSTICS affected=ROW_COUNT; removed=removed||jsonb_build_object('maintenance_rows',affected);
  DELETE FROM rental_equipment_lines WHERE company_id=target_tenant_id; GET DIAGNOSTICS affected=ROW_COUNT; removed=removed||jsonb_build_object('rental_lines',affected);
  DELETE FROM rentals WHERE company_id=target_tenant_id; GET DIAGNOSTICS affected=ROW_COUNT; removed=removed||jsonb_build_object('rentals',affected);
  DELETE FROM assignments WHERE company_id=target_tenant_id; GET DIAGNOSTICS affected=ROW_COUNT; removed=removed||jsonb_build_object('assignments',affected);
  DELETE FROM users WHERE company_id=target_tenant_id; GET DIAGNOSTICS affected=ROW_COUNT; removed=removed||jsonb_build_object('application_users',affected);
  DELETE FROM equipment WHERE company_id=target_tenant_id; GET DIAGNOSTICS affected=ROW_COUNT; removed=removed||jsonb_build_object('equipment',affected);
  DELETE FROM operators WHERE company_id=target_tenant_id; GET DIAGNOSTICS affected=ROW_COUNT; removed=removed||jsonb_build_object('operators',affected);
  DELETE FROM projects WHERE company_id=target_tenant_id; GET DIAGNOSTICS affected=ROW_COUNT; removed=removed||jsonb_build_object('projects',affected);
  DELETE FROM customers WHERE company_id=target_tenant_id; GET DIAGNOSTICS affected=ROW_COUNT; removed=removed||jsonb_build_object('customers',affected);
  DELETE FROM equipment_statuses WHERE id LIKE 'REF-UAT-C7-NORMALIZE-%' AND NOT EXISTS(SELECT 1 FROM equipment e WHERE e.status_id=equipment_statuses.id); GET DIAGNOSTICS affected=ROW_COUNT; removed=removed||jsonb_build_object('normalization_reference_rows',affected);
  DELETE FROM companies WHERE id=target_tenant_id AND code=expected_tenant_code AND environment_class='test'; GET DIAGNOSTICS affected=ROW_COUNT; removed=removed||jsonb_build_object('tenants',affected);
  RETURN removed;
END $$;

ALTER FUNCTION erp.protect_deur_event_history() OWNER TO postgres;
ALTER FUNCTION erp.reject_immutable_change() OWNER TO postgres;
ALTER FUNCTION erp.reject_customer_review_evidence_change() OWNER TO postgres;
ALTER FUNCTION erp.reject_manager_review_outcome_change() OWNER TO postgres;
ALTER FUNCTION erp.reject_terminal_notification_change() OWNER TO postgres;
ALTER FUNCTION erp.protect_statement_line() OWNER TO postgres;
ALTER FUNCTION erp.cleanup_c7_normalization_fixture(text,text,text) OWNER TO postgres;
REVOKE ALL ON FUNCTION protect_deur_event_history(),reject_immutable_change(),reject_customer_review_evidence_change(),reject_manager_review_outcome_change(),reject_terminal_notification_change(),protect_statement_line(),cleanup_c7_normalization_fixture(text,text,text) FROM PUBLIC,anon,authenticated,service_role;
COMMENT ON FUNCTION cleanup_c7_normalization_fixture(text,text,text) IS 'Owner-only exact cleanup for disposable TENANT-UAT-C7-NORMALIZE-001 certification data.';
COMMIT;
