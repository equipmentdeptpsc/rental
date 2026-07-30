SELECT p.proname,pg_get_function_identity_arguments(p.oid) AS arguments,p.proconfig
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='erp' AND p.prosecdef
  AND (p.proconfig IS NULL OR array_to_string(p.proconfig,',') LIKE '%public%')
ORDER BY p.proname,arguments;
