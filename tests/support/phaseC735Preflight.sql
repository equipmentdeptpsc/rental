select json_build_object(
  'normalization_companies',(select count(*) from erp.companies where id='TENANT-UAT-C7-NORMALIZE-001'),
  'normalization_app_users',(select count(*) from erp.users where company_id='TENANT-UAT-C7-NORMALIZE-001'),
  'normalization_auth_users',(select count(*) from auth.users where email like 'c735-normalize-%@example.invalid'),
  'release_companies',(select count(*) from erp.companies where id like 'TENANT-UAT-C7-RELEASE-%'),
  'release_auth_users',(select count(*) from auth.users where email like 'c733-release-%@example.invalid'),
  'tenant_local_count',(select count(*) from erp.companies where id='TENANT-LOCAL-001'),
  'cleanup_function_count',(select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='erp' and p.proname='cleanup_c7_normalization_fixture')
) as preflight;
