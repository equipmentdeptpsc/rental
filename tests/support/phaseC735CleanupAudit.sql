select json_build_object(
 'count',count(*),'owner',max(pg_get_userbyid(p.proowner)),
 'public_execute',bool_or(has_function_privilege('public',p.oid,'execute')),
 'anon_execute',bool_or(has_function_privilege('anon',p.oid,'execute')),
 'authenticated_execute',bool_or(has_function_privilege('authenticated',p.oid,'execute')),
 'service_execute',bool_or(has_function_privilege('service_role',p.oid,'execute'))
) as cleanup_audit from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='erp' and p.proname='cleanup_c7_normalization_fixture';
