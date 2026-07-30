SELECT p.proname,pg_get_function_identity_arguments(p.oid) AS arguments
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='erp' AND has_function_privilege('anon',p.oid,'EXECUTE')
  AND p.proname NOT IN('resolve_public_review','get_public_customer_review','public_acknowledge_customer_review','public_reject_customer_review')
ORDER BY p.proname,arguments;
