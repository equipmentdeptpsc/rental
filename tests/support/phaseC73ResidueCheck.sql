select json_build_object(
  'companies', (select count(*) from erp.companies where id like 'TENANT-UAT-C7-REL-%'),
  'auth_users', (select count(*) from auth.users where id in (
    '7a310000-0000-0000-0000-000000000001',
    '7a310000-0000-0000-0000-000000000002'
  )),
  'app_users', (select count(*) from erp.users where id in (
    '7a310000-0000-0000-0000-000000000001',
    '7a310000-0000-0000-0000-000000000002'
  )),
  'rentals', (select count(*) from erp.rentals where id like 'RENT-UAT-C7-REL-%'),
  'roles', (select count(*) from erp.app_roles where id = 'ROLE-UAT-C7-REL')
) as residue;
