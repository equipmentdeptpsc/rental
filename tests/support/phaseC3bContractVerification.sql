SELECT 1/(CASE WHEN count(*)=6 THEN 1 ELSE 0 END)
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='erp' AND p.proname IN(
  'command_generate_billing_evidence','command_consume_deur','command_create_billing_statement',
  'command_finalize_billing_statement','command_create_invoice','command_update_invoice'
) AND pg_get_function_identity_arguments(p.oid)='command jsonb'
  AND p.prosecdef AND array_to_string(p.proconfig,',') NOT LIKE '%public%';

SELECT 1/(CASE WHEN count(*)=6 THEN 1 ELSE 0 END)
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='erp' AND p.proname IN(
  'command_generate_billing_evidence','command_consume_deur','command_create_billing_statement',
  'command_finalize_billing_statement','command_create_invoice','command_update_invoice'
) AND has_function_privilege('authenticated',p.oid,'EXECUTE')
  AND NOT has_function_privilege('anon',p.oid,'EXECUTE')
  AND NOT has_function_privilege('public',p.oid,'EXECUTE');
