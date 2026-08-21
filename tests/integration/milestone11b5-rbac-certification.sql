\set ON_ERROR_STOP on
CREATE OR REPLACE FUNCTION pg_temp.assert_true(condition boolean,message text)
RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF condition IS NOT TRUE THEN RAISE EXCEPTION 'ASSERTION FAILED: %',message; END IF; END $$;

SELECT pg_temp.assert_true((SELECT count(*)=1 FROM erp.app_permissions WHERE code='billing.create'),'billing.create must exist once');
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM erp.app_permissions WHERE code='billing.update'),'billing.update must exist once');
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM erp.app_roles WHERE code='finance'),'Finance role must exist once');
SELECT pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM erp.app_roles WHERE code IN('management','operator','billing-staff')),'no unrelated role may be introduced');
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM erp.effective_user_permissions),'empty-user baseline remains empty');
SELECT pg_temp.assert_true((SELECT count(*)=3 FROM erp.role_permissions mapping JOIN erp.app_roles role ON role.id=mapping.role_id JOIN erp.app_permissions permission ON permission.id=mapping.permission_id WHERE role.code='finance' AND permission.code IN('billing.read','billing.create','billing.update')),'Finance Billing policy must be complete');
SELECT pg_temp.assert_true((SELECT count(*)=3 FROM erp.role_permissions mapping JOIN erp.app_roles role ON role.id=mapping.role_id JOIN erp.app_permissions permission ON permission.id=mapping.permission_id WHERE role.code='system-administrator' AND permission.code IN('billing.read','billing.create','billing.update')),'System Administrator Billing policy must be complete');
SELECT pg_temp.assert_true(EXISTS(SELECT 1 FROM erp.role_permissions mapping JOIN erp.app_roles role ON role.id=mapping.role_id JOIN erp.app_permissions permission ON permission.id=mapping.permission_id WHERE role.code='rental-operations' AND permission.code='billing.read'),'Rental Operations billing.read must be preserved');
SELECT pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM erp.role_permissions mapping JOIN erp.app_roles role ON role.id=mapping.role_id JOIN erp.app_permissions permission ON permission.id=mapping.permission_id WHERE role.code='rental-operations' AND permission.code IN('billing.create','billing.update')),'Rental Operations mutations must remain denied');
SELECT pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM erp.user_roles),'no users may be assigned');
SELECT pg_temp.assert_true(NOT EXISTS(
  (SELECT role_code,permission_code FROM m11b5_authority_before)
  EXCEPT
  (SELECT role.code,permission.code FROM erp.role_permissions mapping JOIN erp.app_roles role ON role.id=mapping.role_id JOIN erp.app_permissions permission ON permission.id=mapping.permission_id)
),'no pre-existing role permission may be removed');
SELECT 'MILESTONE_11B5_RBAC_CERTIFICATION_PASS' AS result;
