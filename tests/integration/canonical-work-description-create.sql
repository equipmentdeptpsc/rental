\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION pg_temp.assert_true(value boolean,message text) RETURNS void LANGUAGE plpgsql AS $$BEGIN IF value IS NOT TRUE THEN RAISE EXCEPTION 'ASSERT: %',message;END IF;END$$;

INSERT INTO erp.companies(id,code,name,active,environment_class) VALUES
 ('TENANT-WORK-A','WORKA','Work A',true,'test'),('TENANT-WORK-B','WORKB','Work B',true,'test'),('TENANT-WORK-I','WORKI','Work Inactive',false,'test');
INSERT INTO auth.users(id,email) VALUES
 ('63000000-0000-4000-8000-000000000001','work.admin.a@example.test'),('63000000-0000-4000-8000-000000000002','work.ops@example.test'),
 ('63000000-0000-4000-8000-000000000003','work.inactive@example.test'),('63000000-0000-4000-8000-000000000004','work.company@example.test'),
 ('63000000-0000-4000-8000-000000000005','work.auth.only@example.test'),('63000000-0000-4000-8000-000000000006','work.admin.b@example.test');
INSERT INTO erp.users(id,username,display_name,email,status,company_id) VALUES
 ('63000000-0000-4000-8000-000000000001','work.admin.a','Work Admin A','work.admin.a@example.test','active','TENANT-WORK-A'),
 ('63000000-0000-4000-8000-000000000002','work.ops','Work Ops','work.ops@example.test','active','TENANT-WORK-A'),
 ('63000000-0000-4000-8000-000000000003','work.inactive','Work Inactive','work.inactive@example.test','inactive','TENANT-WORK-A'),
 ('63000000-0000-4000-8000-000000000004','work.company','Work Company','work.company@example.test','active','TENANT-WORK-I'),
 ('63000000-0000-4000-8000-000000000006','work.admin.b','Work Admin B','work.admin.b@example.test','active','TENANT-WORK-B');
INSERT INTO erp.user_roles(user_id,role_id)
SELECT u.id,r.id FROM (VALUES
 ('63000000-0000-4000-8000-000000000001'::uuid,'system-administrator'),('63000000-0000-4000-8000-000000000002'::uuid,'rental-operations'),
 ('63000000-0000-4000-8000-000000000003'::uuid,'system-administrator'),('63000000-0000-4000-8000-000000000004'::uuid,'system-administrator'),
 ('63000000-0000-4000-8000-000000000006'::uuid,'system-administrator')) u(id,role_code) JOIN erp.app_roles r ON r.code=u.role_code;

SELECT pg_temp.assert_true((SELECT count(*)=1 FROM erp.app_permissions WHERE code='work_description.create'),'permission once');
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM erp.role_permissions rp JOIN erp.app_roles r ON r.id=rp.role_id JOIN erp.app_permissions p ON p.id=rp.permission_id WHERE r.code='system-administrator' AND p.code='work_description.create'),'admin mapping once');
SELECT pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM erp.role_permissions rp JOIN erp.app_roles r ON r.id=rp.role_id JOIN erp.app_permissions p ON p.id=rp.permission_id WHERE r.code<>'system-administrator' AND p.code='work_description.create'),'other mappings absent');

SELECT set_config('request.jwt.claim.sub','63000000-0000-4000-8000-000000000001',true);
CREATE TEMP TABLE accepted AS SELECT erp.command_create_work_description(jsonb_build_object('commandId','work-ok','idempotencyKey','work-ok','workDescriptionId','63100000-0000-4000-8000-000000000001','code',' Mixed   Case ','name',' Global   Work ','requiresRemarks',true,'sortOrder',17)) value;
SELECT pg_temp.assert_true((SELECT value->>'success'='true' AND value->>'disposition'='ACCEPTED' AND value->'value'@>'{"id":"63100000-0000-4000-8000-000000000001","code":"Mixed Case","name":"Global Work","requiresRemarks":true,"active":true,"sortOrder":17,"rowVersion":1}'::jsonb FROM accepted),'authorized canonical create response');
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM erp.work_descriptions WHERE id='63100000-0000-4000-8000-000000000001' AND code='Mixed Case' AND name='Global Work' AND requires_remarks AND active AND sort_order=17 AND deleted_at IS NULL AND row_version=1),'normalized row once');
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM erp.audit_log WHERE aggregate_id='63100000-0000-4000-8000-000000000001' AND aggregate_type='WorkDescription' AND action='WORK_DESCRIPTION_CREATED' AND company_id='TENANT-WORK-A' AND actor_id='63000000-0000-4000-8000-000000000001' AND correlation_id='work-ok'),'audit evidence once');
CREATE TEMP TABLE replayed AS SELECT erp.command_create_work_description(jsonb_build_object('commandId','work-ok','idempotencyKey','work-ok','workDescriptionId','63100000-0000-4000-8000-000000000001','code',' Mixed   Case ','name',' Global   Work ','requiresRemarks',true,'sortOrder',17)) value;
SELECT pg_temp.assert_true((SELECT value->>'disposition'='REPLAYED' AND value-'disposition'=(SELECT value-'disposition' FROM accepted) FROM replayed),'exact replay result');
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM erp.work_descriptions WHERE id='63100000-0000-4000-8000-000000000001') AND (SELECT count(*)=1 FROM erp.audit_log WHERE aggregate_id='63100000-0000-4000-8000-000000000001' AND action='WORK_DESCRIPTION_CREATED'),'replay cardinality');
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM erp.operational_command_idempotency WHERE company_id='TENANT-WORK-A' AND command_type='CREATE_WORK_DESCRIPTION' AND target_aggregate_type='WORK_DESCRIPTION' AND command_status='COMPLETED'),'completed command once');
SELECT pg_temp.assert_true((erp.command_create_work_description(jsonb_build_object('commandId','work-mm','idempotencyKey','work-ok','workDescriptionId','63100000-0000-4000-8000-000000000009','code','Changed','name','Changed'))->>'code')='IDEMPOTENCY_MISMATCH','mismatch');

SELECT pg_temp.assert_true((erp.command_create_work_description(jsonb_build_object('commandId','code-conflict','idempotencyKey','code-conflict','workDescriptionId','63100000-0000-4000-8000-000000000002','code','mixed case','name','Other'))->>'code')='WORK_DESCRIPTION_CODE_CONFLICT','normalized code conflict');
SELECT pg_temp.assert_true((erp.command_create_work_description(jsonb_build_object('commandId','name-conflict','idempotencyKey','name-conflict','workDescriptionId','63100000-0000-4000-8000-000000000003','code','OTHER','name','global    work'))->>'code')='WORK_DESCRIPTION_NAME_CONFLICT','normalized name conflict');
SELECT pg_temp.assert_true((erp.command_create_work_description(jsonb_build_object('commandId','id-conflict','idempotencyKey','id-conflict','workDescriptionId','63100000-0000-4000-8000-000000000001','code','ID-OTHER','name','ID Other'))->>'code')='WORK_DESCRIPTION_ID_CONFLICT','id conflict');
CREATE TEMP TABLE defaulted AS SELECT erp.command_create_work_description(jsonb_build_object('commandId','defaults','idempotencyKey','defaults','workDescriptionId','63100000-0000-4000-8000-000000000004','code','DEFAULTS','name','Defaults')) value;
SELECT pg_temp.assert_true((SELECT value->'value'@>'{"requiresRemarks":false,"sortOrder":0}'::jsonb FROM defaulted),'defaults');
SELECT pg_temp.assert_true((erp.command_create_work_description(jsonb_build_object('commandId','bad-bool','idempotencyKey','bad-bool','workDescriptionId','63100000-0000-4000-8000-000000000005','code','BAD','name','Bad','requiresRemarks','false'))->>'code')='VALIDATION_REJECTED','requires remarks type');
SELECT pg_temp.assert_true((erp.command_create_work_description(jsonb_build_object('commandId','bad-sort','idempotencyKey','bad-sort','workDescriptionId','63100000-0000-4000-8000-000000000005','code','BAD','name','Bad','sortOrder',1.5))->>'code')='VALIDATION_REJECTED','fractional sort');
SELECT pg_temp.assert_true((erp.command_create_work_description(jsonb_build_object('commandId','bad-sort-range','idempotencyKey','bad-sort-range','workDescriptionId','63100000-0000-4000-8000-000000000005','code','BAD','name','Bad','sortOrder',999999999999))->>'code')='VALIDATION_REJECTED','sort range');
SELECT pg_temp.assert_true((erp.command_create_work_description(jsonb_build_object('commandId','blank-code','idempotencyKey','blank-code','workDescriptionId','63100000-0000-4000-8000-000000000005','code',' ','name','Name'))->>'code')='VALIDATION_REJECTED','blank code');
SELECT pg_temp.assert_true((erp.command_create_work_description(jsonb_build_object('commandId','blank-name','idempotencyKey','blank-name','workDescriptionId','63100000-0000-4000-8000-000000000005','code','CODE','name',' '))->>'code')='VALIDATION_REJECTED','blank name');
SELECT pg_temp.assert_true((erp.command_create_work_description(jsonb_build_object('commandId','authority','idempotencyKey','authority','workDescriptionId','63100000-0000-4000-8000-000000000005','code','AUTH','name','Authority','companyId','TENANT-WORK-B'))->>'code')='VALIDATION_REJECTED','company authority rejected');

SELECT set_config('request.jwt.claim.sub','63000000-0000-4000-8000-000000000002',true);
SELECT pg_temp.assert_true((erp.command_create_work_description(jsonb_build_object('commandId','ops','idempotencyKey','ops','workDescriptionId','63100000-0000-4000-8000-000000000005','code','OPS','name','Ops'))->>'code')='FORBIDDEN','unauthorized role');
SELECT set_config('request.jwt.claim.sub','63000000-0000-4000-8000-000000000003',true);
SELECT pg_temp.assert_true((erp.command_create_work_description('{}'::jsonb)->>'code')='UNAUTHENTICATED','inactive user');
SELECT set_config('request.jwt.claim.sub','63000000-0000-4000-8000-000000000004',true);
SELECT pg_temp.assert_true((erp.command_create_work_description('{}'::jsonb)->>'code')='UNAUTHENTICATED','inactive company');
SELECT set_config('request.jwt.claim.sub','63000000-0000-4000-8000-000000000005',true);
SELECT pg_temp.assert_true((erp.command_create_work_description('{}'::jsonb)->>'code')='UNAUTHENTICATED','missing canonical user');

SELECT set_config('request.jwt.claim.sub','63000000-0000-4000-8000-000000000001',true);
CREATE FUNCTION pg_temp.fail_work_audit() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN IF NEW.action='WORK_DESCRIPTION_CREATED' AND NEW.correlation_id='audit-fail' THEN RAISE EXCEPTION 'forced audit failure';END IF;RETURN NEW;END$$;
CREATE TRIGGER cert_fail_work_audit BEFORE INSERT ON erp.audit_log FOR EACH ROW EXECUTE FUNCTION pg_temp.fail_work_audit();
SELECT pg_temp.assert_true((erp.command_create_work_description(jsonb_build_object('commandId','audit-fail','idempotencyKey','audit-fail','workDescriptionId','63100000-0000-4000-8000-000000000006','code','AUDIT-FAIL','name','Audit Fail'))->>'code')='PERSISTENCE_FAILURE','audit failure controlled');
DROP TRIGGER cert_fail_work_audit ON erp.audit_log;
SELECT pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM erp.work_descriptions WHERE id='63100000-0000-4000-8000-000000000006') AND NOT EXISTS(SELECT 1 FROM erp.audit_log WHERE aggregate_id='63100000-0000-4000-8000-000000000006') AND NOT EXISTS(SELECT 1 FROM erp.operational_command_idempotency WHERE idempotency_key='audit-fail'),'audit rollback');
CREATE FUNCTION pg_temp.fail_work_finish() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN IF NEW.command_type='CREATE_WORK_DESCRIPTION' AND NEW.idempotency_key='finish-fail' THEN RAISE EXCEPTION 'forced finish failure';END IF;RETURN NEW;END$$;
CREATE TRIGGER cert_fail_work_finish BEFORE INSERT ON erp.operational_command_idempotency FOR EACH ROW EXECUTE FUNCTION pg_temp.fail_work_finish();
SELECT pg_temp.assert_true((erp.command_create_work_description(jsonb_build_object('commandId','finish-fail','idempotencyKey','finish-fail','workDescriptionId','63100000-0000-4000-8000-000000000007','code','FINISH-FAIL','name','Finish Fail'))->>'code')='PERSISTENCE_FAILURE','finish failure controlled');
DROP TRIGGER cert_fail_work_finish ON erp.operational_command_idempotency;
SELECT pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM erp.work_descriptions WHERE id='63100000-0000-4000-8000-000000000007') AND NOT EXISTS(SELECT 1 FROM erp.audit_log WHERE aggregate_id='63100000-0000-4000-8000-000000000007') AND NOT EXISTS(SELECT 1 FROM erp.operational_command_idempotency WHERE idempotency_key='finish-fail'),'finish rollback');

SELECT set_config('request.jwt.claim.sub','63000000-0000-4000-8000-000000000006',true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true(EXISTS(SELECT 1 FROM erp.work_descriptions WHERE id='63100000-0000-4000-8000-000000000001'),'global authenticated read from company B');
RESET ROLE;

SELECT set_config('request.jwt.claim.sub','',true);
SELECT pg_temp.assert_true((erp.command_create_work_description('{}'::jsonb)->>'code')='UNAUTHENTICATED','unauthenticated');
SELECT pg_temp.assert_true(has_function_privilege('authenticated','erp.command_create_work_description(jsonb)','EXECUTE') AND NOT has_function_privilege('anon','erp.command_create_work_description(jsonb)','EXECUTE') AND NOT has_function_privilege('public','erp.command_create_work_description(jsonb)','EXECUTE') AND NOT has_function_privilege('service_role','erp.command_create_work_description(jsonb)','EXECUTE'),'RPC matrix');
SELECT pg_temp.assert_true(has_table_privilege('authenticated','erp.work_descriptions','SELECT') AND NOT has_table_privilege('authenticated','erp.work_descriptions','INSERT') AND NOT has_table_privilege('authenticated','erp.work_descriptions','UPDATE') AND NOT has_table_privilege('authenticated','erp.work_descriptions','DELETE'),'authenticated read-only matrix');
ROLLBACK;
SELECT 'CANONICAL_WORK_DESCRIPTION_DATABASE_SEQUENTIAL_CERTIFICATION_PASS';
