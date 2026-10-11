\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION pg_temp.assert_true(value boolean,message text) RETURNS void LANGUAGE plpgsql AS $$BEGIN IF value IS NOT TRUE THEN RAISE EXCEPTION 'ASSERT: %',message;END IF;END$$;
INSERT INTO erp.companies(id,code,name,active,environment_class) VALUES('TENANT-CUST-ASSIGN','TCA','Customer Assignment',true,'test'),('TENANT-CUST-OTHER','TCO','Other Customer Assignment',true,'test');
INSERT INTO auth.users(id) VALUES('99200000-0000-4000-8000-000000000001'),('99200000-0000-4000-8000-000000000002');
INSERT INTO erp.users(id,username,display_name,email,status,company_id) VALUES
 ('99200000-0000-4000-8000-000000000001','customer.assignment.admin','Admin','ca.admin@example.test','active','TENANT-CUST-ASSIGN'),
 ('99200000-0000-4000-8000-000000000002','customer.assignment.viewer','Viewer','ca.viewer@example.test','active','TENANT-CUST-ASSIGN');
INSERT INTO erp.user_roles(user_id,role_id) SELECT '99200000-0000-4000-8000-000000000001',id FROM erp.app_roles WHERE code='system-administrator';
INSERT INTO erp.user_roles(user_id,role_id) SELECT '99200000-0000-4000-8000-000000000002',id FROM erp.app_roles WHERE code='read-only-auditor';
INSERT INTO erp.customers(id,name,active,company_id) VALUES('CUSTOMER-CA-1','Customer A',true,'TENANT-CUST-ASSIGN'),('CUSTOMER-CA-2','Customer B',true,'TENANT-CUST-ASSIGN'),('CUSTOMER-CA-OTHER','Other Tenant',true,'TENANT-CUST-OTHER');
INSERT INTO erp.projects(id,name,customer_id,active,company_id) VALUES('PROJECT-CA-1','Project A','CUSTOMER-CA-1',true,'TENANT-CUST-ASSIGN'),('PROJECT-CA-OTHER','Other Tenant Project','CUSTOMER-CA-OTHER',true,'TENANT-CUST-OTHER');
INSERT INTO erp.operators(id,name,status,company_id) VALUES('OPERATOR-CA-1','Operator A','Active','TENANT-CUST-ASSIGN');
INSERT INTO erp.activity_codes(id,code,name,active) VALUES('ACTIVITY-CA-1','ACT-CA','Activity',true);
INSERT INTO erp.equipment(id,asset_no,equipment_name,status_id,maintenance_type,active,company_id)
 SELECT 'EQUIPMENT-CA-1','CA-001','Equipment A',id,'Engine Hours',true,'TENANT-CUST-ASSIGN'
 FROM erp.equipment_statuses WHERE lower(code)='available' AND active AND deleted_at IS NULL ORDER BY sort_order,id LIMIT 1;
CREATE FUNCTION pg_temp.create_assignment(command_id text, extra jsonb DEFAULT '{}'::jsonb) RETURNS jsonb LANGUAGE sql AS $$
 SELECT erp.command_create_assignment_with_customer(jsonb_build_object('commandId',command_id,'idempotencyKey',command_id,
  'assignmentId','99200000-0000-4000-8000-000000000010','equipmentId','EQUIPMENT-CA-1',
  'operatorId','OPERATOR-CA-1','customerId','CUSTOMER-CA-1','projectId','PROJECT-CA-1',
  'activityCodeId','ACTIVITY-CA-1','assignedDate','2026-10-20','expectedReturn','2026-10-25','remarks','Customer-led booking')||extra)
$$;
SELECT set_config('request.jwt.claim.sub','99200000-0000-4000-8000-000000000002',true);
SELECT pg_temp.assert_true((pg_temp.create_assignment('ca-forbidden')->>'code')='FORBIDDEN','read-only role denied');
SELECT set_config('request.jwt.claim.sub','99200000-0000-4000-8000-000000000001',true);
SELECT pg_temp.assert_true((pg_temp.create_assignment('ca-mismatch','{"customerId":"CUSTOMER-CA-2"}'::jsonb)->>'code')='CUSTOMER_PROJECT_MISMATCH','wrong Customer rejected');
SELECT pg_temp.assert_true((pg_temp.create_assignment('ca-cross','{"customerId":"CUSTOMER-CA-OTHER","projectId":"PROJECT-CA-OTHER"}'::jsonb)->>'code')='CUSTOMER_PROJECT_MISMATCH','cross-tenant relationship rejected');
SELECT pg_temp.assert_true((pg_temp.create_assignment('ca-missing','{"customerId":""}'::jsonb)->>'code')='CUSTOMER_PROJECT_MISMATCH','explicit Customer required');
SELECT pg_temp.assert_true((pg_temp.create_assignment('ca-ok')->'value'->>'customerId')='CUSTOMER-CA-1','authorized create returns Customer');
SELECT pg_temp.assert_true((SELECT customer_id='CUSTOMER-CA-1' AND project_id='PROJECT-CA-1' FROM erp.assignments WHERE id='99200000-0000-4000-8000-000000000010'),'Customer persisted and reloadable');
SELECT pg_temp.assert_true((pg_temp.create_assignment('ca-ok')->>'disposition')='REPLAYED','idempotent retry retains Customer');
CREATE TEMP TABLE draft AS SELECT erp.command_create_draft_rental(jsonb_build_object('commandId','99200000-0000-4000-8000-000000000020','idempotencyKey','ca-rental',
 'customerId','CUSTOMER-CA-1','projectId','PROJECT-CA-1','dateOut','2026-10-20','expectedReturn','2026-10-25','rentalType','Operated Rental',
 'representativeName','Customer Representative','representativeEmail','representative@example.test',
 'lines',jsonb_build_array(jsonb_build_object('assignmentId','99200000-0000-4000-8000-000000000010')))) value;
SELECT pg_temp.assert_true((SELECT value->>'success'='true' FROM draft),'Rental handoff accepted');
SELECT pg_temp.assert_true((SELECT r.customer_id=a.customer_id AND r.project_id=a.project_id FROM erp.rentals r JOIN erp.rental_equipment_lines l ON l.rental_id=r.id JOIN erp.assignments a ON a.id=l.assignment_id WHERE r.id='99200000-0000-4000-8000-000000000020'),'Rental preserves Customer relationship through its equipment line');
ROLLBACK;
SELECT 'ASSIGNMENT_CUSTOMER_IDENTITY_PASS';
