select json_build_object(
  'signature', p.oid::regprocedure::text,
  'owner', pg_get_userbyid(p.proowner),
  'security_definer', p.prosecdef,
  'search_path', p.proconfig,
  'public_execute', has_function_privilege('public', p.oid, 'execute'),
  'anon_execute', has_function_privilege('anon', p.oid, 'execute'),
  'authenticated_execute', has_function_privilege('authenticated', p.oid, 'execute'),
  'contains_project_status', pg_get_functiondef(p.oid) ~ '(projects|p)\\.status',
  'contains_project_active', pg_get_functiondef(p.oid) like '%NOT p.active%',
  'contains_project_soft_delete', pg_get_functiondef(p.oid) like '%p.deleted_at IS NULL%'
) as function_audit
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'erp'
  and p.proname = 'rental_release_readiness'
  and pg_get_function_identity_arguments(p.oid) = 'target_rental_id text';
