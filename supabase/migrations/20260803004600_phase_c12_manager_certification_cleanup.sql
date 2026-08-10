BEGIN;
SET search_path TO erp, pg_catalog;

CREATE FUNCTION cleanup_c12_manager_certification_fixture(
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
  application_user_count integer;
  user_role_count integer;
  affected integer;
  removed_companies integer := 0;
  removed_application_users integer := 0;
  removed_user_roles integer := 0;
BEGIN
  IF target_tenant_id IS DISTINCT FROM 'TENANT-UAT-C12-MANAGER-001'
     OR expected_tenant_code IS DISTINCT FROM 'TENANT-UAT-C12-MANAGER-001'
     OR confirmation IS DISTINCT FROM 'CONFIRM-C12-MANAGER-CERTIFICATION-CLEANUP'
     OR target_tenant_id IN ('TENANT-LOCAL-001','TENANT-UAT-C4E-FINANCIAL') THEN
    RAISE EXCEPTION 'C12 manager cleanup rejected: exact allowlist confirmation required'
      USING ERRCODE = '22023';
  END IF;

  SELECT pg_get_userbyid(datdba) INTO database_owner
  FROM pg_database WHERE datname = current_database();
  IF session_user <> database_owner OR current_user <> database_owner THEN
    RAISE EXCEPTION 'C12 manager cleanup rejected: database-owner session required'
      USING ERRCODE = '42501';
  END IF;

  IF (SELECT count(*) FROM companies
      WHERE id = 'TENANT-LOCAL-001' AND code = 'LOCAL'
        AND environment_class = 'compatibility') <> 1 THEN
    RAISE EXCEPTION 'C12 manager cleanup rejected: protected local tenant invariant failed'
      USING ERRCODE = '55000';
  END IF;

  IF EXISTS (
    SELECT 1 FROM companies
    WHERE id = target_tenant_id
      AND (code IS DISTINCT FROM expected_tenant_code OR environment_class IS DISTINCT FROM 'test')
  ) THEN
    RAISE EXCEPTION 'C12 manager cleanup rejected: fixture tenant identity mismatch'
      USING ERRCODE = '55000';
  END IF;

  IF EXISTS (
    SELECT 1 FROM rentals WHERE company_id = target_tenant_id
    UNION ALL SELECT 1 FROM rental_equipment_lines WHERE company_id = target_tenant_id
    UNION ALL SELECT 1 FROM assignments WHERE company_id = target_tenant_id
    UNION ALL SELECT 1 FROM equipment WHERE company_id = target_tenant_id
    UNION ALL SELECT 1 FROM operators WHERE company_id = target_tenant_id
    UNION ALL SELECT 1 FROM customers WHERE company_id = target_tenant_id
    UNION ALL SELECT 1 FROM projects WHERE company_id = target_tenant_id
    UNION ALL SELECT 1 FROM deurs WHERE company_id = target_tenant_id
    UNION ALL SELECT 1 FROM deur_events WHERE company_id = target_tenant_id
    UNION ALL SELECT 1 FROM customer_review_requests WHERE company_id = target_tenant_id
    UNION ALL SELECT 1 FROM customer_review_outcomes WHERE company_id = target_tenant_id
    UNION ALL SELECT 1 FROM customer_correction_requests WHERE company_id = target_tenant_id
    UNION ALL SELECT 1 FROM manager_review_requests WHERE company_id = target_tenant_id
    UNION ALL SELECT 1 FROM manager_review_outcomes WHERE company_id = target_tenant_id
    UNION ALL SELECT 1 FROM manager_correction_requests WHERE company_id = target_tenant_id
    UNION ALL SELECT 1 FROM notification_outbox WHERE company_id = target_tenant_id
    UNION ALL SELECT 1 FROM notification_delivery_attempts WHERE company_id = target_tenant_id
    UNION ALL SELECT 1 FROM billing_statements WHERE company_id = target_tenant_id
    UNION ALL SELECT 1 FROM billing_statement_lines WHERE company_id = target_tenant_id
    UNION ALL SELECT 1 FROM recovery_compensations WHERE company_id = target_tenant_id
    UNION ALL SELECT 1 FROM audit_log WHERE company_id = target_tenant_id
    UNION ALL SELECT 1 FROM operational_command_idempotency WHERE company_id = target_tenant_id
    UNION ALL SELECT 1 FROM deur_command_idempotency WHERE company_id = target_tenant_id
    UNION ALL SELECT 1 FROM number_sequences WHERE company_id = target_tenant_id
  ) THEN
    RAISE EXCEPTION 'C12 manager cleanup rejected: unexpected business residue exists'
      USING ERRCODE = '55000';
  END IF;

  SELECT count(*) INTO application_user_count FROM users WHERE company_id = target_tenant_id;
  SELECT count(*) INTO user_role_count
  FROM user_roles ur JOIN users u ON u.id = ur.user_id
  WHERE u.company_id = target_tenant_id;

  IF application_user_count > 1 OR user_role_count > 1 THEN
    RAISE EXCEPTION 'C12 manager cleanup rejected: unexpected user or role assignment count'
      USING ERRCODE = '55000';
  END IF;
  IF application_user_count = 1 AND NOT EXISTS (
    SELECT 1 FROM users u
    WHERE u.company_id = target_tenant_id AND u.status = 'active'
      AND u.email = 'equipmentdept.psc@gmail.com'
  ) THEN
    RAISE EXCEPTION 'C12 manager cleanup rejected: controlled application user mismatch'
      USING ERRCODE = '55000';
  END IF;
  IF user_role_count = 1 AND NOT EXISTS (
    SELECT 1 FROM users u
    JOIN user_roles ur ON ur.user_id = u.id
    JOIN role_permissions rp ON rp.role_id = ur.role_id
    JOIN app_permissions permission ON permission.id = rp.permission_id
    WHERE u.company_id = target_tenant_id AND permission.code = 'rental.approve'
  ) THEN
    RAISE EXCEPTION 'C12 manager cleanup rejected: controlled approval role mismatch'
      USING ERRCODE = '55000';
  END IF;
  IF application_user_count <> user_role_count THEN
    RAISE EXCEPTION 'C12 manager cleanup rejected: incomplete controlled fixture'
      USING ERRCODE = '55000';
  END IF;

  DELETE FROM user_roles ur USING users u
  WHERE ur.user_id = u.id AND u.company_id = target_tenant_id;
  GET DIAGNOSTICS affected = ROW_COUNT; removed_user_roles := affected;

  DELETE FROM users WHERE company_id = target_tenant_id;
  GET DIAGNOSTICS affected = ROW_COUNT; removed_application_users := affected;

  DELETE FROM companies
  WHERE id = target_tenant_id AND code = expected_tenant_code AND environment_class = 'test';
  GET DIAGNOSTICS affected = ROW_COUNT; removed_companies := affected;

  IF (SELECT count(*) FROM companies
      WHERE id = 'TENANT-LOCAL-001' AND code = 'LOCAL'
        AND environment_class = 'compatibility') <> 1 THEN
    RAISE EXCEPTION 'C12 manager cleanup rejected: protected local tenant postcondition failed'
      USING ERRCODE = '55000';
  END IF;

  RETURN jsonb_build_object(
    'companies', removed_companies,
    'application_users', removed_application_users,
    'user_roles', removed_user_roles
  );
END;
$$;

ALTER FUNCTION cleanup_c12_manager_certification_fixture(text,text,text) OWNER TO postgres;
REVOKE ALL ON FUNCTION cleanup_c12_manager_certification_fixture(text,text,text)
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION cleanup_c12_manager_certification_fixture(text,text,text) IS
  'Owner-only exact cleanup for the disposable TENANT-UAT-C12-MANAGER-001 resolver-certification fixture; returns aggregate counts only.';

COMMIT;
