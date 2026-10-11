-- Local migrated PostgreSQL only. This transaction always rolls back.
\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION pg_temp.assert_true(value boolean, message text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF value IS NOT TRUE THEN RAISE EXCEPTION 'ASSERT: %', message; END IF; END $$;

INSERT INTO erp.companies(id,code,name,active,environment_class)
VALUES('TENANT-EQP-DUAL-TEST','EQDT','Dual numbering test',true,'test'),
      ('TENANT-EQP-DUAL-OTHER','EQDO','Other dual numbering test',true,'test');
INSERT INTO auth.users(id) VALUES('97000000-0000-4000-8000-000000000001'),('97000000-0000-4000-8000-000000000002'),('97000000-0000-4000-8000-000000000003');
INSERT INTO erp.users(id,username,display_name,email,status,company_id) VALUES
 ('97000000-0000-4000-8000-000000000001','dual.admin','Dual Admin','dual.admin@example.test','active','TENANT-EQP-DUAL-TEST'),
 ('97000000-0000-4000-8000-000000000002','dual.other','Dual Other','dual.other@example.test','active','TENANT-EQP-DUAL-OTHER'),
 ('97000000-0000-4000-8000-000000000003','dual.noaccess','Dual No Access','dual.noaccess@example.test','active','TENANT-EQP-DUAL-TEST');
INSERT INTO erp.user_roles(user_id,role_id)
SELECT user_id::uuid,r.id FROM (VALUES('97000000-0000-4000-8000-000000000001'),('97000000-0000-4000-8000-000000000002')) users(user_id)
CROSS JOIN erp.app_roles r WHERE r.code='system-administrator';
INSERT INTO erp.cost_codes(id,code,name,active) VALUES('COST-EQP-DUAL-TEST','EQDT','Dual numbering test',true);
INSERT INTO erp.equipment_subcategories(id,company_id,category_id,name,active)
VALUES('97000000-0000-4000-8000-000000000010','TENANT-EQP-DUAL-TEST','d4c032dc-dc09-5a24-87c5-e663645f75ba','Dual test',true);
INSERT INTO erp.equipment_brands(id,name) VALUES('BRAND-EQP-DUAL-TEST','Test Brand');
INSERT INTO erp.equipment_models(id,name) VALUES('MODEL-EQP-DUAL-TEST','Test Model');
INSERT INTO erp.equipment_ownerships(id,name) VALUES('OWN-EQP-DUAL-TEST','Owned');
INSERT INTO erp.equipment_locations(id,name) VALUES('LOC-EQP-DUAL-TEST','Yard');
INSERT INTO erp.equipment_conditions(id,name) VALUES('COND-EQP-DUAL-TEST','Good');

SELECT set_config('request.jwt.claim.sub','97000000-0000-4000-8000-000000000001',true);
CREATE TEMP TABLE first_issue AS SELECT erp.command_create_equipment(jsonb_build_object(
 'commandId','dual-1','idempotencyKey','dual-1','equipmentId','97000000-0000-4000-8000-000000000011',
 'equipmentName','Excavator','categoryId','d4c032dc-dc09-5a24-87c5-e663645f75ba',
 'subcategoryId','97000000-0000-4000-8000-000000000010','legacyEquipmentNumber',' OLD   42 ',
 'brandId','BRAND-EQP-DUAL-TEST','modelId','MODEL-EQP-DUAL-TEST','serialNumber','SN-DUAL',
 'yearModel',2024,'ownershipId','OWN-EQP-DUAL-TEST','locationId','LOC-EQP-DUAL-TEST',
 'conditionId','COND-EQP-DUAL-TEST','maintenanceType','Hour Meter','costCodeId','COST-EQP-DUAL-TEST',
 'currentReading',123.5,'remarks','Initial registration')) value;
SELECT pg_temp.assert_true((SELECT value->>'success'='true' AND value->'value'->>'assetNo' ~ '^ME-[0-9]{6,}$' FROM first_issue),'automatic approved prefix');
SELECT pg_temp.assert_true((SELECT legacy_equipment_number='OLD 42' AND brand_id='BRAND-EQP-DUAL-TEST'
 AND model_id='MODEL-EQP-DUAL-TEST' AND serial_number='SN-DUAL' AND year_model=2024
 AND ownership_id='OWN-EQP-DUAL-TEST' AND location_id='LOC-EQP-DUAL-TEST'
 AND condition_id='COND-EQP-DUAL-TEST' AND current_reading=123.5
 FROM erp.equipment WHERE id='97000000-0000-4000-8000-000000000011'),'registration fields persisted');
SELECT pg_temp.assert_true((SELECT legacy_equipment_number='OLD 42' AND ownership_name='Owned' AND location_name='Yard'
 FROM erp.equipment_read_model WHERE id='97000000-0000-4000-8000-000000000011'),'registration read projection');
UPDATE erp.equipment SET deleted_at=clock_timestamp() WHERE id='97000000-0000-4000-8000-000000000011';
SELECT pg_temp.assert_true((erp.command_create_equipment(jsonb_build_object(
 'commandId','dual-duplicate','idempotencyKey','dual-duplicate','equipmentId','97000000-0000-4000-8000-000000000012',
 'equipmentName','Duplicate','categoryId','d4c032dc-dc09-5a24-87c5-e663645f75ba',
 'subcategoryId','97000000-0000-4000-8000-000000000010','legacyEquipmentNumber','old 42',
 'maintenanceType','Hour Meter','costCodeId','COST-EQP-DUAL-TEST'))->>'code')='LEGACY_NUMBER_CONFLICT','deleted legacy number not reused');
CREATE TEMP TABLE second_issue AS SELECT erp.command_create_equipment(jsonb_build_object(
 'commandId','dual-2','idempotencyKey','dual-2','equipmentId','97000000-0000-4000-8000-000000000013',
 'equipmentName','Second','categoryId','d4c032dc-dc09-5a24-87c5-e663645f75ba',
 'subcategoryId','97000000-0000-4000-8000-000000000010',
 'maintenanceType','Hour Meter','costCodeId','COST-EQP-DUAL-TEST')) value;
SELECT pg_temp.assert_true((SELECT (substring(second_issue.value->'value'->>'assetNo' FROM '[0-9]+$'))::bigint
 > (substring(first_issue.value->'value'->>'assetNo' FROM '[0-9]+$'))::bigint FROM first_issue,second_issue),'asset number not reused after soft delete');
SELECT pg_temp.assert_true((SELECT legacy_equipment_number IS NULL FROM erp.equipment WHERE id='97000000-0000-4000-8000-000000000013'),'optional legacy number');
SELECT set_config('request.jwt.claim.sub','97000000-0000-4000-8000-000000000002',true);
SELECT pg_temp.assert_true((erp.command_create_equipment(jsonb_build_object(
 'commandId','dual-tenant','idempotencyKey','dual-tenant','equipmentId','97000000-0000-4000-8000-000000000014',
 'equipmentName','Cross tenant','categoryId','d4c032dc-dc09-5a24-87c5-e663645f75ba',
 'subcategoryId','97000000-0000-4000-8000-000000000010',
 'maintenanceType','Hour Meter','costCodeId','COST-EQP-DUAL-TEST'))->>'code')='NOT_FOUND','cross-tenant subcategory denied');
SELECT set_config('request.jwt.claim.sub','97000000-0000-4000-8000-000000000003',true);
SELECT pg_temp.assert_true((erp.command_create_equipment(jsonb_build_object(
 'commandId','dual-forbidden','idempotencyKey','dual-forbidden','equipmentId','97000000-0000-4000-8000-000000000015',
 'equipmentName','Forbidden','categoryId','d4c032dc-dc09-5a24-87c5-e663645f75ba',
 'subcategoryId','97000000-0000-4000-8000-000000000010',
 'maintenanceType','Hour Meter','costCodeId','COST-EQP-DUAL-TEST'))->>'code')='FORBIDDEN','equipment.create required');
SELECT pg_temp.assert_true((erp.read_canonical_equipment_reference_data()->>'code')='FORBIDDEN','reference read requires equipment.create');
ROLLBACK;
SELECT 'CANONICAL_EQUIPMENT_DUAL_NUMBERING_SEQUENTIAL_PASS';
