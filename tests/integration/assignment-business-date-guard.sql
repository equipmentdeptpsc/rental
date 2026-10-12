\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION pg_temp.assert_true(value boolean, message text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF value IS NOT TRUE THEN RAISE EXCEPTION 'ASSERT: %', message; END IF; END $$;

INSERT INTO erp.companies(id,code,name,active,environment_class) VALUES
 ('TENANT-DATE-GUARD','TDG','Assignment Date Guard',true,'test'),
 ('TENANT-DATE-OTHER','TDO','Other Date Tenant',true,'test');
INSERT INTO auth.users(id) VALUES('99300000-0000-4000-8000-000000000001'),('99300000-0000-4000-8000-000000000002');
INSERT INTO erp.users(id,username,display_name,email,status,company_id) VALUES
 ('99300000-0000-4000-8000-000000000001','date.guard.admin','Date Admin','date.admin@example.test','active','TENANT-DATE-GUARD'),
 ('99300000-0000-4000-8000-000000000002','date.guard.viewer','Date Viewer','date.viewer@example.test','active','TENANT-DATE-GUARD');
INSERT INTO erp.user_roles(user_id,role_id) SELECT '99300000-0000-4000-8000-000000000001',id FROM erp.app_roles WHERE code='system-administrator';
INSERT INTO erp.user_roles(user_id,role_id) SELECT '99300000-0000-4000-8000-000000000002',id FROM erp.app_roles WHERE code='read-only-auditor';
INSERT INTO erp.customers(id,name,active,company_id) VALUES('CUSTOMER-DATE','Date Customer',true,'TENANT-DATE-GUARD'),('CUSTOMER-DATE-OTHER','Other Customer',true,'TENANT-DATE-OTHER');
INSERT INTO erp.projects(id,name,customer_id,active,company_id) VALUES('PROJECT-DATE','Date Project','CUSTOMER-DATE',true,'TENANT-DATE-GUARD'),('PROJECT-DATE-OTHER','Other Project','CUSTOMER-DATE-OTHER',true,'TENANT-DATE-OTHER');
INSERT INTO erp.operators(id,name,status,company_id) VALUES('OPERATOR-DATE-A','A','Active','TENANT-DATE-GUARD'),('OPERATOR-DATE-B','B','Active','TENANT-DATE-GUARD'),('OPERATOR-DATE-C','C','Active','TENANT-DATE-GUARD');
INSERT INTO erp.activity_codes(id,code,name,active) VALUES('ACTIVITY-DATE','ACT-DATE','Assignment Date Test',true);
INSERT INTO erp.equipment(id,asset_no,equipment_name,status_id,maintenance_type,active,company_id)
 SELECT x.id,x.asset_no,x.id,s.id,'Engine Hours',true,'TENANT-DATE-GUARD'
 FROM (VALUES('EQUIPMENT-DATE-A','DATE-001'),('EQUIPMENT-DATE-B','DATE-002')) x(id,asset_no)
 CROSS JOIN LATERAL (SELECT id FROM erp.equipment_statuses WHERE lower(code)='available' AND active AND deleted_at IS NULL ORDER BY sort_order,id LIMIT 1) s;
INSERT INTO erp.equipment(id,asset_no,equipment_name,status_id,maintenance_type,active,company_id)
 SELECT 'EQUIPMENT-DATE-C','DATE-003','Historical',s.id,'Engine Hours',true,'TENANT-DATE-GUARD'
 FROM erp.equipment_statuses s WHERE lower(code)='assigned' AND active AND deleted_at IS NULL ORDER BY sort_order,id LIMIT 1;
INSERT INTO erp.assignments(id,equipment_id,operator_id,project_id,assigned_date,expected_return,remarks,status,company_id)
 VALUES('99300000-0000-4000-8000-000000000013','EQUIPMENT-DATE-C','OPERATOR-DATE-C','PROJECT-DATE',
  (clock_timestamp() AT TIME ZONE 'Asia/Manila')::date-10,(clock_timestamp() AT TIME ZONE 'Asia/Manila')::date+10,'Original','Active','TENANT-DATE-GUARD');

CREATE FUNCTION pg_temp.create_assignment(command_id text, assignment_id text, equipment_id text, operator_id text, start_on date, return_on date, extra jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb LANGUAGE sql AS $$ SELECT erp.command_create_assignment_with_customer(jsonb_build_object(
  'commandId',command_id,'idempotencyKey',command_id,'assignmentId',assignment_id,'equipmentId',equipment_id,
  'operatorId',operator_id,'customerId','CUSTOMER-DATE','projectId','PROJECT-DATE','activityCodeId','ACTIVITY-DATE',
  'assignedDate',start_on::text,'expectedReturn',return_on::text,'remarks','Direct SQL command')||extra) $$;
CREATE FUNCTION pg_temp.revise_assignment(command_id text, start_on date, return_on date, version bigint, extra jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb LANGUAGE sql AS $$ SELECT erp.command_revise_assignment(jsonb_build_object(
  'commandId',command_id,'idempotencyKey',command_id,'assignmentId','99300000-0000-4000-8000-000000000013',
  'expectedVersion',version,'operatorId','OPERATOR-DATE-C','projectId','PROJECT-DATE',
  'assignedDate',start_on::text,'expectedReturn',return_on::text,'remarks','Revised')||extra) $$;

CREATE TEMP TABLE pg_temp.test_dates AS SELECT (clock_timestamp() AT TIME ZONE 'Asia/Manila')::date today;
SELECT set_config('request.jwt.claim.sub','99300000-0000-4000-8000-000000000002',true);
SELECT pg_temp.assert_true((SELECT pg_temp.create_assignment('date-create-denied','99300000-0000-4000-8000-000000000011','EQUIPMENT-DATE-A','OPERATOR-DATE-A',today,today+1)->>'code'='FORBIDDEN' FROM pg_temp.test_dates),'unauthorized create denied');
SELECT pg_temp.assert_true((SELECT pg_temp.revise_assignment('date-revise-denied',today,today+1,1)->>'code'='FORBIDDEN' FROM pg_temp.test_dates),'unauthorized revision denied');
SELECT set_config('request.jwt.claim.sub','99300000-0000-4000-8000-000000000001',true);
SELECT pg_temp.assert_true((SELECT pg_temp.create_assignment('date-create-yesterday','99300000-0000-4000-8000-000000000011','EQUIPMENT-DATE-A','OPERATOR-DATE-A',today-1,today+1)->>'code'='ASSIGNMENT_START_DATE_IN_PAST' FROM pg_temp.test_dates),'yesterday create rejected by direct RPC');
SELECT pg_temp.assert_true((SELECT pg_temp.create_assignment('date-create-return-before','99300000-0000-4000-8000-000000000011','EQUIPMENT-DATE-A','OPERATOR-DATE-A',today,today-1)->>'code'='VALIDATION_REJECTED' FROM pg_temp.test_dates),'return before start rejected');
SELECT pg_temp.assert_true((SELECT pg_temp.create_assignment('date-create-cross','99300000-0000-4000-8000-000000000011','EQUIPMENT-DATE-A','OPERATOR-DATE-A',today,today+1,'{"customerId":"CUSTOMER-DATE-OTHER","projectId":"PROJECT-DATE-OTHER"}'::jsonb)->>'code'='CUSTOMER_PROJECT_MISMATCH' FROM pg_temp.test_dates),'cross-tenant create rejected');
SELECT pg_temp.assert_true((SELECT pg_temp.create_assignment('date-create-today','99300000-0000-4000-8000-000000000011','EQUIPMENT-DATE-A','OPERATOR-DATE-A',today,today+1)->>'success'='true' FROM pg_temp.test_dates),'today create accepted');
SELECT pg_temp.assert_true((SELECT pg_temp.create_assignment('date-create-future','99300000-0000-4000-8000-000000000012','EQUIPMENT-DATE-B','OPERATOR-DATE-B',today+1,today+2)->>'success'='true' FROM pg_temp.test_dates),'future create accepted');
SELECT pg_temp.assert_true((SELECT count(*)=2 FROM erp.audit_log WHERE action='ASSIGNMENT_CREATED' AND aggregate_id IN('99300000-0000-4000-8000-000000000011','99300000-0000-4000-8000-000000000012')),'authorized creates audited');
SELECT pg_temp.assert_true((SELECT pg_temp.revise_assignment('date-revise-cross',today,today+1,1,'{"projectId":"PROJECT-DATE-OTHER"}'::jsonb)->>'code'='NOT_FOUND' FROM pg_temp.test_dates),'cross-tenant revision rejected');
SELECT pg_temp.assert_true((SELECT pg_temp.revise_assignment('date-revise-yesterday',today-1,today+1,1)->>'code'='ASSIGNMENT_START_DATE_IN_PAST' FROM pg_temp.test_dates),'changed historical date rejected');
SELECT pg_temp.assert_true((SELECT pg_temp.revise_assignment('date-revise-return-before',today-10,today-11,1)->>'code'='VALIDATION_REJECTED' FROM pg_temp.test_dates),'revision return before start rejected');
SELECT pg_temp.assert_true((SELECT pg_temp.revise_assignment('date-revise-remarks',today-10,today+10,1,'{"remarks":"Remarks only"}'::jsonb)->>'success'='true' FROM pg_temp.test_dates),'unchanged historical date retained');
SELECT pg_temp.assert_true((SELECT a.assigned_date=d.today-10 AND a.remarks='Remarks only' FROM erp.assignments a CROSS JOIN pg_temp.test_dates d WHERE a.id='99300000-0000-4000-8000-000000000013'),'historical date unchanged in storage');
SELECT pg_temp.assert_true((SELECT pg_temp.revise_assignment('date-revise-future',today+1,today+2,2)->>'success'='true' FROM pg_temp.test_dates),'future revision accepted');
SELECT pg_temp.assert_true((SELECT count(*)=2 FROM erp.audit_log WHERE aggregate_id='99300000-0000-4000-8000-000000000013' AND action='ASSIGNMENT_REVISED'),'accepted revisions audited; denials not audited');
INSERT INTO erp.rentals(id,assignment_id,customer_id,project_id,customer_snapshot,project_snapshot,date_out,status,company_id)
 SELECT '99300000-0000-4000-8000-000000000020','99300000-0000-4000-8000-000000000013','CUSTOMER-DATE','PROJECT-DATE','Customer','Project',today+1,'Draft','TENANT-DATE-GUARD' FROM pg_temp.test_dates;
SELECT pg_temp.assert_true((SELECT pg_temp.revise_assignment('date-revise-linked',today+2,today+3,3)->>'code'='DEPENDENCY_CONFLICT' FROM pg_temp.test_dates),'linked Rental lineage unchanged');
ROLLBACK;
SELECT 'ASSIGNMENT_BUSINESS_DATE_GUARD_PASS';
