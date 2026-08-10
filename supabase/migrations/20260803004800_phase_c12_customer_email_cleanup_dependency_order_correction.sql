BEGIN;
SET search_path=erp,pg_catalog;

CREATE OR REPLACE FUNCTION erp.cleanup_c12_customer_email_certification_fixture(target_tenant_id text,expected_tenant_code text,confirmation text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,pg_catalog AS $$
DECLARE database_owner name; removed jsonb='{}'::jsonb; affected integer;
BEGIN
 IF target_tenant_id IS DISTINCT FROM 'TENANT-UAT-C12-CUSTOMER-EMAIL-001' OR expected_tenant_code IS DISTINCT FROM 'TENANT-UAT-C12-CUSTOMER-EMAIL-001' OR confirmation IS DISTINCT FROM 'CONFIRM-C12-CUSTOMER-EMAIL-CLEANUP' OR target_tenant_id IN('TENANT-LOCAL-001','TENANT-UAT-C4E-FINANCIAL','TENANT-UAT-C12-MANAGER-001') THEN RAISE EXCEPTION 'exact allowlist confirmation required' USING ERRCODE='22023'; END IF;
 SELECT pg_get_userbyid(datdba) INTO database_owner FROM pg_database WHERE datname=current_database();
 IF session_user<>database_owner OR current_user<>database_owner THEN RAISE EXCEPTION 'database-owner session required' USING ERRCODE='42501'; END IF;
 IF (SELECT count(*) FROM companies WHERE id='TENANT-LOCAL-001' AND code='LOCAL' AND environment_class='compatibility')<>1 THEN RAISE EXCEPTION 'protected local tenant invariant failed' USING ERRCODE='55000'; END IF;
 IF EXISTS(SELECT 1 FROM companies WHERE id=target_tenant_id AND (code<>expected_tenant_code OR environment_class<>'test')) THEN RAISE EXCEPTION 'fixture tenant identity mismatch' USING ERRCODE='55000'; END IF;
 IF EXISTS(SELECT 1 FROM billing_statements WHERE company_id=target_tenant_id) OR EXISTS(SELECT 1 FROM billing_statement_lines WHERE company_id=target_tenant_id) OR EXISTS(SELECT 1 FROM manager_review_requests WHERE company_id=target_tenant_id) OR EXISTS(SELECT 1 FROM manager_review_outcomes WHERE company_id=target_tenant_id) OR EXISTS(SELECT 1 FROM manager_correction_requests WHERE company_id=target_tenant_id) OR EXISTS(SELECT 1 FROM recovery_compensations WHERE company_id=target_tenant_id) THEN RAISE EXCEPTION 'unexpected billing or manager evidence exists' USING ERRCODE='55000'; END IF;
 IF (SELECT count(*) FROM companies WHERE id=target_tenant_id)>1 OR (SELECT count(*) FROM users WHERE company_id=target_tenant_id)>2 OR (SELECT count(*) FROM customers WHERE company_id=target_tenant_id)>1 OR (SELECT count(*) FROM projects WHERE company_id=target_tenant_id)>1 OR (SELECT count(*) FROM equipment WHERE company_id=target_tenant_id)>1 OR (SELECT count(*) FROM operators WHERE company_id=target_tenant_id)>1 OR (SELECT count(*) FROM assignments WHERE company_id=target_tenant_id)>1 OR (SELECT count(*) FROM rentals WHERE company_id=target_tenant_id)>1 OR (SELECT count(*) FROM rental_equipment_lines WHERE company_id=target_tenant_id)>1 OR (SELECT count(*) FROM deurs WHERE company_id=target_tenant_id)>2 OR (SELECT count(*) FROM customer_review_requests WHERE company_id=target_tenant_id)>2 OR (SELECT count(*) FROM customer_review_outcomes WHERE company_id=target_tenant_id)>1 OR (SELECT count(*) FROM notification_outbox WHERE company_id=target_tenant_id)>4 OR (SELECT count(*) FROM notification_delivery_attempts WHERE company_id=target_tenant_id)>6 OR EXISTS(SELECT 1 FROM maintenance_records m JOIN equipment e ON e.id=m.equipment_id WHERE e.company_id=target_tenant_id) OR EXISTS(SELECT 1 FROM equipment_daily_logs d JOIN equipment e ON e.id=d.equipment_id WHERE e.company_id=target_tenant_id) THEN RAISE EXCEPTION 'unexpected extra fixture data exists' USING ERRCODE='55000'; END IF;
 PERFORM set_config('erp.c12_customer_email_fixture_cleanup',target_tenant_id,true);
 DELETE FROM notification_delivery_attempts WHERE company_id=target_tenant_id; GET DIAGNOSTICS affected=ROW_COUNT; removed=removed||jsonb_build_object('notification_delivery_attempts',affected);
 DELETE FROM notification_outbox WHERE company_id=target_tenant_id; GET DIAGNOSTICS affected=ROW_COUNT; removed=removed||jsonb_build_object('notification_outbox',affected);
 DELETE FROM customer_correction_requests WHERE company_id=target_tenant_id; GET DIAGNOSTICS affected=ROW_COUNT; removed=removed||jsonb_build_object('customer_corrections',affected);
 DELETE FROM customer_review_outcomes WHERE company_id=target_tenant_id; GET DIAGNOSTICS affected=ROW_COUNT; removed=removed||jsonb_build_object('customer_review_outcomes',affected);
 DELETE FROM customer_review_requests WHERE company_id=target_tenant_id; GET DIAGNOSTICS affected=ROW_COUNT; removed=removed||jsonb_build_object('customer_review_requests',affected);
 DELETE FROM deur_activity_logs WHERE deur_id IN(SELECT id FROM deurs WHERE company_id=target_tenant_id); GET DIAGNOSTICS affected=ROW_COUNT; removed=removed||jsonb_build_object('deur_activity_logs',affected);
 DELETE FROM deur_meter_checkpoints WHERE company_id=target_tenant_id; GET DIAGNOSTICS affected=ROW_COUNT; removed=removed||jsonb_build_object('deur_checkpoints',affected);
 DELETE FROM deur_review_history WHERE company_id=target_tenant_id; GET DIAGNOSTICS affected=ROW_COUNT; removed=removed||jsonb_build_object('deur_review_history',affected);
 DELETE FROM deur_events WHERE company_id=target_tenant_id; GET DIAGNOSTICS affected=ROW_COUNT; removed=removed||jsonb_build_object('deur_events',affected);
 DELETE FROM deurs WHERE company_id=target_tenant_id; GET DIAGNOSTICS affected=ROW_COUNT; removed=removed||jsonb_build_object('deurs',affected);
 DELETE FROM operational_command_idempotency WHERE company_id=target_tenant_id; GET DIAGNOSTICS affected=ROW_COUNT; removed=removed||jsonb_build_object('operational_commands',affected);
 DELETE FROM deur_command_idempotency WHERE company_id=target_tenant_id; GET DIAGNOSTICS affected=ROW_COUNT; removed=removed||jsonb_build_object('deur_commands',affected);
 DELETE FROM audit_log WHERE company_id=target_tenant_id; GET DIAGNOSTICS affected=ROW_COUNT; removed=removed||jsonb_build_object('audit_rows',affected);
 DELETE FROM number_sequences WHERE company_id=target_tenant_id; GET DIAGNOSTICS affected=ROW_COUNT; removed=removed||jsonb_build_object('number_sequences',affected);
 DELETE FROM commercial_snapshots WHERE rental_id IN(SELECT id FROM rentals WHERE company_id=target_tenant_id); GET DIAGNOSTICS affected=ROW_COUNT; removed=removed||jsonb_build_object('commercial_snapshots',affected);
 DELETE FROM rental_contracts WHERE rental_id IN(SELECT id FROM rentals WHERE company_id=target_tenant_id); GET DIAGNOSTICS affected=ROW_COUNT; removed=removed||jsonb_build_object('rental_contracts',affected);
 DELETE FROM rental_shift_window_snapshots WHERE rental_id IN(SELECT id FROM rentals WHERE company_id=target_tenant_id); GET DIAGNOSTICS affected=ROW_COUNT; removed=removed||jsonb_build_object('shift_snapshots',affected);
 DELETE FROM rental_equipment_lines WHERE company_id=target_tenant_id; GET DIAGNOSTICS affected=ROW_COUNT; removed=removed||jsonb_build_object('rental_lines',affected);
 DELETE FROM rentals WHERE company_id=target_tenant_id; GET DIAGNOSTICS affected=ROW_COUNT; removed=removed||jsonb_build_object('rentals',affected);
 DELETE FROM assignments WHERE company_id=target_tenant_id; GET DIAGNOSTICS affected=ROW_COUNT; removed=removed||jsonb_build_object('assignments',affected);
 DELETE FROM equipment_history WHERE equipment_id IN(SELECT id FROM equipment WHERE company_id=target_tenant_id); GET DIAGNOSTICS affected=ROW_COUNT; removed=removed||jsonb_build_object('equipment_history',affected);
 DELETE FROM equipment WHERE company_id=target_tenant_id; GET DIAGNOSTICS affected=ROW_COUNT; removed=removed||jsonb_build_object('equipment',affected);
 DELETE FROM user_roles ur USING users u WHERE ur.user_id=u.id AND u.company_id=target_tenant_id; GET DIAGNOSTICS affected=ROW_COUNT; removed=removed||jsonb_build_object('user_roles',affected);
 DELETE FROM users WHERE company_id=target_tenant_id; GET DIAGNOSTICS affected=ROW_COUNT; removed=removed||jsonb_build_object('application_users',affected);
 DELETE FROM operators WHERE company_id=target_tenant_id; GET DIAGNOSTICS affected=ROW_COUNT; removed=removed||jsonb_build_object('operators',affected);
 DELETE FROM projects WHERE company_id=target_tenant_id; GET DIAGNOSTICS affected=ROW_COUNT; removed=removed||jsonb_build_object('projects',affected);
 DELETE FROM customers WHERE company_id=target_tenant_id; GET DIAGNOSTICS affected=ROW_COUNT; removed=removed||jsonb_build_object('customers',affected);
 DELETE FROM companies WHERE id=target_tenant_id AND code=expected_tenant_code AND environment_class='test'; GET DIAGNOSTICS affected=ROW_COUNT; removed=removed||jsonb_build_object('companies',affected);
 IF (SELECT count(*) FROM companies WHERE id='TENANT-LOCAL-001' AND code='LOCAL' AND environment_class='compatibility')<>1 THEN RAISE EXCEPTION 'protected local tenant postcondition failed' USING ERRCODE='55000'; END IF;
 RETURN removed;
END $$;

ALTER FUNCTION erp.cleanup_c12_customer_email_certification_fixture(text,text,text) OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.cleanup_c12_customer_email_certification_fixture(text,text,text) FROM PUBLIC,anon,authenticated,service_role;
COMMENT ON FUNCTION erp.cleanup_c12_customer_email_certification_fixture(text,text,text) IS 'Owner-only exact cleanup for disposable TENANT-UAT-C12-CUSTOMER-EMAIL-001 certification data; aggregate counts only; dependency order corrected by phase C12.1C.2.';
COMMIT;
