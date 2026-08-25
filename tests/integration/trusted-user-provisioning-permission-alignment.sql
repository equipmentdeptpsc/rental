BEGIN;
SET LOCAL search_path=erp,auth,pg_catalog;

CREATE FUNCTION pg_temp.assert_true(value boolean,message text) RETURNS void
LANGUAGE plpgsql AS $$BEGIN IF value IS NOT TRUE THEN RAISE EXCEPTION '%',message;END IF;END$$;

INSERT INTO erp.companies(id,code,name,active,environment_class)
VALUES('TENANT-RBAC-PROVISION','RBACP','RBAC Provision Certification',true,'test');
INSERT INTO auth.users(id,email) VALUES
 ('25200000-0000-4000-8000-000000000001','admin@rbac-provision.test'),
 ('25200000-0000-4000-8000-000000000002','operations@rbac-provision.test'),
 ('25200000-0000-4000-8000-000000000003','billing@rbac-provision.test'),
 ('25200000-0000-4000-8000-000000000004','partial@rbac-provision.test'),
 ('25200000-0000-4000-8000-000000000010','created@rbac-provision.test'),
 ('25200000-0000-4000-8000-000000000011','deprecated@rbac-provision.test');
INSERT INTO erp.users(id,username,display_name,email,status,company_id) VALUES
 ('25200000-0000-4000-8000-000000000001','rbac.admin','RBAC Admin','admin@rbac-provision.test','active','TENANT-RBAC-PROVISION'),
 ('25200000-0000-4000-8000-000000000002','rbac.operations','RBAC Operations','operations@rbac-provision.test','active','TENANT-RBAC-PROVISION'),
 ('25200000-0000-4000-8000-000000000003','rbac.billing','RBAC Billing','billing@rbac-provision.test','active','TENANT-RBAC-PROVISION'),
 ('25200000-0000-4000-8000-000000000004','rbac.partial','RBAC Partial','partial@rbac-provision.test','active','TENANT-RBAC-PROVISION');
INSERT INTO erp.user_roles(user_id,role_id) SELECT '25200000-0000-4000-8000-000000000001',id FROM erp.app_roles WHERE code='system-administrator';
INSERT INTO erp.user_roles(user_id,role_id) SELECT '25200000-0000-4000-8000-000000000002',id FROM erp.app_roles WHERE code='operations-manager';
INSERT INTO erp.user_roles(user_id,role_id) SELECT '25200000-0000-4000-8000-000000000003',id FROM erp.app_roles WHERE code='billing-staff';
INSERT INTO erp.app_roles(id,code,name,catalog_version,active,deprecated_at) VALUES
 ('ROLE-RBAC-PARTIAL','rbac-partial','RBAC Partial','test',true,NULL),
 ('ROLE-RBAC-DEPRECATED','rbac-deprecated','RBAC Deprecated','test',true,clock_timestamp());
INSERT INTO erp.role_permissions(role_id,permission_id) SELECT 'ROLE-RBAC-PARTIAL',id FROM erp.app_permissions WHERE code='users.create';
INSERT INTO erp.user_roles(user_id,role_id) VALUES('25200000-0000-4000-8000-000000000004','ROLE-RBAC-PARTIAL');

SELECT pg_temp.assert_true((erp.command_provision_application_user('{"actorId":"25200000-0000-4000-8000-000000000002","companyId":"TENANT-RBAC-PROVISION","authUserId":"25200000-0000-4000-8000-000000000010","commandId":"ops-denied","idempotencyKey":"ops-denied","username":"ops-denied","displayName":"Denied","email":"created@rbac-provision.test","roleCodes":["operations-manager"]}'::jsonb)->>'code')='FORBIDDEN','Operations Manager must not create users');
SELECT pg_temp.assert_true((erp.command_provision_application_user('{"actorId":"25200000-0000-4000-8000-000000000003","companyId":"TENANT-RBAC-PROVISION","authUserId":"25200000-0000-4000-8000-000000000010","commandId":"billing-denied","idempotencyKey":"billing-denied","username":"billing-denied","displayName":"Denied","email":"created@rbac-provision.test","roleCodes":["operations-manager"]}'::jsonb)->>'code')='FORBIDDEN','Billing Staff must not create users');
SELECT pg_temp.assert_true((erp.command_provision_application_user('{"actorId":"25200000-0000-4000-8000-000000000004","companyId":"TENANT-RBAC-PROVISION","authUserId":"25200000-0000-4000-8000-000000000010","commandId":"partial-denied","idempotencyKey":"partial-denied","username":"partial-denied","displayName":"Denied","email":"created@rbac-provision.test","roleCodes":["operations-manager"]}'::jsonb)->>'code')='FORBIDDEN','users.create without roles.assign must be denied');
SELECT pg_temp.assert_true((erp.command_provision_application_user('{"actorId":"25200000-0000-4000-8000-000000000001","companyId":"TENANT-RBAC-PROVISION","authUserId":"25200000-0000-4000-8000-000000000011","commandId":"deprecated-denied","idempotencyKey":"deprecated-denied","username":"deprecated-denied","displayName":"Denied","email":"deprecated@rbac-provision.test","roleCodes":["rbac-deprecated"]}'::jsonb)->>'code')='INVALID_ROLE','deprecated role must not be newly assigned');

CREATE TEMP TABLE provision_result AS
SELECT erp.command_provision_application_user('{"actorId":"25200000-0000-4000-8000-000000000001","companyId":"TENANT-RBAC-PROVISION","authUserId":"25200000-0000-4000-8000-000000000010","commandId":"canonical-create","idempotencyKey":"canonical-create","username":"operations.manager","displayName":"Operations Manager","email":"created@rbac-provision.test","roleCodes":["operations-manager","operations-manager"]}'::jsonb) result;
SELECT pg_temp.assert_true((SELECT (result->>'success')::boolean FROM provision_result),'System Administrator canonical create must succeed');
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM erp.user_roles ur JOIN erp.app_roles r ON r.id=ur.role_id WHERE ur.user_id='25200000-0000-4000-8000-000000000010' AND r.code='operations-manager'),'canonical Operations Manager role must be assigned once through its catalog identity');
SELECT pg_temp.assert_true((SELECT count(*)=2 FROM erp.audit_log WHERE aggregate_id='25200000-0000-4000-8000-000000000010' AND action IN('USER_CREATED','USER_ROLE_ASSIGNED')),'create and role-assignment audit evidence must remain exact');
SELECT pg_temp.assert_true((erp.command_provision_application_user('{"actorId":"25200000-0000-4000-8000-000000000001","companyId":"TENANT-RBAC-PROVISION","authUserId":"25200000-0000-4000-8000-000000000010","commandId":"canonical-create","idempotencyKey":"canonical-create","username":"operations.manager","displayName":"Operations Manager","email":"created@rbac-provision.test","roleCodes":["operations-manager","operations-manager"]}'::jsonb)->>'replayed')='true','identical create must replay');
SELECT pg_temp.assert_true((SELECT count(*)=2 FROM erp.audit_log WHERE aggregate_id='25200000-0000-4000-8000-000000000010' AND action IN('USER_CREATED','USER_ROLE_ASSIGNED')),'replay must not duplicate audit evidence');
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM erp.user_provisioning_commands WHERE company_id='TENANT-RBAC-PROVISION' AND idempotency_key='canonical-create'),'idempotency record must remain singular');
SELECT pg_temp.assert_true(NOT has_function_privilege('authenticated','erp.command_provision_application_user(jsonb)','EXECUTE') AND NOT has_function_privilege('anon','erp.command_provision_application_user(jsonb)','EXECUTE'),'browser direct command execution must remain denied');
SELECT pg_temp.assert_true(EXISTS(SELECT 1 FROM erp.role_permissions rp JOIN erp.app_roles r ON r.id=rp.role_id JOIN erp.app_permissions p ON p.id=rp.permission_id WHERE r.code='operations-manager' AND p.code='rental.approval.decide'),'Rental approval separation authority must remain mapped');

ROLLBACK;
