SELECT jsonb_build_object(
  'auth_users',(SELECT count(*) FROM auth.users),
  'companies',(SELECT count(*) FROM erp.companies),
  'users',(SELECT count(*) FROM erp.users),
  'roles',(SELECT count(*) FROM erp.app_roles),
  'user_roles',(SELECT count(*) FROM erp.user_roles),
  'operators',(SELECT count(*) FROM erp.operators),
  'customers',(SELECT count(*) FROM erp.customers),
  'projects',(SELECT count(*) FROM erp.projects),
  'equipment',(SELECT count(*) FROM erp.equipment),
  'assignments',(SELECT count(*) FROM erp.assignments),
  'rentals',(SELECT count(*) FROM erp.rentals),
  'rental_lines',(SELECT count(*) FROM erp.rental_equipment_lines),
  'deurs',(SELECT count(*) FROM erp.deurs),
  'deur_events',(SELECT count(*) FROM erp.deur_events),
  'meter_checkpoints',(SELECT count(*) FROM erp.deur_meter_checkpoints),
  'review_requests',(SELECT count(*) FROM erp.customer_review_requests),
  'billing_statements',(SELECT count(*) FROM erp.billing_statements),
  'billing_lines',(SELECT count(*) FROM erp.billing_statement_lines),
  'recoveries',(SELECT count(*) FROM erp.recovery_compensations),
  'audit',(SELECT count(*) FROM erp.audit_log),
  'commands',(SELECT count(*) FROM erp.operational_command_idempotency),
  'no_c4b_company_residue', NOT EXISTS(
    SELECT 1 FROM erp.companies WHERE id LIKE 'TENANT-UAT-C4B-%'
  ),
  'no_c4b_auth_residue', NOT EXISTS(
    SELECT 1 FROM auth.users
    WHERE email LIKE 'tenant-uat-c4b-%@example.invalid'
  ),
  'no_c4b2_company_residue', NOT EXISTS(
    SELECT 1 FROM erp.companies WHERE id LIKE 'TENANT-UAT-C4B2-%'
  ),
  'no_c4b2_auth_residue', NOT EXISTS(
    SELECT 1 FROM auth.users
    WHERE email LIKE 'tenant-uat-c4b2-%@example.invalid'
  ),
  'no_c4c_company_residue', NOT EXISTS(
    SELECT 1 FROM erp.companies WHERE id LIKE 'TENANT-UAT-C4C-%'
  ),
  'no_c4c_auth_residue', NOT EXISTS(
    SELECT 1 FROM auth.users
    WHERE email LIKE 'tenant-uat-c4c-%@example.invalid'
  ),
  'no_c4d_company_residue', NOT EXISTS(
    SELECT 1 FROM erp.companies WHERE id LIKE 'TENANT-UAT-C4D-%'
  ),
  'no_c4d_auth_residue', NOT EXISTS(
    SELECT 1 FROM auth.users
    WHERE email LIKE 'tenant-uat-c4d-%@example.invalid'
  ),
  'no_c4e_company_residue', NOT EXISTS(
    SELECT 1 FROM erp.companies WHERE id LIKE 'TENANT-UAT-C4E-%'
  ),
  'no_c4e_auth_residue', NOT EXISTS(
    SELECT 1 FROM auth.users
    WHERE email LIKE 'tenant-uat-c4e-%@example.invalid'
  ),
  'no_c5a_company_residue', NOT EXISTS(
    SELECT 1 FROM erp.companies WHERE id LIKE 'TENANT-UAT-C5A-%'
  ),
  'no_c5a_auth_residue', NOT EXISTS(
    SELECT 1 FROM auth.users
    WHERE email LIKE 'tenant-uat-c5a-%@example.invalid'
  )
) AS preflight;
