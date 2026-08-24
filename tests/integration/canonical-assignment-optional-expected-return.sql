\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION pg_temp.assert_true(value boolean,message text) RETURNS void LANGUAGE plpgsql AS $$BEGIN IF value IS NOT TRUE THEN RAISE EXCEPTION 'ASSERT: %',message;END IF;END$$;

INSERT INTO erp.companies(id,code,name,active,environment_class)
VALUES('TENANT-ASSIGN-OPTIONAL','ASOPT','Assignment Optional Date',true,'test');
INSERT INTO auth.users(id,email)
VALUES('60000000-0000-4000-8000-000000000001','assignment.optional@example.test');
INSERT INTO erp.users(id,username,display_name,email,status,company_id)
VALUES('60000000-0000-4000-8000-000000000001','assignment.optional','Assignment Optional','assignment.optional@example.test','active','TENANT-ASSIGN-OPTIONAL');
INSERT INTO erp.user_roles(user_id,role_id)
SELECT '60000000-0000-4000-8000-000000000001'::uuid,id FROM erp.app_roles WHERE code='system-administrator';
INSERT INTO erp.projects(id,name,active,company_id)
VALUES('PROJECT-ASSIGN-OPTIONAL','Assignment Optional Project',true,'TENANT-ASSIGN-OPTIONAL');
INSERT INTO erp.operators(id,name,status,company_id) VALUES
 ('OPERATOR-ASSIGN-OMITTED','Omitted Operator','Active','TENANT-ASSIGN-OPTIONAL'),
 ('OPERATOR-ASSIGN-BLANK','Blank Operator','Active','TENANT-ASSIGN-OPTIONAL'),
 ('OPERATOR-ASSIGN-EXPLICIT','Explicit Operator','Active','TENANT-ASSIGN-OPTIONAL');
INSERT INTO erp.equipment(id,asset_no,equipment_name,status_id,maintenance_type,current_reading,active,company_id)
SELECT item.id,item.asset,item.name,status.id,'Engine Hours',0,true,'TENANT-ASSIGN-OPTIONAL'
FROM (VALUES
 ('EQUIPMENT-ASSIGN-OMITTED','AS-OMITTED','Omitted Equipment'),
 ('EQUIPMENT-ASSIGN-BLANK','AS-BLANK','Blank Equipment'),
 ('EQUIPMENT-ASSIGN-EXPLICIT','AS-EXPLICIT','Explicit Equipment')) item(id,asset,name)
CROSS JOIN LATERAL (SELECT id FROM erp.equipment_statuses WHERE lower(code)='available' AND active AND deleted_at IS NULL ORDER BY sort_order,id LIMIT 1) status;

SELECT set_config('request.jwt.claim.sub','60000000-0000-4000-8000-000000000001',true);
CREATE TEMP TABLE omitted AS SELECT erp.command_create_assignment(jsonb_build_object(
 'commandId','assign-omitted','idempotencyKey','assign-omitted','assignmentId','61000000-0000-4000-8000-000000000001',
 'equipmentId','EQUIPMENT-ASSIGN-OMITTED','operatorId','OPERATOR-ASSIGN-OMITTED','projectId','PROJECT-ASSIGN-OPTIONAL','assignedDate','2026-08-24','remarks','Omitted date remark')) value;
CREATE TEMP TABLE blank AS SELECT erp.command_create_assignment(jsonb_build_object(
 'commandId','assign-blank','idempotencyKey','assign-blank','assignmentId','61000000-0000-4000-8000-000000000002',
 'equipmentId','EQUIPMENT-ASSIGN-BLANK','operatorId','OPERATOR-ASSIGN-BLANK','projectId','PROJECT-ASSIGN-OPTIONAL','assignedDate','2026-08-24','expectedReturn','')) value;
CREATE TEMP TABLE explicit AS SELECT erp.command_create_assignment(jsonb_build_object(
 'commandId','assign-explicit','idempotencyKey','assign-explicit','assignmentId','61000000-0000-4000-8000-000000000003',
 'equipmentId','EQUIPMENT-ASSIGN-EXPLICIT','operatorId','OPERATOR-ASSIGN-EXPLICIT','projectId','PROJECT-ASSIGN-OPTIONAL','assignedDate','2026-08-24','expectedReturn','2026-09-15')) value;

SELECT pg_temp.assert_true((SELECT value->>'success'='true' AND value->'value'->'expectedReturn'='null'::jsonb FROM omitted),'omitted response null');
SELECT pg_temp.assert_true((SELECT expected_return IS NULL AND remarks='Omitted date remark' FROM erp.assignments WHERE id='61000000-0000-4000-8000-000000000001'),'omitted persists null and remarks');
SELECT pg_temp.assert_true((SELECT value->>'success'='true' AND value->'value'->'expectedReturn'='null'::jsonb FROM blank),'blank response null');
SELECT pg_temp.assert_true((SELECT expected_return IS NULL FROM erp.assignments WHERE id='61000000-0000-4000-8000-000000000002'),'blank persists null');
SELECT pg_temp.assert_true((SELECT value->>'success'='true' AND value->'value'->>'expectedReturn'='2026-09-15' FROM explicit),'explicit response exact');
SELECT pg_temp.assert_true((SELECT expected_return='2026-09-15'::date FROM erp.assignments WHERE id='61000000-0000-4000-8000-000000000003'),'explicit persists exact');
SELECT pg_temp.assert_true((erp.command_create_assignment(jsonb_build_object('commandId','assign-missing-date','idempotencyKey','assign-missing-date','assignmentId','61000000-0000-4000-8000-000000000004','equipmentId','EQUIPMENT-ASSIGN-EXPLICIT','operatorId','OPERATOR-ASSIGN-EXPLICIT','projectId','PROJECT-ASSIGN-OPTIONAL'))->>'code')='VALIDATION_REJECTED','Assigned Date required');
SELECT pg_temp.assert_true((erp.command_create_assignment(jsonb_build_object('commandId','assign-omitted','idempotencyKey','assign-omitted','assignmentId','61000000-0000-4000-8000-000000000001','equipmentId','EQUIPMENT-ASSIGN-OMITTED','operatorId','OPERATOR-ASSIGN-OMITTED','projectId','PROJECT-ASSIGN-OPTIONAL','assignedDate','2026-08-24','remarks','Omitted date remark'))->>'disposition')='REPLAYED','idempotent replay');
SELECT pg_temp.assert_true((SELECT count(*)=3 FROM erp.assignments WHERE company_id='TENANT-ASSIGN-OPTIONAL'),'assignment cardinality');
SELECT pg_temp.assert_true((SELECT count(*)=3 FROM erp.audit_log WHERE company_id='TENANT-ASSIGN-OPTIONAL' AND action='ASSIGNMENT_CREATED'),'audit cardinality');
SELECT pg_temp.assert_true((SELECT count(*)=3 FROM erp.operational_command_idempotency WHERE company_id='TENANT-ASSIGN-OPTIONAL' AND command_type='CREATE_ASSIGNMENT' AND command_status='COMPLETED'),'command cardinality');
SELECT pg_temp.assert_true(NOT has_table_privilege('authenticated','erp.assignments','INSERT') AND NOT has_table_privilege('authenticated','erp.assignments','UPDATE') AND NOT has_table_privilege('authenticated','erp.assignments','DELETE'),'direct browser DML denied');
ROLLBACK;
SELECT 'CANONICAL_ASSIGNMENT_OPTIONAL_EXPECTED_RETURN_CERTIFICATION_PASS';
