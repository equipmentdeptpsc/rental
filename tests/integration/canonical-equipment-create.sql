\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION pg_temp.assert_true(value boolean,message text) RETURNS void LANGUAGE plpgsql AS $$BEGIN IF value IS NOT TRUE THEN RAISE EXCEPTION 'ASSERT: %',message;END IF;END$$;
INSERT INTO erp.companies(id,code,name,active,environment_class) VALUES('TENANT-EQP-A','EQPA','Equipment A',true,'test'),('TENANT-EQP-B','EQPB','Equipment B',true,'test'),('TENANT-EQP-I','EQPI','Equipment Inactive',false,'test');
INSERT INTO auth.users(id) VALUES('30000000-0000-4000-8000-000000000001'),('30000000-0000-4000-8000-000000000002'),('30000000-0000-4000-8000-000000000003'),('30000000-0000-4000-8000-000000000004'),('30000000-0000-4000-8000-000000000005'),('30000000-0000-4000-8000-000000000006');
INSERT INTO erp.users(id,username,display_name,email,status,company_id) VALUES
 ('30000000-0000-4000-8000-000000000001','eqp.admin','Equipment Admin','eqp.admin@example.test','active','TENANT-EQP-A'),
 ('30000000-0000-4000-8000-000000000002','eqp.dispatcher','Equipment Dispatcher','eqp.dispatcher@example.test','active','TENANT-EQP-A'),
 ('30000000-0000-4000-8000-000000000003','eqp.inactive','Equipment Inactive','eqp.inactive@example.test','inactive','TENANT-EQP-A'),
 ('30000000-0000-4000-8000-000000000004','eqp.company','Equipment Company','eqp.company@example.test','active','TENANT-EQP-I'),
 ('30000000-0000-4000-8000-000000000005','eqp.other','Other Tenant Admin','eqp.other@example.test','active','TENANT-EQP-B'),
 ('30000000-0000-4000-8000-000000000006','eqp.coordinator','Equipment Coordinator','eqp.coordinator@example.test','active','TENANT-EQP-A');
INSERT INTO erp.user_roles(user_id,role_id) SELECT '30000000-0000-4000-8000-000000000001',id FROM erp.app_roles WHERE code='system-administrator';
INSERT INTO erp.user_roles(user_id,role_id) SELECT '30000000-0000-4000-8000-000000000002',id FROM erp.app_roles WHERE code='dispatcher';
INSERT INTO erp.user_roles(user_id,role_id) SELECT '30000000-0000-4000-8000-000000000003',id FROM erp.app_roles WHERE code='system-administrator';
INSERT INTO erp.user_roles(user_id,role_id) SELECT '30000000-0000-4000-8000-000000000004',id FROM erp.app_roles WHERE code='system-administrator';
INSERT INTO erp.user_roles(user_id,role_id) SELECT '30000000-0000-4000-8000-000000000005',id FROM erp.app_roles WHERE code='system-administrator';
INSERT INTO erp.user_roles(user_id,role_id) SELECT '30000000-0000-4000-8000-000000000006',id FROM erp.app_roles WHERE code='equipment-coordinator';
INSERT INTO erp.cost_codes(id,code,name,active,deleted_at) VALUES('COST-EQP-A','EQP-A','Equipment Active',true,NULL),('COST-EQP-I','EQP-I','Equipment Inactive',false,NULL),('COST-EQP-D','EQP-D','Equipment Deleted',true,clock_timestamp());
INSERT INTO erp.equipment_subcategories(id,company_id,category_id,name,active) VALUES
 ('30000000-0000-4000-8000-000000000010','TENANT-EQP-A','d4c032dc-dc09-5a24-87c5-e663645f75ba','Equipment A',true),
 ('30000000-0000-4000-8000-000000000011','TENANT-EQP-B','d4c032dc-dc09-5a24-87c5-e663645f75ba','Equipment B',true);

-- Keep the fixture aligned with the canonical server-generated Asset Number
-- contract; optional overrides exercise rejection paths below.
CREATE FUNCTION pg_temp.create_equipment(command_id text,equipment_id text,equipment_name text,extra jsonb DEFAULT '{}'::jsonb,idempotency_key text DEFAULT NULL)
RETURNS jsonb LANGUAGE sql AS $$
 SELECT erp.command_create_equipment(jsonb_build_object(
  'commandId',command_id,'idempotencyKey',coalesce(idempotency_key,command_id),
  'equipmentId',equipment_id,'equipmentName',equipment_name,
  'categoryId','d4c032dc-dc09-5a24-87c5-e663645f75ba',
  'subcategoryId','30000000-0000-4000-8000-000000000010',
  'maintenanceType','Engine Hours','costCodeId','COST-EQP-A') || extra)
$$;

SELECT pg_temp.assert_true((SELECT count(*)=1 FROM erp.app_permissions WHERE code='equipment.create'),'permission once');
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM erp.role_permissions rp JOIN erp.app_roles r ON r.id=rp.role_id JOIN erp.app_permissions p ON p.id=rp.permission_id WHERE r.code='system-administrator' AND p.code='equipment.create'),'admin mapping');
SELECT pg_temp.assert_true((SELECT array_agg(r.code ORDER BY r.code)=ARRAY['equipment-coordinator','system-administrator']::text[] FROM erp.role_permissions rp JOIN erp.app_roles r ON r.id=rp.role_id JOIN erp.app_permissions p ON p.id=rp.permission_id WHERE r.active AND p.active AND p.code='equipment.create'),'approved create mappings');
SELECT pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM erp.role_permissions rp JOIN erp.app_roles r ON r.id=rp.role_id JOIN erp.app_permissions p ON p.id=rp.permission_id WHERE r.code='dispatcher' AND p.code='equipment.create'),'dispatcher lacks create');
SELECT set_config('request.jwt.claim.sub','30000000-0000-4000-8000-000000000001',true);
SELECT pg_temp.assert_true((erp.read_canonical_equipment_reference_data()->>'success')::boolean,'reference succeeds');
SELECT pg_temp.assert_true(jsonb_array_length(erp.read_canonical_equipment_reference_data()->'costCodes')=1,'reference filters inactive/deleted');

CREATE TEMP TABLE accepted AS SELECT pg_temp.create_equipment('eqp-ok','31000000-0000-4000-8000-000000000001',' Equipment 001 ','{"remarks":" Ready "}'::jsonb) value;
SELECT pg_temp.assert_true((SELECT value->>'success'='true' FROM accepted),'authorized create');
SELECT pg_temp.assert_true((SELECT asset_no ~ '^ME-[0-9]{6,}$' AND equipment_name='Equipment 001' AND current_reading=0 AND active AND deleted_at IS NULL AND project_id IS NULL AND operator_id IS NULL AND company_id='TENANT-EQP-A' FROM erp.equipment WHERE id='31000000-0000-4000-8000-000000000001'),'server-generated asset and forced state');
SELECT pg_temp.assert_true((SELECT upper(s.code)='AVAILABLE' FROM erp.equipment e JOIN erp.equipment_statuses s ON s.id=e.status_id WHERE e.id='31000000-0000-4000-8000-000000000001'),'available forced');
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM erp.audit_log WHERE aggregate_id='31000000-0000-4000-8000-000000000001' AND action='EQUIPMENT_CREATED'),'audit once');
SELECT pg_temp.assert_true((pg_temp.create_equipment('eqp-ok','31000000-0000-4000-8000-000000000001',' Equipment 001 ','{"remarks":" Ready "}'::jsonb)->>'disposition')='REPLAYED','sequential replay');
SELECT pg_temp.assert_true((pg_temp.create_equipment('eqp-mm','31000000-0000-4000-8000-000000000009','Different','{}'::jsonb,'eqp-ok')->>'code')='IDEMPOTENCY_MISMATCH','mismatch');

SELECT pg_temp.assert_true((pg_temp.create_equipment('eqp-asset','31000000-0000-4000-8000-000000000002','Other','{"assetNo":"uat-eqp-001"}'::jsonb)->>'code')='VALIDATION_REJECTED','browser asset number prohibited');
SELECT pg_temp.assert_true((pg_temp.create_equipment('eqp-id','31000000-0000-4000-8000-000000000001','Other')->>'code')='EQUIPMENT_ID_CONFLICT','id conflict');
SELECT pg_temp.assert_true((pg_temp.create_equipment('blank-n','31000000-0000-4000-8000-000000000003',' ')->>'code')='VALIDATION_REJECTED','blank name');
SELECT pg_temp.assert_true((pg_temp.create_equipment('bad-m','31000000-0000-4000-8000-000000000003','X','{"maintenanceType":"Hours"}'::jsonb)->>'code')='VALIDATION_REJECTED','maintenance');
SELECT pg_temp.assert_true((pg_temp.create_equipment('bad-c','31000000-0000-4000-8000-000000000003','X','{"costCodeId":"COST-EQP-I"}'::jsonb)->>'code')='NOT_FOUND','inactive cost');
SELECT pg_temp.assert_true((pg_temp.create_equipment('bad-r','31000000-0000-4000-8000-000000000003','X','{"currentReading":-1}'::jsonb)->>'code')='VALIDATION_REJECTED','negative reading');
SELECT pg_temp.assert_true((pg_temp.create_equipment('bad-f','31000000-0000-4000-8000-000000000003','X','{"companyId":"TENANT-EQP-I"}'::jsonb)->>'code')='VALIDATION_REJECTED','authority field');
SELECT set_config('request.jwt.claim.sub','30000000-0000-4000-8000-000000000006',true);
SELECT pg_temp.assert_true((pg_temp.create_equipment('coordinator','31000000-0000-4000-8000-000000000002','Coordinator equipment')->>'disposition')='ACCEPTED','equipment coordinator may create');
SELECT pg_temp.assert_true((SELECT company_id='TENANT-EQP-A' FROM erp.equipment WHERE id='31000000-0000-4000-8000-000000000002'),'coordinator remains tenant-scoped');
SELECT set_config('request.jwt.claim.sub','30000000-0000-4000-8000-000000000002',true);
SELECT pg_temp.assert_true((pg_temp.create_equipment('dispatcher','31000000-0000-4000-8000-000000000004','Dispatcher equipment')->>'code')='FORBIDDEN','dispatcher without equipment.create forbidden');
SELECT pg_temp.assert_true((erp.read_canonical_equipment_reference_data()->>'code')='FORBIDDEN','dispatcher reference denied');
SELECT set_config('request.jwt.claim.sub','30000000-0000-4000-8000-000000000005',true);
SELECT pg_temp.assert_true((pg_temp.create_equipment('cross-tenant','31000000-0000-4000-8000-000000000005','Other tenant equipment')->>'code')='NOT_FOUND','cross-tenant subcategory denied');
SELECT pg_temp.assert_true((pg_temp.create_equipment('same-tenant','31000000-0000-4000-8000-000000000005','Other tenant equipment','{"subcategoryId":"30000000-0000-4000-8000-000000000011"}'::jsonb)->>'disposition')='ACCEPTED','other tenant administrator may create locally');
SELECT pg_temp.assert_true((SELECT company_id='TENANT-EQP-B' FROM erp.equipment WHERE id='31000000-0000-4000-8000-000000000005'),'other tenant state isolated');
SELECT set_config('request.jwt.claim.sub','30000000-0000-4000-8000-000000000003',true);
SELECT pg_temp.assert_true((pg_temp.create_equipment('inactive','31000000-0000-4000-8000-000000000006','Inactive')->>'code')='UNAUTHENTICATED','inactive user');
SELECT set_config('request.jwt.claim.sub','30000000-0000-4000-8000-000000000004',true);
SELECT pg_temp.assert_true((pg_temp.create_equipment('company','31000000-0000-4000-8000-000000000006','Company')->>'code')='UNAUTHENTICATED','inactive company');
SELECT set_config('request.jwt.claim.sub','30000000-0000-4000-8000-000000000001',true);
CREATE FUNCTION pg_temp.fail_equipment_audit() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN IF NEW.action='EQUIPMENT_CREATED' THEN RAISE EXCEPTION 'forced equipment audit failure';END IF;RETURN NEW;END$$;
CREATE TRIGGER cert_fail_equipment_audit BEFORE INSERT ON erp.audit_log FOR EACH ROW EXECUTE FUNCTION pg_temp.fail_equipment_audit();
SELECT pg_temp.assert_true((pg_temp.create_equipment('audit-fail','31000000-0000-4000-8000-000000000007','Audit Fail')->>'code')='PERSISTENCE_FAILURE','audit failure controlled');
DROP TRIGGER cert_fail_equipment_audit ON erp.audit_log;
SELECT pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM erp.equipment WHERE id='31000000-0000-4000-8000-000000000007') AND NOT EXISTS(SELECT 1 FROM erp.operational_command_idempotency WHERE idempotency_key='audit-fail'),'audit rollback');
CREATE FUNCTION pg_temp.fail_equipment_finish() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN IF NEW.command_type='CREATE_EQUIPMENT' AND NEW.command_status='COMPLETED' THEN RAISE EXCEPTION 'forced equipment finish failure';END IF;RETURN NEW;END$$;
CREATE TRIGGER cert_fail_equipment_finish BEFORE INSERT ON erp.operational_command_idempotency FOR EACH ROW EXECUTE FUNCTION pg_temp.fail_equipment_finish();
SELECT pg_temp.assert_true((pg_temp.create_equipment('finish-fail','31000000-0000-4000-8000-000000000008','Finish Fail')->>'code')='PERSISTENCE_FAILURE','finish failure controlled');
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
