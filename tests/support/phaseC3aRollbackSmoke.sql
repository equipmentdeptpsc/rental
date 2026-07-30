BEGIN;

INSERT INTO auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,email_change,email_change_token_new,recovery_token)
VALUES
('00000000-0000-0000-0000-000000000000','72000000-0000-0000-0000-000000000001','authenticated','authenticated','c3a-authorized@invalid.local','',now(),'{}','{}',now(),now(),'','','',''),
('00000000-0000-0000-0000-000000000000','72000000-0000-0000-0000-000000000002','authenticated','authenticated','c3a-ordinary@invalid.local','',now(),'{}','{}',now(),now(),'','','','');
INSERT INTO erp.companies(id,code,name,environment_class) VALUES
('TENANT-UAT-C3A-A','TENANT-UAT-C3A-A','C3A A','test'),('TENANT-UAT-C3A-B','TENANT-UAT-C3A-B','C3A B','test');
INSERT INTO erp.users(id,username,display_name,status,company_id) VALUES
('72000000-0000-0000-0000-000000000001','c3a-authorized','C3A Authorized','active','TENANT-UAT-C3A-A'),
('72000000-0000-0000-0000-000000000002','c3a-ordinary','C3A Ordinary','active','TENANT-UAT-C3A-A');
INSERT INTO erp.app_roles(id,code,name) VALUES ('ROLE-UAT-C3A-OPS','c3a-ops','C3A Ops');
INSERT INTO erp.app_permissions(id,code,name) VALUES
('PERM-UAT-C3A-MANAGE','rental.manage','Rental Manage'),('PERM-UAT-C3A-RELEASE','rental.release','Rental Release');
INSERT INTO erp.role_permissions VALUES
('ROLE-UAT-C3A-OPS','PERM-UAT-C3A-MANAGE'),('ROLE-UAT-C3A-OPS','PERM-UAT-C3A-RELEASE');
INSERT INTO erp.user_roles(user_id,role_id) VALUES ('72000000-0000-0000-0000-000000000001','ROLE-UAT-C3A-OPS');
INSERT INTO erp.equipment_statuses(id,code,name) VALUES
('STATUS-UAT-C3A-AVAILABLE','Available','Available'),('STATUS-UAT-C3A-ASSIGNED','Assigned','Assigned'),('STATUS-UAT-C3A-RENTED','Rented','Rented');
INSERT INTO erp.customers(id,customer_code,name,company_id) VALUES
('UAT-C3A-CUSTOMER-A','UAT-C3A-CUST-A','Customer A','TENANT-UAT-C3A-A'),
('UAT-C3A-CUSTOMER-B','UAT-C3A-CUST-B','Customer B','TENANT-UAT-C3A-B');
INSERT INTO erp.projects(id,project_code,name,customer_id,company_id) VALUES
('UAT-C3A-PROJECT-A','UAT-C3A-PROJ-A','Project A','UAT-C3A-CUSTOMER-A','TENANT-UAT-C3A-A'),
('UAT-C3A-PROJECT-B','UAT-C3A-PROJ-B','Project B','UAT-C3A-CUSTOMER-B','TENANT-UAT-C3A-B');
INSERT INTO erp.operators(id,name,status,company_id) VALUES
('UAT-C3A-OP-A1','Operator A1','Active','TENANT-UAT-C3A-A'),('UAT-C3A-OP-A2','Operator A2','Active','TENANT-UAT-C3A-A');
INSERT INTO erp.equipment(id,asset_no,equipment_name,maintenance_type,status_id,company_id) VALUES
('UAT-C3A-EQ-A1','UAT-C3A-EQ-A1','Equipment A1','None','STATUS-UAT-C3A-AVAILABLE','TENANT-UAT-C3A-A'),
('UAT-C3A-EQ-A2','UAT-C3A-EQ-A2','Equipment A2','None','STATUS-UAT-C3A-AVAILABLE','TENANT-UAT-C3A-A');
INSERT INTO erp.assignments(id,equipment_id,operator_id,project_id,assigned_date,expected_return,status,company_id) VALUES
('UAT-C3A-ASG-A1','UAT-C3A-EQ-A1','UAT-C3A-OP-A1','UAT-C3A-PROJECT-A','2026-07-29','2026-08-29','Active','TENANT-UAT-C3A-A'),
('UAT-C3A-ASG-A2','UAT-C3A-EQ-A2','UAT-C3A-OP-A2','UAT-C3A-PROJECT-A','2026-07-29','2026-08-29','Active','TENANT-UAT-C3A-A');
INSERT INTO erp.rentals(id,rental_number,customer_id,project_id,customer_snapshot,project_snapshot,date_out,rental_type,status,company_id)
VALUES ('UAT-C3A-RENTAL-B','UAT-C3A-R-B','UAT-C3A-CUSTOMER-B','UAT-C3A-PROJECT-B','Customer B','Project B','2026-07-29','Operated Rental','Reserved','TENANT-UAT-C3A-B');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','72000000-0000-0000-0000-000000000001',true);
SELECT 1/(CASE WHEN (erp.command_create_reserved_rental('{"commandId":"UAT-C3A-CREATE-1","idempotencyKey":"UAT-C3A-IDEM-CREATE-1","rentalId":"UAT-C3A-RENTAL-A1","rentalNumber":"UAT-C3A-R-A1","customerId":"UAT-C3A-CUSTOMER-A","projectId":"UAT-C3A-PROJECT-A","dateOut":"2026-07-29","expectedReturn":"2026-08-29","rentalType":"Operated Rental","lines":[{"id":"UAT-C3A-LINE-A1","equipmentId":"UAT-C3A-EQ-A1","assignmentId":"UAT-C3A-ASG-A1","operatorId":"UAT-C3A-OP-A1"}]}'::jsonb)->>'success')::boolean THEN 1 ELSE 0 END);
SELECT 1/(CASE WHEN erp.command_create_reserved_rental('{"commandId":"UAT-C3A-CREATE-1B","idempotencyKey":"UAT-C3A-IDEM-CREATE-1","rentalId":"UAT-C3A-RENTAL-A1","rentalNumber":"UAT-C3A-R-A1","customerId":"UAT-C3A-CUSTOMER-A","projectId":"UAT-C3A-PROJECT-A","dateOut":"2026-07-29","expectedReturn":"2026-08-29","rentalType":"Operated Rental","lines":[{"id":"UAT-C3A-LINE-A1","equipmentId":"UAT-C3A-EQ-A1","assignmentId":"UAT-C3A-ASG-A1","operatorId":"UAT-C3A-OP-A1"}]}'::jsonb)->>'disposition'='REPLAYED' THEN 1 ELSE 0 END);
SELECT 1/(CASE WHEN erp.command_release_rental('{"commandId":"UAT-C3A-REL-1","idempotencyKey":"UAT-C3A-IDEM-REL-1","rentalId":"UAT-C3A-RENTAL-A1","expectedVersion":1}'::jsonb)->'value'->>'status'='Released' THEN 1 ELSE 0 END);
SELECT 1/(CASE WHEN erp.command_activate_rental('{"commandId":"UAT-C3A-ACT-1","idempotencyKey":"UAT-C3A-IDEM-ACT-1","rentalId":"UAT-C3A-RENTAL-A1","expectedVersion":2}'::jsonb)->'value'->>'status'='Active' THEN 1 ELSE 0 END);
SELECT 1/(CASE WHEN erp.command_release_rental('{"commandId":"UAT-C3A-CROSS","idempotencyKey":"UAT-C3A-IDEM-CROSS","rentalId":"UAT-C3A-RENTAL-B","expectedVersion":1}'::jsonb)->>'code'='NOT_FOUND' THEN 1 ELSE 0 END);
SELECT 1/(CASE WHEN (erp.command_create_reserved_rental('{"commandId":"UAT-C3A-CREATE-2","idempotencyKey":"UAT-C3A-IDEM-CREATE-2","rentalId":"UAT-C3A-RENTAL-A2","rentalNumber":"UAT-C3A-R-A2","customerId":"UAT-C3A-CUSTOMER-A","projectId":"UAT-C3A-PROJECT-A","dateOut":"2026-07-29","rentalType":"Operated Rental","lines":[{"id":"UAT-C3A-LINE-A2","equipmentId":"UAT-C3A-EQ-A2","assignmentId":"UAT-C3A-ASG-A2","operatorId":"UAT-C3A-OP-A2"}]}'::jsonb)->>'success')::boolean THEN 1 ELSE 0 END);
SELECT 1/(CASE WHEN erp.command_cancel_rental('{"commandId":"UAT-C3A-CAN-STALE","idempotencyKey":"UAT-C3A-IDEM-CAN-STALE","rentalId":"UAT-C3A-RENTAL-A2","expectedVersion":0}'::jsonb)->>'code'='CONFLICT' THEN 1 ELSE 0 END);
SELECT 1/(CASE WHEN erp.command_cancel_rental('{"commandId":"UAT-C3A-CAN-1","idempotencyKey":"UAT-C3A-IDEM-CAN-1","rentalId":"UAT-C3A-RENTAL-A2","expectedVersion":1}'::jsonb)->'value'->>'status'='Cancelled' THEN 1 ELSE 0 END);
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','72000000-0000-0000-0000-000000000002',true);
SELECT 1/(CASE WHEN erp.command_create_reserved_rental('{"commandId":"UAT-C3A-DENY","idempotencyKey":"UAT-C3A-IDEM-DENY","rentalId":"UAT-C3A-DENIED","rentalNumber":"UAT-C3A-DENIED","customerId":"UAT-C3A-CUSTOMER-A","projectId":"UAT-C3A-PROJECT-A","dateOut":"2026-07-29","rentalType":"Operated Rental","lines":[{"id":"UAT-C3A-DENIED-L","equipmentId":"UAT-C3A-EQ-A1","assignmentId":"UAT-C3A-ASG-A1","operatorId":"UAT-C3A-OP-A1"}]}'::jsonb)->>'code'='FORBIDDEN' THEN 1 ELSE 0 END);
RESET ROLE;
SELECT 1/(CASE WHEN (SELECT count(*) FROM erp.audit_log WHERE aggregate_id LIKE 'UAT-C3A-RENTAL-A%')=5 AND (SELECT count(*) FROM erp.operational_command_idempotency WHERE target_aggregate_id LIKE 'UAT-C3A-RENTAL-A%')=5 THEN 1 ELSE 0 END);

ROLLBACK;
