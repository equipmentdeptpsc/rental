\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION pg_temp.assert_true(value boolean,message text) RETURNS void LANGUAGE plpgsql AS $$BEGIN IF value IS NOT TRUE THEN RAISE EXCEPTION 'ASSERT: %',message;END IF;END$$;

INSERT INTO erp.companies(id,code,name,active,environment_class) VALUES
 ('TENANT-ACT-A','ACTA','Activity A',true,'test'),('TENANT-ACT-B','ACTB','Activity B',true,'test'),('TENANT-ACT-I','ACTI','Activity Inactive',false,'test');
INSERT INTO auth.users(id,email) VALUES
 ('50000000-0000-4000-8000-000000000001','activity.admin.a@example.test'),('50000000-0000-4000-8000-000000000002','activity.ops@example.test'),
 ('50000000-0000-4000-8000-000000000003','activity.inactive@example.test'),('50000000-0000-4000-8000-000000000004','activity.company@example.test'),
 ('50000000-0000-4000-8000-000000000005','activity.auth.only@example.test'),('50000000-0000-4000-8000-000000000006','activity.admin.b@example.test');
INSERT INTO erp.users(id,username,display_name,email,status,company_id) VALUES
 ('50000000-0000-4000-8000-000000000001','activity.admin.a','Activity Admin A','activity.admin.a@example.test','active','TENANT-ACT-A'),
 ('50000000-0000-4000-8000-000000000002','activity.ops','Activity Ops','activity.ops@example.test','active','TENANT-ACT-A'),
 ('50000000-0000-4000-8000-000000000003','activity.inactive','Activity Inactive','activity.inactive@example.test','inactive','TENANT-ACT-A'),
 ('50000000-0000-4000-8000-000000000004','activity.company','Activity Company','activity.company@example.test','active','TENANT-ACT-I'),
 ('50000000-0000-4000-8000-000000000006','activity.admin.b','Activity Admin B','activity.admin.b@example.test','active','TENANT-ACT-B');
INSERT INTO erp.user_roles(user_id,role_id)
SELECT u.id,r.id FROM (VALUES
 ('50000000-0000-4000-8000-000000000001'::uuid,'system-administrator'),('50000000-0000-4000-8000-000000000002'::uuid,'rental-operations'),
 ('50000000-0000-4000-8000-000000000003'::uuid,'system-administrator'),('50000000-0000-4000-8000-000000000004'::uuid,'system-administrator'),
 ('50000000-0000-4000-8000-000000000006'::uuid,'system-administrator')) u(id,role_code) JOIN erp.app_roles r ON r.code=u.role_code;
INSERT INTO erp.role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM erp.app_roles r CROSS JOIN erp.app_permissions p
WHERE r.code='system-administrator' AND p.code='rental.manage'
ON CONFLICT(role_id,permission_id) DO NOTHING;

SELECT pg_temp.assert_true((SELECT count(*)=1 FROM erp.app_permissions WHERE code='activity_code.create'),'permission once');
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM erp.role_permissions rp JOIN erp.app_roles r ON r.id=rp.role_id JOIN erp.app_permissions p ON p.id=rp.permission_id WHERE r.code='system-administrator' AND p.code='activity_code.create'),'admin mapping once');
SELECT pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM erp.role_permissions rp JOIN erp.app_roles r ON r.id=rp.role_id JOIN erp.app_permissions p ON p.id=rp.permission_id WHERE r.code<>'system-administrator' AND p.code='activity_code.create'),'other mappings absent');

SELECT set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000001',true);
CREATE TEMP TABLE accepted AS SELECT erp.command_create_activity_code(jsonb_build_object('commandId','activity-ok','idempotencyKey','activity-ok','activityCodeId','51000000-0000-4000-8000-000000000001','code',' Mixed-Case ','name',' Global Activity ','sortOrder',17)) value;
SELECT pg_temp.assert_true((SELECT value->>'success'='true' AND value->>'disposition'='ACCEPTED' AND value->'value'@>'{"id":"51000000-0000-4000-8000-000000000001","code":"Mixed-Case","name":"Global Activity","active":true,"sortOrder":17,"rowVersion":1}'::jsonb FROM accepted),'authorized canonical create response');
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM erp.activity_codes WHERE id='51000000-0000-4000-8000-000000000001'),'row once');
SELECT pg_temp.assert_true((SELECT code='Mixed-Case' AND name='Global Activity' AND active AND sort_order=17 AND deleted_at IS NULL AND row_version=1 FROM erp.activity_codes WHERE id='51000000-0000-4000-8000-000000000001'),'trim and forced state');
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM erp.audit_log WHERE aggregate_id='51000000-0000-4000-8000-000000000001' AND aggregate_type='ActivityCode' AND action='ACTIVITY_CODE_CREATED' AND company_id='TENANT-ACT-A' AND actor_id='50000000-0000-4000-8000-000000000001' AND correlation_id='activity-ok' AND new_values@>'{"active":true,"sortOrder":17,"rowVersion":1}'::jsonb),'audit evidence once');
CREATE TEMP TABLE replayed AS SELECT erp.command_create_activity_code(jsonb_build_object('commandId','activity-ok','idempotencyKey','activity-ok','activityCodeId','51000000-0000-4000-8000-000000000001','code',' Mixed-Case ','name',' Global Activity ','sortOrder',17)) value;
SELECT pg_temp.assert_true((SELECT value->>'disposition'='REPLAYED' AND value-'disposition'=(SELECT value-'disposition' FROM accepted) FROM replayed),'exact replay result');
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM erp.activity_codes WHERE id='51000000-0000-4000-8000-000000000001') AND (SELECT count(*)=1 FROM erp.audit_log WHERE aggregate_id='51000000-0000-4000-8000-000000000001' AND action='ACTIVITY_CODE_CREATED'),'replay cardinality');
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM erp.operational_command_idempotency WHERE company_id='TENANT-ACT-A' AND command_type='CREATE_ACTIVITY_CODE' AND target_aggregate_type='ACTIVITY_CODE' AND target_aggregate_id='51000000-0000-4000-8000-000000000001' AND command_status='COMPLETED'),'completed command once');
SELECT pg_temp.assert_true((erp.command_create_activity_code(jsonb_build_object('commandId','activity-mm','idempotencyKey','activity-ok','activityCodeId','51000000-0000-4000-8000-000000000009','code','Changed','name','Changed'))->>'code')='IDEMPOTENCY_MISMATCH','mismatch');

SELECT pg_temp.assert_true((erp.command_create_activity_code(jsonb_build_object('commandId','activity-code-conflict','idempotencyKey','activity-code-conflict','activityCodeId','51000000-0000-4000-8000-000000000002','code','mixed-case','name','Other'))->>'code')='ACTIVITY_CODE_CONFLICT','normalized code conflict');
SELECT pg_temp.assert_true((erp.command_create_activity_code(jsonb_build_object('commandId','activity-id-conflict','idempotencyKey','activity-id-conflict','activityCodeId','51000000-0000-4000-8000-000000000001','code','OTHER','name','Other'))->>'code')='ACTIVITY_CODE_ID_CONFLICT','id conflict');
SELECT pg_temp.assert_true((erp.command_create_activity_code(jsonb_build_object('commandId','default-sort','idempotencyKey','default-sort','activityCodeId','51000000-0000-4000-8000-000000000003','code','DEFAULT-SORT','name','Default Sort'))->'value'->>'sortOrder')='0','default sort');
SELECT pg_temp.assert_true((erp.command_create_activity_code(jsonb_build_object('commandId','bad-sort','idempotencyKey','bad-sort','activityCodeId','51000000-0000-4000-8000-000000000004','code','BAD-SORT','name','Bad Sort','sortOrder',1.5))->>'code')='VALIDATION_REJECTED','fractional sort');
SELECT pg_temp.assert_true((erp.command_create_activity_code(jsonb_build_object('commandId','bad-sort-range','idempotencyKey','bad-sort-range','activityCodeId','51000000-0000-4000-8000-000000000004','code','BAD-SORT','name','Bad Sort','sortOrder',999999999999))->>'code')='VALIDATION_REJECTED','sort range');
SELECT pg_temp.assert_true((erp.command_create_activity_code(jsonb_build_object('commandId','unknown','idempotencyKey','unknown','activityCodeId','51000000-0000-4000-8000-000000000004','code','UNKNOWN','name','Unknown','unexpected',true))->>'code')='VALIDATION_REJECTED','unknown field');
SELECT pg_temp.assert_true((erp.command_create_activity_code(jsonb_build_object('commandId','authority','idempotencyKey','authority','activityCodeId','51000000-0000-4000-8000-000000000004','code','AUTH','name','Authority','companyId','TENANT-ACT-B'))->>'code')='VALIDATION_REJECTED','authority field');
SELECT pg_temp.assert_true((erp.command_create_activity_code(jsonb_build_object('commandId','uuid','idempotencyKey','uuid','activityCodeId','not-a-uuid','code','UUID','name','UUID'))->>'code')='VALIDATION_REJECTED','uuid');
SELECT pg_temp.assert_true((erp.command_create_activity_code(jsonb_build_object('commandId','uuid-space','idempotencyKey','uuid-space','activityCodeId',' 51000000-0000-4000-8000-000000000004 ','code','UUID','name','UUID'))->>'code')='VALIDATION_REJECTED','uuid trim rejection');
SELECT pg_temp.assert_true((erp.command_create_activity_code(jsonb_build_object('commandId','blank-code','idempotencyKey','blank-code','activityCodeId','51000000-0000-4000-8000-000000000004','code',' ','name','Name'))->>'code')='VALIDATION_REJECTED','blank code');
SELECT pg_temp.assert_true((erp.command_create_activity_code(jsonb_build_object('commandId','blank-name','idempotencyKey','blank-name','activityCodeId','51000000-0000-4000-8000-000000000004','code','CODE','name',' '))->>'code')='VALIDATION_REJECTED','blank name');

SELECT set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000002',true);
SELECT pg_temp.assert_true((erp.command_create_activity_code(jsonb_build_object('commandId','ops','idempotencyKey','ops','activityCodeId','51000000-0000-4000-8000-000000000005','code','OPS','name','Ops'))->>'code')='FORBIDDEN','missing permission');
SELECT set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000003',true);
SELECT pg_temp.assert_true((erp.command_create_activity_code('{}'::jsonb)->>'code')='UNAUTHENTICATED','inactive user');
SELECT set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000004',true);
SELECT pg_temp.assert_true((erp.command_create_activity_code('{}'::jsonb)->>'code')='UNAUTHENTICATED','inactive company');
SELECT set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000005',true);
SELECT pg_temp.assert_true((erp.command_create_activity_code('{}'::jsonb)->>'code')='UNAUTHENTICATED','missing canonical user');

SELECT set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000001',true);
CREATE FUNCTION pg_temp.fail_activity_audit() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN IF NEW.action='ACTIVITY_CODE_CREATED' AND NEW.correlation_id='audit-fail' THEN RAISE EXCEPTION 'forced audit failure';END IF;RETURN NEW;END$$;
CREATE TRIGGER cert_fail_activity_audit BEFORE INSERT ON erp.audit_log FOR EACH ROW EXECUTE FUNCTION pg_temp.fail_activity_audit();
SELECT pg_temp.assert_true((erp.command_create_activity_code(jsonb_build_object('commandId','audit-fail','idempotencyKey','audit-fail','activityCodeId','51000000-0000-4000-8000-000000000006','code','AUDIT-FAIL','name','Audit Fail'))->>'code')='PERSISTENCE_FAILURE','audit failure controlled');
DROP TRIGGER cert_fail_activity_audit ON erp.audit_log;
SELECT pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM erp.activity_codes WHERE id='51000000-0000-4000-8000-000000000006') AND NOT EXISTS(SELECT 1 FROM erp.audit_log WHERE aggregate_id='51000000-0000-4000-8000-000000000006') AND NOT EXISTS(SELECT 1 FROM erp.operational_command_idempotency WHERE idempotency_key='audit-fail'),'audit rollback');
CREATE FUNCTION pg_temp.fail_activity_finish() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN IF NEW.command_type='CREATE_ACTIVITY_CODE' AND NEW.idempotency_key='finish-fail' THEN RAISE EXCEPTION 'forced finish failure';END IF;RETURN NEW;END$$;
CREATE TRIGGER cert_fail_activity_finish BEFORE INSERT ON erp.operational_command_idempotency FOR EACH ROW EXECUTE FUNCTION pg_temp.fail_activity_finish();
SELECT pg_temp.assert_true((erp.command_create_activity_code(jsonb_build_object('commandId','finish-fail','idempotencyKey','finish-fail','activityCodeId','51000000-0000-4000-8000-000000000007','code','FINISH-FAIL','name','Finish Fail'))->>'code')='PERSISTENCE_FAILURE','finish failure controlled');
DROP TRIGGER cert_fail_activity_finish ON erp.operational_command_idempotency;
SELECT pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM erp.activity_codes WHERE id='51000000-0000-4000-8000-000000000007') AND NOT EXISTS(SELECT 1 FROM erp.audit_log WHERE aggregate_id='51000000-0000-4000-8000-000000000007') AND NOT EXISTS(SELECT 1 FROM erp.operational_command_idempotency WHERE idempotency_key='finish-fail'),'finish rollback');

SELECT set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000006',true);
SELECT pg_temp.assert_true((erp.read_canonical_rental_reference_data()->'activityCodes') @> '[{"id":"51000000-0000-4000-8000-000000000001"}]'::jsonb,'global rental visibility company B');

SELECT set_config('request.jwt.claim.sub','',true);
SELECT pg_temp.assert_true((erp.command_create_activity_code('{}'::jsonb)->>'code')='UNAUTHENTICATED','unauthenticated');
SELECT pg_temp.assert_true(has_function_privilege('authenticated','erp.command_create_activity_code(jsonb)','EXECUTE') AND NOT has_function_privilege('anon','erp.command_create_activity_code(jsonb)','EXECUTE') AND NOT has_function_privilege('public','erp.command_create_activity_code(jsonb)','EXECUTE') AND NOT has_function_privilege('service_role','erp.command_create_activity_code(jsonb)','EXECUTE'),'RPC matrix');
SELECT pg_temp.assert_true(NOT has_table_privilege('authenticated','erp.activity_codes','INSERT') AND NOT has_table_privilege('authenticated','erp.activity_codes','UPDATE') AND NOT has_table_privilege('authenticated','erp.activity_codes','DELETE') AND NOT has_table_privilege('anon','erp.activity_codes','INSERT') AND NOT has_table_privilege('public','erp.activity_codes','INSERT'),'direct DML denied');
ROLLBACK;
SELECT 'CANONICAL_ACTIVITY_CODE_DATABASE_SEQUENTIAL_CERTIFICATION_PASS';
