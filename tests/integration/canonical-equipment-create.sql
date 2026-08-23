\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION pg_temp.assert_true(value boolean,message text) RETURNS void LANGUAGE plpgsql AS $$BEGIN IF value IS NOT TRUE THEN RAISE EXCEPTION 'ASSERT: %',message;END IF;END$$;
INSERT INTO erp.companies(id,code,name,active,environment_class) VALUES('TENANT-EQP-A','EQPA','Equipment A',true,'test'),('TENANT-EQP-I','EQPI','Equipment Inactive',false,'test');
INSERT INTO auth.users(id) VALUES('30000000-0000-4000-8000-000000000001'),('30000000-0000-4000-8000-000000000002'),('30000000-0000-4000-8000-000000000003'),('30000000-0000-4000-8000-000000000004');
INSERT INTO erp.users(id,username,display_name,email,status,company_id) VALUES
 ('30000000-0000-4000-8000-000000000001','eqp.admin','Equipment Admin','eqp.admin@example.test','active','TENANT-EQP-A'),
 ('30000000-0000-4000-8000-000000000002','eqp.ops','Equipment Ops','eqp.ops@example.test','active','TENANT-EQP-A'),
 ('30000000-0000-4000-8000-000000000003','eqp.inactive','Equipment Inactive','eqp.inactive@example.test','inactive','TENANT-EQP-A'),
 ('30000000-0000-4000-8000-000000000004','eqp.company','Equipment Company','eqp.company@example.test','active','TENANT-EQP-I');
INSERT INTO erp.user_roles(user_id,role_id) SELECT '30000000-0000-4000-8000-000000000001',id FROM erp.app_roles WHERE code='system-administrator';
INSERT INTO erp.user_roles(user_id,role_id) SELECT '30000000-0000-4000-8000-000000000002',id FROM erp.app_roles WHERE code='rental-operations';
INSERT INTO erp.user_roles(user_id,role_id) SELECT '30000000-0000-4000-8000-000000000003',id FROM erp.app_roles WHERE code='system-administrator';
INSERT INTO erp.user_roles(user_id,role_id) SELECT '30000000-0000-4000-8000-000000000004',id FROM erp.app_roles WHERE code='system-administrator';
INSERT INTO erp.cost_codes(id,code,name,active,deleted_at) VALUES('COST-EQP-A','EQP-A','Equipment Active',true,NULL),('COST-EQP-I','EQP-I','Equipment Inactive',false,NULL),('COST-EQP-D','EQP-D','Equipment Deleted',true,clock_timestamp());

SELECT pg_temp.assert_true((SELECT count(*)=1 FROM erp.app_permissions WHERE code='equipment.create'),'permission once');
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM erp.role_permissions rp JOIN erp.app_roles r ON r.id=rp.role_id JOIN erp.app_permissions p ON p.id=rp.permission_id WHERE r.code='system-administrator' AND p.code='equipment.create'),'admin mapping');
SELECT pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM erp.role_permissions rp JOIN erp.app_roles r ON r.id=rp.role_id JOIN erp.app_permissions p ON p.id=rp.permission_id WHERE r.code<>'system-administrator' AND p.code='equipment.create'),'other mappings absent');
SELECT set_config('request.jwt.claim.sub','30000000-0000-4000-8000-000000000001',true);
SELECT pg_temp.assert_true((erp.read_canonical_equipment_reference_data()->>'success')::boolean,'reference succeeds');
SELECT pg_temp.assert_true(jsonb_array_length(erp.read_canonical_equipment_reference_data()->'costCodes')=1,'reference filters inactive/deleted');

CREATE TEMP TABLE accepted AS SELECT erp.command_create_equipment(jsonb_build_object('commandId','eqp-ok','idempotencyKey','eqp-ok','equipmentId','31000000-0000-4000-8000-000000000001','assetNo',' UAT-EQP-001 ','equipmentName',' Equipment 001 ','maintenanceType','Engine Hours','costCodeId','COST-EQP-A','remarks',' Ready ')) value;
SELECT pg_temp.assert_true((SELECT value->>'success'='true' FROM accepted),'authorized create');
SELECT pg_temp.assert_true((SELECT asset_no='UAT-EQP-001' AND equipment_name='Equipment 001' AND current_reading=0 AND active AND deleted_at IS NULL AND project_id IS NULL AND operator_id IS NULL AND company_id='TENANT-EQP-A' FROM erp.equipment WHERE id='31000000-0000-4000-8000-000000000001'),'forced state');
SELECT pg_temp.assert_true((SELECT upper(s.code)='AVAILABLE' FROM erp.equipment e JOIN erp.equipment_statuses s ON s.id=e.status_id WHERE e.id='31000000-0000-4000-8000-000000000001'),'available forced');
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM erp.audit_log WHERE aggregate_id='31000000-0000-4000-8000-000000000001' AND action='EQUIPMENT_CREATED'),'audit once');
SELECT pg_temp.assert_true((erp.command_create_equipment(jsonb_build_object('commandId','eqp-ok','idempotencyKey','eqp-ok','equipmentId','31000000-0000-4000-8000-000000000001','assetNo',' UAT-EQP-001 ','equipmentName',' Equipment 001 ','maintenanceType','Engine Hours','costCodeId','COST-EQP-A','remarks',' Ready '))->>'disposition')='REPLAYED','sequential replay');
SELECT pg_temp.assert_true((erp.command_create_equipment(jsonb_build_object('commandId','eqp-mm','idempotencyKey','eqp-ok','equipmentId','31000000-0000-4000-8000-000000000009','assetNo','DIFFERENT','equipmentName','Different','maintenanceType','Engine Hours','costCodeId','COST-EQP-A'))->>'code')='IDEMPOTENCY_MISMATCH','mismatch');

SELECT pg_temp.assert_true((erp.command_create_equipment(jsonb_build_object('commandId','eqp-asset','idempotencyKey','eqp-asset','equipmentId','31000000-0000-4000-8000-000000000002','assetNo','uat-eqp-001','equipmentName','Other','maintenanceType','Engine Hours','costCodeId','COST-EQP-A'))->>'code')='ASSET_NUMBER_CONFLICT','asset conflict');
SELECT pg_temp.assert_true((erp.command_create_equipment(jsonb_build_object('commandId','eqp-id','idempotencyKey','eqp-id','equipmentId','31000000-0000-4000-8000-000000000001','assetNo','UAT-EQP-002','equipmentName','Other','maintenanceType','Engine Hours','costCodeId','COST-EQP-A'))->>'code')='EQUIPMENT_ID_CONFLICT','id conflict');
SELECT pg_temp.assert_true((erp.command_create_equipment(jsonb_build_object('commandId','blank-a','idempotencyKey','blank-a','equipmentId','31000000-0000-4000-8000-000000000003','assetNo',' ','equipmentName','X','maintenanceType','Engine Hours','costCodeId','COST-EQP-A'))->>'code')='VALIDATION_REJECTED','blank asset');
SELECT pg_temp.assert_true((erp.command_create_equipment(jsonb_build_object('commandId','blank-n','idempotencyKey','blank-n','equipmentId','31000000-0000-4000-8000-000000000003','assetNo','X','equipmentName',' ','maintenanceType','Engine Hours','costCodeId','COST-EQP-A'))->>'code')='VALIDATION_REJECTED','blank name');
SELECT pg_temp.assert_true((erp.command_create_equipment(jsonb_build_object('commandId','bad-m','idempotencyKey','bad-m','equipmentId','31000000-0000-4000-8000-000000000003','assetNo','X','equipmentName','X','maintenanceType','Hours','costCodeId','COST-EQP-A'))->>'code')='VALIDATION_REJECTED','maintenance');
SELECT pg_temp.assert_true((erp.command_create_equipment(jsonb_build_object('commandId','bad-c','idempotencyKey','bad-c','equipmentId','31000000-0000-4000-8000-000000000003','assetNo','X','equipmentName','X','maintenanceType','Engine Hours','costCodeId','COST-EQP-I'))->>'code')='NOT_FOUND','inactive cost');
SELECT pg_temp.assert_true((erp.command_create_equipment(jsonb_build_object('commandId','bad-r','idempotencyKey','bad-r','equipmentId','31000000-0000-4000-8000-000000000003','assetNo','X','equipmentName','X','maintenanceType','Engine Hours','costCodeId','COST-EQP-A','currentReading',-1))->>'code')='VALIDATION_REJECTED','negative reading');
SELECT pg_temp.assert_true((erp.command_create_equipment(jsonb_build_object('commandId','bad-f','idempotencyKey','bad-f','equipmentId','31000000-0000-4000-8000-000000000003','assetNo','X','equipmentName','X','maintenanceType','Engine Hours','costCodeId','COST-EQP-A','companyId','TENANT-EQP-I'))->>'code')='VALIDATION_REJECTED','authority field');
SELECT set_config('request.jwt.claim.sub','30000000-0000-4000-8000-000000000002',true);
SELECT pg_temp.assert_true((erp.command_create_equipment(jsonb_build_object('commandId','ops','idempotencyKey','ops','equipmentId','31000000-0000-4000-8000-000000000004','assetNo','OPS','equipmentName','Ops','maintenanceType','Engine Hours','costCodeId','COST-EQP-A'))->>'code')='FORBIDDEN','rental ops forbidden');
SELECT set_config('request.jwt.claim.sub','30000000-0000-4000-8000-000000000003',true);
SELECT pg_temp.assert_true((erp.command_create_equipment(jsonb_build_object('commandId','inactive','idempotencyKey','inactive','equipmentId','31000000-0000-4000-8000-000000000005','assetNo','INACTIVE','equipmentName','Inactive','maintenanceType','Engine Hours','costCodeId','COST-EQP-A'))->>'code')='UNAUTHENTICATED','inactive user');
SELECT set_config('request.jwt.claim.sub','30000000-0000-4000-8000-000000000004',true);
SELECT pg_temp.assert_true((erp.command_create_equipment(jsonb_build_object('commandId','company','idempotencyKey','company','equipmentId','31000000-0000-4000-8000-000000000006','assetNo','COMPANY','equipmentName','Company','maintenanceType','Engine Hours','costCodeId','COST-EQP-A'))->>'code')='UNAUTHENTICATED','inactive company');
SELECT set_config('request.jwt.claim.sub','30000000-0000-4000-8000-000000000001',true);
CREATE FUNCTION pg_temp.fail_equipment_audit() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN IF NEW.action='EQUIPMENT_CREATED' THEN RAISE EXCEPTION 'forced equipment audit failure';END IF;RETURN NEW;END$$;
CREATE TRIGGER cert_fail_equipment_audit BEFORE INSERT ON erp.audit_log FOR EACH ROW EXECUTE FUNCTION pg_temp.fail_equipment_audit();
SELECT pg_temp.assert_true((erp.command_create_equipment(jsonb_build_object('commandId','audit-fail','idempotencyKey','audit-fail','equipmentId','31000000-0000-4000-8000-000000000007','assetNo','AUDIT-FAIL','equipmentName','Audit Fail','maintenanceType','Engine Hours','costCodeId','COST-EQP-A'))->>'code')='PERSISTENCE_FAILURE','audit failure controlled');
DROP TRIGGER cert_fail_equipment_audit ON erp.audit_log;
SELECT pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM erp.equipment WHERE id='31000000-0000-4000-8000-000000000007') AND NOT EXISTS(SELECT 1 FROM erp.operational_command_idempotency WHERE idempotency_key='audit-fail'),'audit rollback');
CREATE FUNCTION pg_temp.fail_equipment_finish() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN IF NEW.command_type='CREATE_EQUIPMENT' AND NEW.command_status='COMPLETED' THEN RAISE EXCEPTION 'forced equipment finish failure';END IF;RETURN NEW;END$$;
CREATE TRIGGER cert_fail_equipment_finish BEFORE INSERT ON erp.operational_command_idempotency FOR EACH ROW EXECUTE FUNCTION pg_temp.fail_equipment_finish();
SELECT pg_temp.assert_true((erp.command_create_equipment(jsonb_build_object('commandId','finish-fail','idempotencyKey','finish-fail','equipmentId','31000000-0000-4000-8000-000000000008','assetNo','FINISH-FAIL','equipmentName','Finish Fail','maintenanceType','Engine Hours','costCodeId','COST-EQP-A'))->>'code')='PERSISTENCE_FAILURE','finish failure controlled');
DROP TRIGGER cert_fail_equipment_finish ON erp.operational_command_idempotency;
SELECT pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM erp.equipment WHERE id='31000000-0000-4000-8000-000000000008') AND NOT EXISTS(SELECT 1 FROM erp.audit_log WHERE aggregate_id='31000000-0000-4000-8000-000000000008') AND NOT EXISTS(SELECT 1 FROM erp.operational_command_idempotency WHERE idempotency_key='finish-fail'),'finish rollback');
SELECT set_config('request.jwt.claim.sub','',true);
SELECT pg_temp.assert_true((erp.command_create_equipment('{}'::jsonb)->>'code')='UNAUTHENTICATED','missing auth');
SELECT pg_temp.assert_true(has_function_privilege('authenticated','erp.command_create_equipment(jsonb)','EXECUTE') AND NOT has_function_privilege('anon','erp.command_create_equipment(jsonb)','EXECUTE') AND NOT has_function_privilege('public','erp.command_create_equipment(jsonb)','EXECUTE') AND NOT has_function_privilege('service_role','erp.command_create_equipment(jsonb)','EXECUTE'),'command grants');
SELECT pg_temp.assert_true(has_function_privilege('authenticated','erp.read_canonical_equipment_reference_data()','EXECUTE') AND NOT has_function_privilege('anon','erp.read_canonical_equipment_reference_data()','EXECUTE') AND NOT has_function_privilege('public','erp.read_canonical_equipment_reference_data()','EXECUTE'),'read grants');
SELECT pg_temp.assert_true(NOT has_table_privilege('authenticated','erp.equipment','INSERT') AND NOT has_table_privilege('authenticated','erp.equipment','UPDATE') AND NOT has_table_privilege('authenticated','erp.equipment','DELETE'),'direct DML denied');
SELECT pg_temp.assert_true(NOT has_table_privilege('authenticated','erp.cost_codes','INSERT') AND NOT has_table_privilege('authenticated','erp.cost_codes','UPDATE') AND NOT has_table_privilege('authenticated','erp.cost_codes','DELETE'),'cost DML denied');
ROLLBACK;
SELECT 'CANONICAL_EQUIPMENT_DATABASE_SEQUENTIAL_CERTIFICATION_PASS';
