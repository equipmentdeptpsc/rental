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
  'commands',(SELECT count(*) FROM erp.operational_command_idempotency)
) AS baseline_counts;

SELECT 1/(CASE WHEN NOT EXISTS(
  SELECT 1 FROM erp.companies WHERE id<>'TENANT-LOCAL-001'
) THEN 1 ELSE 0 END) AS only_expected_tenant;

SELECT 1/(CASE WHEN NOT EXISTS(
  SELECT 1 FROM erp.companies WHERE id LIKE 'TENANT-UAT-C4-%'
) THEN 1 ELSE 0 END) AS no_c4_residue;
