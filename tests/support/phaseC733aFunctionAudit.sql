select json_build_object(
  'owner', pg_get_userbyid(p.proowner),
  'security_definer', p.prosecdef,
  'search_path', p.proconfig,
  'public_execute', has_function_privilege('public', p.oid, 'execute'),
  'anon_execute', has_function_privilege('anon', p.oid, 'execute'),
  'authenticated_execute', has_function_privilege('authenticated', p.oid, 'execute'),
  'service_role_execute', has_function_privilege('service_role', p.oid, 'execute')
) as function_audit
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='erp' and p.proname='cleanup_c7_release_certification_fixture'
  and pg_get_function_identity_arguments(p.oid)='target_tenant_id text, expected_tenant_code text, confirmation text';

do $$
begin
  begin perform erp.cleanup_c7_release_certification_fixture('TENANT-UAT-C7-001','TENANT-UAT-C7-001','CONFIRM-C7-RELEASE-CLEANUP');
    raise exception 'old tenant unexpectedly accepted'; exception when sqlstate '22023' then null; end;
  begin perform erp.cleanup_c7_release_certification_fixture('TENANT-LOCAL-001','TENANT-LOCAL-001','CONFIRM-C7-RELEASE-CLEANUP');
    raise exception 'local tenant unexpectedly accepted'; exception when sqlstate '22023' then null; end;
  begin perform erp.cleanup_c7_release_certification_fixture('TENANT-UAT-ARBITRARY','TENANT-UAT-ARBITRARY','CONFIRM-C7-RELEASE-CLEANUP');
    raise exception 'arbitrary tenant unexpectedly accepted'; exception when sqlstate '22023' then null; end;
  begin perform erp.cleanup_c7_release_certification_fixture('TENANT-UAT-C7-RELEASE-001','TENANT-UAT-C7-RELEASE-001','WRONG');
    raise exception 'wrong confirmation unexpectedly accepted'; exception when sqlstate '22023' then null; end;
end $$;
