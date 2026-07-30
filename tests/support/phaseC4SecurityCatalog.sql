CREATE FUNCTION pg_temp.assert_true(ok boolean,label text) RETURNS integer LANGUAGE plpgsql AS $$
BEGIN IF NOT coalesce(ok,false) THEN RAISE EXCEPTION 'C4 security assertion failed: %',label; END IF; RETURN 1; END $$;

SELECT pg_temp.assert_true(NOT EXISTS(
  SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='erp' AND p.prosecdef
    AND (p.proconfig IS NULL OR array_to_string(p.proconfig,',') LIKE '%public%')
),'minimal security-definer paths');

SELECT pg_temp.assert_true(NOT EXISTS(
  SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='erp'
    AND has_function_privilege('anon',p.oid,'EXECUTE')
    AND p.proname NOT IN(
      'get_public_customer_review','public_acknowledge_customer_review','public_request_customer_correction',
      'get_manager_review','approve_manager_review','reject_manager_review','request_manager_correction'
    )
),'unintended anon execute');

SELECT pg_temp.assert_true(NOT EXISTS(
  SELECT 1 FROM pg_policies
  WHERE schemaname='erp' AND tablename NOT IN('app_permissions','app_roles','role_permissions')
    AND (qual='true' OR with_check='true')
),'permissive tenant policies');

SELECT pg_temp.assert_true(NOT EXISTS(
  SELECT 1 FROM information_schema.role_table_grants
  WHERE table_schema='erp' AND grantee IN('authenticated','anon')
    AND privilege_type IN('INSERT','UPDATE','DELETE')
    AND table_name IN('rentals','rental_equipment_lines','deurs','deur_events','billing_statements',
      'billing_statement_lines','recovery_compensations','audit_log','operational_command_idempotency')
),'direct lifecycle mutation grants');

SELECT pg_temp.assert_true(NOT EXISTS(
  SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='erp' AND c.relkind='r'
    AND c.relname IN('users','operators','customers','projects','equipment','assignments','rentals',
      'rental_equipment_lines','deurs','billing_statements','billing_statement_lines','recovery_compensations')
    AND NOT c.relrowsecurity
),'tenant RLS enabled');
