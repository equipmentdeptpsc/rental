\set ON_ERROR_STOP on
CREATE FUNCTION pg_temp.assert_true(value boolean, message text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF value IS NOT TRUE THEN RAISE EXCEPTION 'ASSERT: %', message; END IF; END $$;

INSERT INTO erp.companies(id,code,name,active,environment_class)
VALUES ('TENANT-ACTIVITY-AMEND','ACTAMEND','Activity Amendment Test',true,'test');
INSERT INTO auth.users(id,email) VALUES
('81000000-0000-4000-8000-000000000001','activity.admin@example.test'),
('81000000-0000-4000-8000-000000000002','activity.auditor@example.test');
INSERT INTO erp.users(id,username,display_name,email,status,company_id) VALUES
('81000000-0000-4000-8000-000000000001','activity.admin','Activity Admin','activity.admin@example.test','active','TENANT-ACTIVITY-AMEND'),
('81000000-0000-4000-8000-000000000002','activity.auditor','Activity Auditor','activity.auditor@example.test','active','TENANT-ACTIVITY-AMEND');
INSERT INTO erp.user_roles(user_id,role_id)
SELECT '81000000-0000-4000-8000-000000000001'::uuid,id FROM erp.app_roles WHERE code='system-administrator';
INSERT INTO erp.user_roles(user_id,role_id)
SELECT '81000000-0000-4000-8000-000000000002'::uuid,id FROM erp.app_roles WHERE code='read-only-auditor';
INSERT INTO erp.activity_codes(id,code,name,active) VALUES
('ACT-AMEND-1','ACT-AMEND-1','Excavation',true),
('ACT-AMEND-2','ACT-AMEND-2','Hauling',true),
('ACT-AMEND-OFF','ACT-AMEND-OFF','Inactive',false);
INSERT INTO erp.projects(id,name,active,company_id)
VALUES ('ACT-AMEND-PROJECT','Activity Project',true,'TENANT-ACTIVITY-AMEND');
INSERT INTO erp.operators(id,name,status,company_id)
SELECT 'ACT-AMEND-OP-'||n,'Operator '||n,'Active','TENANT-ACTIVITY-AMEND' FROM generate_series(1,4) n;
INSERT INTO erp.equipment(id,asset_no,equipment_name,maintenance_type,company_id)
SELECT 'ACT-AMEND-EQ-'||n,'ACT-AMEND-EQ-'||n,'Equipment '||n,'None','TENANT-ACTIVITY-AMEND' FROM generate_series(1,4) n;
INSERT INTO erp.assignments(id,equipment_id,operator_id,project_id,assigned_date,status,company_id)
SELECT '82000000-0000-4000-8000-00000000000'||n,'ACT-AMEND-EQ-'||n,'ACT-AMEND-OP-'||n,
  'ACT-AMEND-PROJECT',current_date,'Active','TENANT-ACTIVITY-AMEND' FROM generate_series(1,4) n;
INSERT INTO erp.rentals(id,rental_number,project_id,customer_snapshot,project_snapshot,date_out,status,approval_status,
  approval_requested_at,approval_requested_by,approval_decided_at,approval_decided_by,company_id) VALUES
('83000000-0000-4000-8000-000000000002','ACT-AMEND-DRAFT','ACT-AMEND-PROJECT','Customer','Project',current_date,'Draft','NotSubmitted',null,null,null,null,'TENANT-ACTIVITY-AMEND'),
('83000000-0000-4000-8000-000000000003','ACT-AMEND-APPROVED','ACT-AMEND-PROJECT','Customer','Project',current_date,'Draft','Approved',clock_timestamp(),'81000000-0000-4000-8000-000000000001',clock_timestamp(),'81000000-0000-4000-8000-000000000001','TENANT-ACTIVITY-AMEND'),
('83000000-0000-4000-8000-000000000004','ACT-AMEND-RELEASED','ACT-AMEND-PROJECT','Customer','Project',current_date,'Released','NotSubmitted',null,null,null,null,'TENANT-ACTIVITY-AMEND');
INSERT INTO erp.rental_equipment_lines(id,rental_id,equipment_id,assignment_id,operator_id,status,company_id)
SELECT '84000000-0000-4000-8000-00000000000'||n,'83000000-0000-4000-8000-00000000000'||n,
  'ACT-AMEND-EQ-'||n,'82000000-0000-4000-8000-00000000000'||n,'ACT-AMEND-OP-'||n,
  (CASE WHEN n=4 THEN 'Released' ELSE 'Draft' END)::erp.rental_status,'TENANT-ACTIVITY-AMEND'
FROM generate_series(2,4) n;

SELECT set_config('request.jwt.claim.sub','81000000-0000-4000-8000-000000000001',true);
SELECT pg_temp.assert_true(erp.current_user_has_permission('assignment.update'),'canonical Assignment update permission');
SELECT pg_temp.assert_true(NOT erp.current_user_has_permission('assignment.manage'),'deprecated Assignment manage absent');
CREATE TEMP TABLE amendment_results(label text,value jsonb);
INSERT INTO amendment_results SELECT 'missing',erp.command_amend_assignment_activity_code(jsonb_build_object(
  'commandId','activity-missing','idempotencyKey','activity-missing','assignmentId','82000000-0000-4000-8000-000000000002',
  'activityCodeId','ACT-AMEND-1','expectedVersion',1));
SELECT pg_temp.assert_true((SELECT value->>'success'='true' FROM amendment_results WHERE label='missing'),'missing code assigned');
SELECT pg_temp.assert_true((SELECT activity_code_id='ACT-AMEND-1' AND row_version=2 FROM erp.assignments WHERE id='82000000-0000-4000-8000-000000000002'),'version increment and code assigned');
INSERT INTO amendment_results SELECT 'existing',erp.command_amend_assignment_activity_code(jsonb_build_object(
  'commandId','activity-existing','idempotencyKey','activity-existing','assignmentId','82000000-0000-4000-8000-000000000002',
  'activityCodeId','ACT-AMEND-2','expectedVersion',2));
SELECT pg_temp.assert_true((SELECT value->>'success'='true' FROM amendment_results WHERE label='existing'),'existing code changed');
SELECT pg_temp.assert_true((SELECT activity_code_id='ACT-AMEND-2' AND row_version=3 AND status='Active' AND equipment_id='ACT-AMEND-EQ-2' AND operator_id='ACT-AMEND-OP-2' AND project_id='ACT-AMEND-PROJECT' FROM erp.assignments WHERE id='82000000-0000-4000-8000-000000000002'),'change preserves fields and advances version');
INSERT INTO amendment_results SELECT 'stale',erp.command_amend_assignment_activity_code(jsonb_build_object(
  'commandId','activity-stale','idempotencyKey','activity-stale','assignmentId','82000000-0000-4000-8000-000000000002',
  'activityCodeId','ACT-AMEND-1','expectedVersion',1));
INSERT INTO amendment_results SELECT 'inactive-code',erp.command_amend_assignment_activity_code(jsonb_build_object(
  'commandId','activity-inactive','idempotencyKey','activity-inactive','assignmentId','82000000-0000-4000-8000-000000000001',
  'activityCodeId','ACT-AMEND-OFF','expectedVersion',1));
INSERT INTO amendment_results SELECT 'unlinked',erp.command_amend_assignment_activity_code(jsonb_build_object(
  'commandId','activity-unlinked','idempotencyKey','activity-unlinked','assignmentId','82000000-0000-4000-8000-000000000001',
  'activityCodeId','ACT-AMEND-1','expectedVersion',1));
INSERT INTO amendment_results SELECT 'approved',erp.command_amend_assignment_activity_code(jsonb_build_object(
  'commandId','activity-approved','idempotencyKey','activity-approved','assignmentId','82000000-0000-4000-8000-000000000003',
  'activityCodeId','ACT-AMEND-1','expectedVersion',1));
INSERT INTO amendment_results SELECT 'released',erp.command_amend_assignment_activity_code(jsonb_build_object(
  'commandId','activity-released','idempotencyKey','activity-released','assignmentId','82000000-0000-4000-8000-000000000004',
  'activityCodeId','ACT-AMEND-1','expectedVersion',1));
UPDATE erp.rentals SET status='Active',canonical_parent_status='Active' WHERE rental_number='ACT-AMEND-RELEASED';
UPDATE erp.rental_equipment_lines SET status='Active',canonical_line_status='Active' WHERE id='84000000-0000-4000-8000-000000000004';
INSERT INTO amendment_results SELECT 'active',erp.command_amend_assignment_activity_code(jsonb_build_object(
  'commandId','activity-active','idempotencyKey','activity-active','assignmentId','82000000-0000-4000-8000-000000000004',
  'activityCodeId','ACT-AMEND-1','expectedVersion',1));
SELECT set_config('request.jwt.claim.sub','81000000-0000-4000-8000-000000000002',true);
INSERT INTO amendment_results SELECT 'unauthorized',erp.command_amend_assignment_activity_code(jsonb_build_object(
  'commandId','activity-unauthorized','idempotencyKey','activity-unauthorized','assignmentId','82000000-0000-4000-8000-000000000001',
  'activityCodeId','ACT-AMEND-1','expectedVersion',1));
SELECT pg_temp.assert_true((SELECT value->>'code'='CONFLICT' FROM amendment_results WHERE label='stale'),'stale version rejected');
SELECT pg_temp.assert_true((SELECT value->>'code'='NOT_FOUND' FROM amendment_results WHERE label='inactive-code'),'inactive code rejected');
SELECT pg_temp.assert_true((SELECT value->>'success'='true' FROM amendment_results WHERE label='unlinked'),'unlinked Assignment amendment');
SELECT pg_temp.assert_true((SELECT value->>'code'='APPROVED_LOCKED' FROM amendment_results WHERE label='approved'),'Approved rental rejected');
SELECT pg_temp.assert_true((SELECT value->>'code'='DEPENDENCY_CONFLICT' FROM amendment_results WHERE label='released'),'Released rental rejected');
SELECT pg_temp.assert_true((SELECT value->>'code'='DEPENDENCY_CONFLICT' FROM amendment_results WHERE label='active'),'Active rental rejected');
SELECT pg_temp.assert_true((SELECT value->>'code'='FORBIDDEN' FROM amendment_results WHERE label='unauthorized'),'unauthorized direct RPC rejected');
SELECT pg_temp.assert_true((SELECT count(*)=3 FROM erp.audit_log WHERE company_id='TENANT-ACTIVITY-AMEND' AND action='ASSIGNMENT_ACTIVITY_CODE_AMENDED'),'amendment audit count');
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM erp.audit_log WHERE company_id='TENANT-ACTIVITY-AMEND' AND action='ASSIGNMENT_ACTIVITY_CODE_AMENDED' AND previous_values->>'activityCodeId'='ACT-AMEND-1' AND new_values->>'activityCodeId'='ACT-AMEND-2'),'prior and new audit values');
SELECT 'PREAPPROVAL_ASSIGNMENT_ACTIVITY_CODE_AMENDMENT_PASS';
