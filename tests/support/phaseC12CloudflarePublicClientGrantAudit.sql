select
  pg_get_userbyid(p.proowner) as function_owner,
  p.prosecdef as security_definer,
  coalesce(array_to_string(p.proconfig, ','), '') as function_configuration,
  has_function_privilege('public', 'erp.get_customer_review_batch(jsonb)', 'EXECUTE') as public_execute,
  has_function_privilege('anon', 'erp.get_customer_review_batch(jsonb)', 'EXECUTE') as anon_execute,
  has_function_privilege('authenticated', 'erp.get_customer_review_batch(jsonb)', 'EXECUTE') as authenticated_execute,
  has_function_privilege('service_role', 'erp.get_customer_review_batch(jsonb)', 'EXECUTE') as service_role_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'erp'
  and p.oid = 'erp.get_customer_review_batch(jsonb)'::regprocedure;
