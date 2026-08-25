BEGIN;
CREATE OR REPLACE FUNCTION pg_temp.assert_true(value boolean,message text) RETURNS void LANGUAGE plpgsql AS $$BEGIN IF value IS DISTINCT FROM true THEN RAISE EXCEPTION 'ASSERT: %',message;END IF;END$$;

INSERT INTO erp.companies(id,code,name,active,environment_class) VALUES
 ('TENANT-DEACT-A','DEACTA','Deactivation A',true,'test'),
 ('TENANT-DEACT-B','DEACTB','Deactivation B',true,'test');
INSERT INTO auth.users(id,email,encrypted_password,aud,role) VALUES
 ('25600000-0000-4000-8000-000000000001','admin@deact.test','fixture','authenticated','authenticated'),
 ('25600000-0000-4000-8000-000000000002','ops@deact.test','fixture','authenticated','authenticated'),
 ('25600000-0000-4000-8000-000000000003','duplicate@deact.test','fixture','authenticated','authenticated'),
 ('25600000-0000-4000-8000-000000000004','finance@deact.test','fixture','authenticated','authenticated'),
 ('25600000-0000-4000-8000-000000000005','billing@deact.test','fixture','authenticated','authenticated'),
 ('25600000-0000-4000-8000-000000000006','other@deact.test','fixture','authenticated','authenticated');
INSERT INTO erp.users(id,username,display_name,email,status,company_id) VALUES
 ('25600000-0000-4000-8000-000000000001','admin.deact','Admin','admin@deact.test','active','TENANT-DEACT-A'),
 ('25600000-0000-4000-8000-000000000002','ops.deact','Original Operations Manager','ops@deact.test','active','TENANT-DEACT-A'),
 ('25600000-0000-4000-8000-000000000003','UAT Operations Manager 001','UAT Operations Manager 001','duplicate@deact.test','active','TENANT-DEACT-A'),
 ('25600000-0000-4000-8000-000000000004','finance.deact','Finance','finance@deact.test','active','TENANT-DEACT-A'),
 ('25600000-0000-4000-8000-000000000005','billing.deact','Billing','billing@deact.test','active','TENANT-DEACT-A'),
 ('25600000-0000-4000-8000-000000000006','other.deact','Other Tenant','other@deact.test','active','TENANT-DEACT-B');
INSERT INTO erp.user_roles(user_id,role_id,assigned_by)
SELECT value.user_id,role.id,'fixture'
FROM (VALUES
 ('25600000-0000-4000-8000-000000000001'::uuid,'system-administrator'),
 ('25600000-0000-4000-8000-000000000002'::uuid,'operations-manager'),
 ('25600000-0000-4000-8000-000000000003'::uuid,'operations-manager'),
 ('25600000-0000-4000-8000-000000000004'::uuid,'finance'),
 ('25600000-0000-4000-8000-000000000005'::uuid,'billing-staff')
) value(user_id,role_code)
JOIN erp.app_roles role ON role.code=value.role_code;

SELECT pg_temp.assert_true((erp.command_deactivate_application_user('{"actorId":"25600000-0000-4000-8000-000000000002","companyId":"TENANT-DEACT-A","targetUserId":"25600000-0000-4000-8000-000000000003","commandId":"ops-denied","idempotencyKey":"ops-denied"}'::jsonb)->>'code')='FORBIDDEN','Operations Manager denied');
SELECT pg_temp.assert_true((erp.command_deactivate_application_user('{"actorId":"25600000-0000-4000-8000-000000000004","companyId":"TENANT-DEACT-A","targetUserId":"25600000-0000-4000-8000-000000000003","commandId":"finance-denied","idempotencyKey":"finance-denied"}'::jsonb)->>'code')='FORBIDDEN','Finance denied');
SELECT pg_temp.assert_true((erp.command_deactivate_application_user('{"actorId":"25600000-0000-4000-8000-000000000005","companyId":"TENANT-DEACT-A","targetUserId":"25600000-0000-4000-8000-000000000003","commandId":"billing-denied","idempotencyKey":"billing-denied"}'::jsonb)->>'code')='FORBIDDEN','Billing denied');
SELECT pg_temp.assert_true((erp.command_deactivate_application_user('{"actorId":"25600000-0000-4000-8000-000000000001","companyId":"TENANT-DEACT-A","targetUserId":"25600000-0000-4000-8000-000000000001","commandId":"self","idempotencyKey":"self"}'::jsonb)->>'code')='SELF_DEACTIVATION','self denied');
SELECT pg_temp.assert_true((erp.command_deactivate_application_user('{"actorId":"25600000-0000-4000-8000-000000000001","companyId":"TENANT-DEACT-A","targetUserId":"25600000-0000-4000-8000-000000000006","commandId":"cross","idempotencyKey":"cross"}'::jsonb)->>'code')='NOT_FOUND','cross tenant hidden');

CREATE TEMP TABLE result AS SELECT erp.command_deactivate_application_user('{"actorId":"25600000-0000-4000-8000-000000000001","companyId":"TENANT-DEACT-A","targetUserId":"25600000-0000-4000-8000-000000000003","commandId":"deactivate-duplicate","idempotencyKey":"deactivate-duplicate"}'::jsonb) value;
SELECT pg_temp.assert_true((SELECT value->>'success'='true' FROM result),'deactivation succeeds');
SELECT pg_temp.assert_true((SELECT status='inactive' AND row_version=2 FROM erp.users WHERE id='25600000-0000-4000-8000-000000000003'),'row preserved inactive and versioned');
SELECT pg_temp.assert_true(EXISTS(SELECT 1 FROM auth.users WHERE id='25600000-0000-4000-8000-000000000003'),'Auth identity preserved');
SELECT pg_temp.assert_true(EXISTS(SELECT 1 FROM erp.user_roles ur JOIN erp.app_roles role ON role.id=ur.role_id WHERE ur.user_id='25600000-0000-4000-8000-000000000003' AND role.code='operations-manager'),'role membership preserved');
SELECT pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM erp.effective_user_permissions WHERE user_id='25600000-0000-4000-8000-000000000003'),'inactive permissions suppressed');
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM erp.audit_log WHERE aggregate_id='25600000-0000-4000-8000-000000000003' AND action='USER_DEACTIVATED'),'one audit');
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM erp.user_provisioning_commands WHERE company_id='TENANT-DEACT-A' AND idempotency_key='deactivate-duplicate'),'one command');
SELECT pg_temp.assert_true((erp.command_deactivate_application_user('{"actorId":"25600000-0000-4000-8000-000000000001","companyId":"TENANT-DEACT-A","targetUserId":"25600000-0000-4000-8000-000000000003","commandId":"deactivate-duplicate","idempotencyKey":"deactivate-duplicate"}'::jsonb)->>'replayed')='true','same replay');
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM erp.audit_log WHERE aggregate_id='25600000-0000-4000-8000-000000000003' AND action='USER_DEACTIVATED'),'replay does not duplicate audit');
SELECT pg_temp.assert_true((erp.command_deactivate_application_user('{"actorId":"25600000-0000-4000-8000-000000000001","companyId":"TENANT-DEACT-A","targetUserId":"25600000-0000-4000-8000-000000000002","commandId":"mismatch","idempotencyKey":"deactivate-duplicate"}'::jsonb)->>'code')='IDEMPOTENCY_MISMATCH','mismatch rejected');
SELECT pg_temp.assert_true((erp.command_deactivate_application_user('{"actorId":"25600000-0000-4000-8000-000000000001","companyId":"TENANT-DEACT-A","targetUserId":"25600000-0000-4000-8000-000000000003","commandId":"inactive","idempotencyKey":"inactive"}'::jsonb)->>'code')='ALREADY_INACTIVE','already inactive deterministic');
SELECT pg_temp.assert_true((SELECT status='active' FROM erp.users WHERE id='25600000-0000-4000-8000-000000000002'),'original Operations Manager untouched');
SELECT pg_temp.assert_true(NOT has_function_privilege('authenticated','erp.command_deactivate_application_user(jsonb)','EXECUTE') AND NOT has_function_privilege('anon','erp.command_deactivate_application_user(jsonb)','EXECUTE'),'browser direct execution denied');
ROLLBACK;
