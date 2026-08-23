\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION pg_temp.assert_true(value boolean,message text) RETURNS void LANGUAGE plpgsql AS $$BEGIN IF value IS NOT TRUE THEN RAISE EXCEPTION 'ASSERT: %',message;END IF;END$$;

INSERT INTO erp.companies(id,code,name,active,environment_class) VALUES
 ('TENANT-COST-A','COSTA','Cost A',true,'test'),('TENANT-COST-B','COSTB','Cost B',true,'test'),('TENANT-COST-I','COSTI','Cost Inactive',false,'test');
INSERT INTO auth.users(id,email) VALUES
 ('40000000-0000-4000-8000-000000000001','cost.admin.a@example.test'),('40000000-0000-4000-8000-000000000002','cost.ops@example.test'),
 ('40000000-0000-4000-8000-000000000003','cost.inactive@example.test'),('40000000-0000-4000-8000-000000000004','cost.company@example.test'),
 ('40000000-0000-4000-8000-000000000005','cost.auth.only@example.test'),('40000000-0000-4000-8000-000000000006','cost.admin.b@example.test');
INSERT INTO erp.users(id,username,display_name,email,status,company_id) VALUES
 ('40000000-0000-4000-8000-000000000001','cost.admin.a','Cost Admin A','cost.admin.a@example.test','active','TENANT-COST-A'),
 ('40000000-0000-4000-8000-000000000002','cost.ops','Cost Ops','cost.ops@example.test','active','TENANT-COST-A'),
 ('40000000-0000-4000-8000-000000000003','cost.inactive','Cost Inactive','cost.inactive@example.test','inactive','TENANT-COST-A'),
 ('40000000-0000-4000-8000-000000000004','cost.company','Cost Company','cost.company@example.test','active','TENANT-COST-I'),
 ('40000000-0000-4000-8000-000000000006','cost.admin.b','Cost Admin B','cost.admin.b@example.test','active','TENANT-COST-B');
INSERT INTO erp.user_roles(user_id,role_id)
SELECT u.id,r.id FROM (VALUES
 ('40000000-0000-4000-8000-000000000001'::uuid,'system-administrator'),('40000000-0000-4000-8000-000000000002'::uuid,'rental-operations'),
 ('40000000-0000-4000-8000-000000000003'::uuid,'system-administrator'),('40000000-0000-4000-8000-000000000004'::uuid,'system-administrator'),
 ('40000000-0000-4000-8000-000000000006'::uuid,'system-administrator')) u(id,role_code) JOIN erp.app_roles r ON r.code=u.role_code;

SELECT pg_temp.assert_true((SELECT count(*)=1 FROM erp.app_permissions WHERE code='cost_code.create'),'permission once');
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM erp.role_permissions rp JOIN erp.app_roles r ON r.id=rp.role_id JOIN erp.app_permissions p ON p.id=rp.permission_id WHERE r.code='system-administrator' AND p.code='cost_code.create'),'admin mapping once');
SELECT pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM erp.role_permissions rp JOIN erp.app_roles r ON r.id=rp.role_id JOIN erp.app_permissions p ON p.id=rp.permission_id WHERE r.code<>'system-administrator' AND p.code='cost_code.create'),'other mappings absent');

SELECT set_config('request.jwt.claim.sub','40000000-0000-4000-8000-000000000001',true);
CREATE TEMP TABLE accepted AS SELECT erp.command_create_cost_code(jsonb_build_object('commandId','cost-ok','idempotencyKey','cost-ok','costCodeId','41000000-0000-4000-8000-000000000001','code',' Mixed-Case ','name',' Global Cost ','sortOrder',17)) value;
SELECT pg_temp.assert_true((SELECT value->>'success'='true' AND value->>'disposition'='ACCEPTED' FROM accepted),'authorized create');
SELECT pg_temp.assert_true((SELECT code='Mixed-Case' AND name='Global Cost' AND active AND sort_order=17 AND deleted_at IS NULL AND row_version=1 FROM erp.cost_codes WHERE id='41000000-0000-4000-8000-000000000001'),'trim and forced state');
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM erp.audit_log WHERE aggregate_id='41000000-0000-4000-8000-000000000001' AND action='COST_CODE_CREATED' AND company_id='TENANT-COST-A' AND actor_id='40000000-0000-4000-8000-000000000001' AND correlation_id='cost-ok' AND new_values@>'{"active":true,"sortOrder":17,"rowVersion":1}'::jsonb),'audit evidence once');
SELECT pg_temp.assert_true((erp.command_create_cost_code(jsonb_build_object('commandId','cost-ok','idempotencyKey','cost-ok','costCodeId','41000000-0000-4000-8000-000000000001','code',' Mixed-Case ','name',' Global Cost ','sortOrder',17))->>'disposition')='REPLAYED','replay');
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM erp.operational_command_idempotency WHERE company_id='TENANT-COST-A' AND command_type='CREATE_COST_CODE' AND target_aggregate_type='COST_CODE' AND target_aggregate_id='41000000-0000-4000-8000-000000000001'),'command once');
SELECT pg_temp.assert_true((erp.command_create_cost_code(jsonb_build_object('commandId','cost-mm','idempotencyKey','cost-ok','costCodeId','41000000-0000-4000-8000-000000000009','code','Changed','name','Changed'))->>'code')='IDEMPOTENCY_MISMATCH','mismatch');

SELECT pg_temp.assert_true((erp.command_create_cost_code(jsonb_build_object('commandId','cost-code-conflict','idempotencyKey','cost-code-conflict','costCodeId','41000000-0000-4000-8000-000000000002','code','mixed-case','name','Other'))->>'code')='COST_CODE_CONFLICT','normalized code conflict');
SELECT pg_temp.assert_true((erp.command_create_cost_code(jsonb_build_object('commandId','cost-id-conflict','idempotencyKey','cost-id-conflict','costCodeId','41000000-0000-4000-8000-000000000001','code','OTHER','name','Other'))->>'code')='COST_CODE_ID_CONFLICT','id conflict');
SELECT pg_temp.assert_true((erp.command_create_cost_code(jsonb_build_object('commandId','default-sort','idempotencyKey','default-sort','costCodeId','41000000-0000-4000-8000-000000000003','code','DEFAULT-SORT','name','Default Sort'))->'value'->>'sortOrder')='0','default sort');
SELECT pg_temp.assert_true((erp.command_create_cost_code(jsonb_build_object('commandId','bad-sort','idempotencyKey','bad-sort','costCodeId','41000000-0000-4000-8000-000000000004','code','BAD-SORT','name','Bad Sort','sortOrder',1.5))->>'code')='VALIDATION_REJECTED','fractional sort');
SELECT pg_temp.assert_true((erp.command_create_cost_code(jsonb_build_object('commandId','bad-sort-range','idempotencyKey','bad-sort-range','costCodeId','41000000-0000-4000-8000-000000000004','code','BAD-SORT','name','Bad Sort','sortOrder',999999999999))->>'code')='VALIDATION_REJECTED','sort range');
SELECT pg_temp.assert_true((erp.command_create_cost_code(jsonb_build_object('commandId','unknown','idempotencyKey','unknown','costCodeId','41000000-0000-4000-8000-000000000004','code','UNKNOWN','name','Unknown','unexpected',true))->>'code')='VALIDATION_REJECTED','unknown field');
SELECT pg_temp.assert_true((erp.command_create_cost_code(jsonb_build_object('commandId','authority','idempotencyKey','authority','costCodeId','41000000-0000-4000-8000-000000000004','code','AUTH','name','Authority','companyId','TENANT-COST-B'))->>'code')='VALIDATION_REJECTED','authority field');
SELECT pg_temp.assert_true((erp.command_create_cost_code(jsonb_build_object('commandId','uuid','idempotencyKey','uuid','costCodeId','not-a-uuid','code','UUID','name','UUID'))->>'code')='VALIDATION_REJECTED','uuid');
SELECT pg_temp.assert_true((erp.command_create_cost_code(jsonb_build_object('commandId','uuid-space','idempotencyKey','uuid-space','costCodeId',' 41000000-0000-4000-8000-000000000004 ','code','UUID','name','UUID'))->>'code')='VALIDATION_REJECTED','uuid trim rejection');
SELECT pg_temp.assert_true((erp.command_create_cost_code(jsonb_build_object('commandId','blank-code','idempotencyKey','blank-code','costCodeId','41000000-0000-4000-8000-000000000004','code',' ','name','Name'))->>'code')='VALIDATION_REJECTED','blank code');
SELECT pg_temp.assert_true((erp.command_create_cost_code(jsonb_build_object('commandId','blank-name','idempotencyKey','blank-name','costCodeId','41000000-0000-4000-8000-000000000004','code','CODE','name',' '))->>'code')='VALIDATION_REJECTED','blank name');

SELECT set_config('request.jwt.claim.sub','40000000-0000-4000-8000-000000000002',true);
SELECT pg_temp.assert_true((erp.command_create_cost_code(jsonb_build_object('commandId','ops','idempotencyKey','ops','costCodeId','41000000-0000-4000-8000-000000000005','code','OPS','name','Ops'))->>'code')='FORBIDDEN','missing permission');
SELECT set_config('request.jwt.claim.sub','40000000-0000-4000-8000-000000000003',true);
SELECT pg_temp.assert_true((erp.command_create_cost_code('{}'::jsonb)->>'code')='UNAUTHENTICATED','inactive user');
SELECT set_config('request.jwt.claim.sub','40000000-0000-4000-8000-000000000004',true);
SELECT pg_temp.assert_true((erp.command_create_cost_code('{}'::jsonb)->>'code')='UNAUTHENTICATED','inactive company');
SELECT set_config('request.jwt.claim.sub','40000000-0000-4000-8000-000000000005',true);
SELECT pg_temp.assert_true((erp.command_create_cost_code('{}'::jsonb)->>'code')='UNAUTHENTICATED','missing canonical user');

SELECT set_config('request.jwt.claim.sub','40000000-0000-4000-8000-000000000001',true);
CREATE FUNCTION pg_temp.fail_cost_audit() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN IF NEW.action='COST_CODE_CREATED' AND NEW.correlation_id='audit-fail' THEN RAISE EXCEPTION 'forced audit failure';END IF;RETURN NEW;END$$;
CREATE TRIGGER cert_fail_cost_audit BEFORE INSERT ON erp.audit_log FOR EACH ROW EXECUTE FUNCTION pg_temp.fail_cost_audit();
SELECT pg_temp.assert_true((erp.command_create_cost_code(jsonb_build_object('commandId','audit-fail','idempotencyKey','audit-fail','costCodeId','41000000-0000-4000-8000-000000000006','code','AUDIT-FAIL','name','Audit Fail'))->>'code')='PERSISTENCE_FAILURE','audit failure controlled');
DROP TRIGGER cert_fail_cost_audit ON erp.audit_log;
SELECT pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM erp.cost_codes WHERE id='41000000-0000-4000-8000-000000000006') AND NOT EXISTS(SELECT 1 FROM erp.audit_log WHERE aggregate_id='41000000-0000-4000-8000-000000000006') AND NOT EXISTS(SELECT 1 FROM erp.operational_command_idempotency WHERE idempotency_key='audit-fail'),'audit rollback');
CREATE FUNCTION pg_temp.fail_cost_finish() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN IF NEW.command_type='CREATE_COST_CODE' AND NEW.idempotency_key='finish-fail' THEN RAISE EXCEPTION 'forced finish failure';END IF;RETURN NEW;END$$;
CREATE TRIGGER cert_fail_cost_finish BEFORE INSERT ON erp.operational_command_idempotency FOR EACH ROW EXECUTE FUNCTION pg_temp.fail_cost_finish();
SELECT pg_temp.assert_true((erp.command_create_cost_code(jsonb_build_object('commandId','finish-fail','idempotencyKey','finish-fail','costCodeId','41000000-0000-4000-8000-000000000007','code','FINISH-FAIL','name','Finish Fail'))->>'code')='PERSISTENCE_FAILURE','finish failure controlled');
DROP TRIGGER cert_fail_cost_finish ON erp.operational_command_idempotency;
SELECT pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM erp.cost_codes WHERE id='41000000-0000-4000-8000-000000000007') AND NOT EXISTS(SELECT 1 FROM erp.audit_log WHERE aggregate_id='41000000-0000-4000-8000-000000000007') AND NOT EXISTS(SELECT 1 FROM erp.operational_command_idempotency WHERE idempotency_key='finish-fail'),'finish rollback');

SELECT set_config('request.jwt.claim.sub','40000000-0000-4000-8000-000000000006',true);
SELECT pg_temp.assert_true((erp.read_canonical_equipment_reference_data()->'costCodes') @> '[{"id":"41000000-0000-4000-8000-000000000001"}]'::jsonb,'global equipment visibility company B');
SELECT pg_temp.assert_true((erp.read_canonical_rental_reference_data()->'costCodes') @> '[{"id":"41000000-0000-4000-8000-000000000001"}]'::jsonb,'global rental visibility company B');

SELECT set_config('request.jwt.claim.sub','',true);
SELECT pg_temp.assert_true((erp.command_create_cost_code('{}'::jsonb)->>'code')='UNAUTHENTICATED','unauthenticated');
SELECT pg_temp.assert_true(has_function_privilege('authenticated','erp.command_create_cost_code(jsonb)','EXECUTE') AND NOT has_function_privilege('anon','erp.command_create_cost_code(jsonb)','EXECUTE') AND NOT has_function_privilege('public','erp.command_create_cost_code(jsonb)','EXECUTE') AND NOT has_function_privilege('service_role','erp.command_create_cost_code(jsonb)','EXECUTE'),'RPC matrix');
SELECT pg_temp.assert_true(NOT has_table_privilege('authenticated','erp.cost_codes','INSERT') AND NOT has_table_privilege('authenticated','erp.cost_codes','UPDATE') AND NOT has_table_privilege('authenticated','erp.cost_codes','DELETE') AND NOT has_table_privilege('anon','erp.cost_codes','INSERT') AND NOT has_table_privilege('public','erp.cost_codes','INSERT'),'direct DML denied');
ROLLBACK;
SELECT 'CANONICAL_COST_CODE_DATABASE_SEQUENTIAL_CERTIFICATION_PASS';
