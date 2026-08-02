select json_build_object(
  'tenant_local_count', (select count(*) from erp.companies where id = 'TENANT-LOCAL-001'),
  'unexpected_company_count', (select count(*) from erp.companies where id <> 'TENANT-LOCAL-001'),
  'uat_company_count', (select count(*) from erp.companies where id like 'TENANT-UAT-%'),
  'uat_user_count', (select count(*) from erp.users where company_id like 'TENANT-UAT-%'),
  'uat_rental_count', (select count(*) from erp.rentals where company_id like 'TENANT-UAT-%'),
  'uat_line_count', (select count(*) from erp.rental_equipment_lines where company_id like 'TENANT-UAT-%'),
  'uat_audit_count', (select count(*) from erp.audit_log where company_id like 'TENANT-UAT-%'),
  'uat_command_count', (select count(*) from erp.operational_command_idempotency where company_id like 'TENANT-UAT-%')
) as preflight;
