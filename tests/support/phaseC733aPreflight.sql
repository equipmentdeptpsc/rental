select json_build_object(
  'release_company_count', (select count(*) from erp.companies where id like 'TENANT-UAT-C7-RELEASE-%'),
  'release_app_user_count', (select count(*) from erp.users where company_id like 'TENANT-UAT-C7-RELEASE-%'),
  'release_auth_user_count', (select count(*) from auth.users where email like 'c733a-release-%@example.invalid'),
  'tenant_local_count', (select count(*) from erp.companies where id = 'TENANT-LOCAL-001')
) as preflight;
