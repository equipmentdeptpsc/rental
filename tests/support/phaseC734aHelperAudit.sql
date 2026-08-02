select json_build_object(
  'signature', pg_get_function_identity_arguments(p.oid),
  'result', pg_get_function_result(p.oid),
  'owner', pg_get_userbyid(p.proowner),
  'volatility', p.provolatile,
  'security_definer', p.prosecdef,
  'configuration', p.proconfig,
  'public_execute', has_function_privilege('public',p.oid,'EXECUTE'),
  'anon_execute', has_function_privilege('anon',p.oid,'EXECUTE'),
  'authenticated_execute', has_function_privilege('authenticated',p.oid,'EXECUTE'),
  'unqualified_self_call', p.prosrc ~ '(^|[^.[:alnum:]_])canonical_deur_snapshot_text\\(item\\)',
  'qualified_self_calls', (length(p.prosrc)-length(replace(p.prosrc,'erp.canonical_deur_snapshot_text(','')))/length('erp.canonical_deur_snapshot_text(')
) as helper_audit
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='erp' and p.proname='canonical_deur_snapshot_text';
