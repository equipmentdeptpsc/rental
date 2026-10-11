\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION pg_temp.assert_true(value boolean,message text) RETURNS void LANGUAGE plpgsql AS $$BEGIN IF value IS NOT TRUE THEN RAISE EXCEPTION 'ASSERT: %',message;END IF;END$$;
INSERT INTO erp.companies(id,code,name,active,environment_class) VALUES('TENANT-REF-TEST','ERT','Reference Test',true,'test'),('TENANT-REF-INACTIVE','ERI','Inactive Reference Test',false,'test');
INSERT INTO auth.users(id) VALUES('99000000-0000-4000-8000-000000000001'),('99000000-0000-4000-8000-000000000002'),('99000000-0000-4000-8000-000000000003');
INSERT INTO erp.users(id,username,display_name,email,status,company_id) VALUES
 ('99000000-0000-4000-8000-000000000001','ref.admin','Ref Admin','ref.admin@example.test','active','TENANT-REF-TEST'),
 ('99000000-0000-4000-8000-000000000002','ref.coordinator','Ref Coordinator','ref.coordinator@example.test','active','TENANT-REF-TEST'),
 ('99000000-0000-4000-8000-000000000003','ref.inactive','Ref Inactive','ref.inactive@example.test','active','TENANT-REF-INACTIVE');
INSERT INTO erp.user_roles(user_id,role_id) SELECT '99000000-0000-4000-8000-000000000001',id FROM erp.app_roles WHERE code='system-administrator';
INSERT INTO erp.user_roles(user_id,role_id) SELECT '99000000-0000-4000-8000-000000000002',id FROM erp.app_roles WHERE code='equipment-coordinator';
INSERT INTO erp.user_roles(user_id,role_id) SELECT '99000000-0000-4000-8000-000000000003',id FROM erp.app_roles WHERE code='system-administrator';
SELECT set_config('request.jwt.claim.sub','99000000-0000-4000-8000-000000000001',true);
CREATE TEMP TABLE created AS SELECT erp.command_save_equipment_reference_master('{"kind":"brand","operation":"CREATE","id":"99000000-0000-4000-8000-000000000010","name":"Reference Brand","code":"REF-BRAND","commandId":"ref-1","idempotencyKey":"ref-1"}'::jsonb) value;
SELECT pg_temp.assert_true((SELECT value->>'success'='true' FROM created),'administrator create');
SELECT pg_temp.assert_true((erp.read_equipment_reference_master('brand')->'items') @> '[{"id":"99000000-0000-4000-8000-000000000010","name":"Reference Brand"}]'::jsonb,'canonical read');
SELECT pg_temp.assert_true((erp.read_canonical_equipment_reference_data()->'brands') @> '[{"id":"99000000-0000-4000-8000-000000000010"}]'::jsonb,'Equipment selector read');
SELECT pg_temp.assert_true((erp.command_save_equipment_reference_master('{"kind":"brand","operation":"CREATE","id":"99000000-0000-4000-8000-000000000011","name":"Reference Brand","code":"OTHER","commandId":"ref-duplicate","idempotencyKey":"ref-duplicate"}'::jsonb)->>'code')='REFERENCE_CONFLICT','duplicate name rejected');
SELECT pg_temp.assert_true((erp.command_save_equipment_reference_master('{"kind":"brand","operation":"UPDATE","id":"99000000-0000-4000-8000-000000000010","name":"Revised Brand","code":"REF-BRAND","expectedRowVersion":1,"commandId":"ref-update","idempotencyKey":"ref-update"}'::jsonb)->'value'->>'name')='Revised Brand','administrator update');
SELECT pg_temp.assert_true((erp.command_save_equipment_reference_master('{"kind":"brand","operation":"UPDATE","id":"99000000-0000-4000-8000-000000000010","name":"Stale Brand","expectedRowVersion":1,"commandId":"ref-stale","idempotencyKey":"ref-stale"}'::jsonb)->>'code')='CONFLICT','stale version rejected');
SELECT pg_temp.assert_true((erp.command_save_equipment_reference_master('{"kind":"brand","operation":"SET_ACTIVE","id":"99000000-0000-4000-8000-000000000010","active":false,"expectedRowVersion":2,"commandId":"ref-deactivate","idempotencyKey":"ref-deactivate"}'::jsonb)->'value'->>'active')='false','administrator deactivation');
SELECT pg_temp.assert_true(NOT (erp.read_canonical_equipment_reference_data()->'brands') @> '[{"id":"99000000-0000-4000-8000-000000000010"}]'::jsonb,'inactive selector filtering');
SELECT pg_temp.assert_true((SELECT count(*)=3 FROM erp.audit_log WHERE aggregate_id='99000000-0000-4000-8000-000000000010' AND company_id='TENANT-REF-TEST'),'audited writes');
SELECT set_config('request.jwt.claim.sub','99000000-0000-4000-8000-000000000002',true);
SELECT pg_temp.assert_true((erp.read_equipment_reference_master('brand')->>'success')='true','coordinator may read');
SELECT pg_temp.assert_true((erp.command_save_equipment_reference_master('{"kind":"brand","operation":"CREATE","id":"99000000-0000-4000-8000-000000000012","name":"Forbidden","commandId":"ref-forbidden","idempotencyKey":"ref-forbidden"}'::jsonb)->>'code')='FORBIDDEN','coordinator may not create');
SELECT set_config('request.jwt.claim.sub','99000000-0000-4000-8000-000000000003',true);
SELECT pg_temp.assert_true((erp.read_equipment_reference_master('brand')->>'code')='UNAUTHENTICATED','inactive company denied');
SELECT set_config('request.jwt.claim.sub','',true);
SELECT pg_temp.assert_true((erp.read_equipment_reference_master('brand')->>'code')='UNAUTHENTICATED','anonymous denied');
SELECT pg_temp.assert_true(NOT has_table_privilege('authenticated','erp.equipment_brands','INSERT') AND NOT has_table_privilege('authenticated','erp.equipment_brands','UPDATE'),'direct DML denied');
ROLLBACK;
SELECT 'EQUIPMENT_REFERENCE_MASTER_COMMANDS_PASS';
