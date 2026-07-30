SELECT 1/(CASE WHEN count(*)=5 THEN 1 ELSE 0 END)
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='erp' AND p.proname IN(
  'command_reopen_rental','command_reverse_rental_return','command_void_billing_statement',
  'command_release_deur_consumption','command_cancel_invoice'
) AND pg_get_function_identity_arguments(p.oid)='command jsonb'
  AND p.prosecdef AND array_to_string(p.proconfig,',') NOT LIKE '%public%';

SELECT 1/(CASE WHEN count(*)=5 THEN 1 ELSE 0 END)
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='erp' AND p.proname IN(
  'command_reopen_rental','command_reverse_rental_return','command_void_billing_statement',
  'command_release_deur_consumption','command_cancel_invoice'
) AND has_function_privilege('authenticated',p.oid,'EXECUTE')
  AND NOT has_function_privilege('anon',p.oid,'EXECUTE')
  AND NOT has_function_privilege('public',p.oid,'EXECUTE');

SELECT 1/(CASE WHEN NOT has_function_privilege('authenticated',
  'erp.record_recovery_compensation(text,text,text,text,text,text,uuid,text,text,jsonb,jsonb,bigint,bigint)','EXECUTE')
THEN 1 ELSE 0 END);
