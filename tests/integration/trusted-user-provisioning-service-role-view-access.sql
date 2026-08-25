BEGIN;
SET LOCAL search_path=erp,auth,pg_catalog;

CREATE FUNCTION pg_temp.assert_true(value boolean,message text) RETURNS void
LANGUAGE plpgsql AS $$BEGIN IF value IS NOT TRUE THEN RAISE EXCEPTION '%',message;END IF;END$$;

INSERT INTO erp.companies(id,code,name,active,environment_class)
VALUES('TENANT-SERVICE-RBAC','SRBAC','Service RBAC Certification',true,'test');
INSERT INTO auth.users(id,email) VALUES
 ('8c570101-e232-4151-8d73-e3288a8d3c15','system-admin@service-rbac.test'),
 ('25300000-0000-4000-8000-000000000002','operations@service-rbac.test'),
 ('25300000-0000-4000-8000-000000000003','finance@service-rbac.test'),
 ('25300000-0000-4000-8000-000000000004','billing@service-rbac.test');
INSERT INTO erp.users(id,username,display_name,email,status,company_id) VALUES
 ('8c570101-e232-4151-8d73-e3288a8d3c15','service.admin','Service Admin','system-admin@service-rbac.test','active','TENANT-SERVICE-RBAC'),
 ('25300000-0000-4000-8000-000000000002','service.operations','Service Operations','operations@service-rbac.test','active','TENANT-SERVICE-RBAC'),
 ('25300000-0000-4000-8000-000000000003','service.finance','Service Finance','finance@service-rbac.test','active','TENANT-SERVICE-RBAC'),
 ('25300000-0000-4000-8000-000000000004','service.billing','Service Billing','billing@service-rbac.test','active','TENANT-SERVICE-RBAC');
INSERT INTO erp.user_roles(user_id,role_id)
SELECT fixture.user_id,role.id
FROM (VALUES
 ('8c570101-e232-4151-8d73-e3288a8d3c15'::uuid,'system-administrator'),
 ('25300000-0000-4000-8000-000000000002'::uuid,'operations-manager'),
 ('25300000-0000-4000-8000-000000000003'::uuid,'finance'),
 ('25300000-0000-4000-8000-000000000004'::uuid,'billing-staff')
) AS fixture(user_id,role_code)
JOIN erp.app_roles role ON role.code=fixture.role_code;

SELECT pg_temp.assert_true(has_column_privilege('service_role','erp.app_permissions','active','SELECT'),'service_role must read app_permissions.active');
SELECT pg_temp.assert_true(NOT has_table_privilege('service_role','erp.app_permissions','SELECT'),'service_role must not receive full-table app_permissions SELECT');
SELECT pg_temp.assert_true(NOT has_function_privilege('authenticated','erp.command_provision_application_user(jsonb)','EXECUTE'),'browser must not execute trusted provisioning');

SET ROLE service_role;
SELECT pg_temp.assert_true((SELECT count(*)=171 FROM erp.effective_user_permissions WHERE user_id='8c570101-e232-4151-8d73-e3288a8d3c15'),'System Administrator effective count must remain 171');
SELECT pg_temp.assert_true((SELECT array_agg(permission_code ORDER BY permission_code)=ARRAY['roles.assign','users.create'] FROM erp.effective_user_permissions WHERE user_id='8c570101-e232-4151-8d73-e3288a8d3c15' AND permission_code IN('users.create','roles.assign')),'Worker-shaped System Administrator lookup must return both create permissions');
SELECT pg_temp.assert_true((SELECT count(*)=28 FROM erp.effective_user_permissions WHERE user_id='25300000-0000-4000-8000-000000000002'),'Operations Manager effective count must remain 28');
SELECT pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM erp.effective_user_permissions WHERE user_id='25300000-0000-4000-8000-000000000002' AND permission_code IN('users.create','roles.assign')),'Operations Manager must lack create authority');
SELECT pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM erp.effective_user_permissions WHERE user_id='25300000-0000-4000-8000-000000000003' AND permission_code IN('users.create','roles.assign')),'Finance must lack create authority');
SELECT pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM erp.effective_user_permissions WHERE user_id='25300000-0000-4000-8000-000000000004' AND permission_code IN('users.create','roles.assign')),'Billing Staff must lack create authority');
RESET ROLE;

ROLLBACK;
