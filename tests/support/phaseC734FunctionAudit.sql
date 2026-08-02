select json_agg(json_build_object(
  'name',p.proname,
  'arguments',pg_get_function_identity_arguments(p.oid),
  'owner',pg_get_userbyid(p.proowner),
  'security_definer',p.prosecdef,
  'configuration',p.proconfig,
  'public_execute',has_function_privilege('public',p.oid,'EXECUTE'),
  'anon_execute',has_function_privilege('anon',p.oid,'EXECUTE'),
  'authenticated_execute',has_function_privilege('authenticated',p.oid,'EXECUTE')
) order by p.proname) as functions
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='erp' and p.proname in (
  'canonical_deur_snapshot_text','current_deur_expectation_fingerprint',
  'rental_release_readiness','command_start_deur_shift'
);
