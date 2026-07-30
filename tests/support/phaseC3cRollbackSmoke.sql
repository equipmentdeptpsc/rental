BEGIN;
CREATE FUNCTION pg_temp.assert_true(ok boolean,label text) RETURNS integer LANGUAGE plpgsql AS $$
BEGIN IF NOT coalesce(ok,false) THEN RAISE EXCEPTION 'C3C smoke assertion failed: %',label; END IF; RETURN 1; END $$;

INSERT INTO auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,email_change,email_change_token_new,recovery_token)
VALUES
('00000000-0000-0000-0000-000000000000','74000000-0000-0000-0000-000000000001','authenticated','authenticated','c3c-authorized@invalid.local','',now(),'{}','{}',now(),now(),'','','',''),
('00000000-0000-0000-0000-000000000000','74000000-0000-0000-0000-000000000002','authenticated','authenticated','c3c-ordinary@invalid.local','',now(),'{}','{}',now(),now(),'','','','');
INSERT INTO erp.companies(id,code,name,environment_class) VALUES
('TENANT-UAT-C3C-A','TENANT-UAT-C3C-A','C3C A','test'),('TENANT-UAT-C3C-B','TENANT-UAT-C3C-B','C3C B','test');
INSERT INTO erp.users(id,username,display_name,status,company_id) VALUES
('74000000-0000-0000-0000-000000000001','c3c-authorized','C3C Authorized','active','TENANT-UAT-C3C-A'),
('74000000-0000-0000-0000-000000000002','c3c-ordinary','C3C Ordinary','active','TENANT-UAT-C3C-A');
INSERT INTO erp.app_roles(id,code,name) VALUES ('ROLE-UAT-C3C','c3c-recovery','C3C Recovery');
INSERT INTO erp.app_permissions(id,code,name) VALUES
('PERM-UAT-C3C-MANAGE','rental.manage','Rental Manage'),
('PERM-UAT-C3C-RETURN','rental.return','Rental Return'),
('PERM-UAT-C3C-BILLING','billing.update','Billing Update');
INSERT INTO erp.role_permissions VALUES
('ROLE-UAT-C3C','PERM-UAT-C3C-MANAGE'),('ROLE-UAT-C3C','PERM-UAT-C3C-RETURN'),('ROLE-UAT-C3C','PERM-UAT-C3C-BILLING');
INSERT INTO erp.user_roles(user_id,role_id) VALUES ('74000000-0000-0000-0000-000000000001','ROLE-UAT-C3C');
INSERT INTO erp.equipment_statuses(id,code,name) VALUES
('STATUS-UAT-C3C-AVAILABLE','Available','Available'),('STATUS-UAT-C3C-RENTED','Rented','Rented');
INSERT INTO erp.customers(id,customer_code,name,company_id) VALUES
('UAT-C3C-CUSTOMER-A','UAT-C3C-CUST-A','Customer A','TENANT-UAT-C3C-A'),
('UAT-C3C-CUSTOMER-B','UAT-C3C-CUST-B','Customer B','TENANT-UAT-C3C-B');
INSERT INTO erp.projects(id,project_code,name,customer_id,company_id) VALUES
('UAT-C3C-PROJECT-A','UAT-C3C-PROJ-A','Project A','UAT-C3C-CUSTOMER-A','TENANT-UAT-C3C-A'),
('UAT-C3C-PROJECT-B','UAT-C3C-PROJ-B','Project B','UAT-C3C-CUSTOMER-B','TENANT-UAT-C3C-B');
INSERT INTO erp.operators(id,name,status,company_id) VALUES ('UAT-C3C-OP-A','Operator A','Active','TENANT-UAT-C3C-A');
INSERT INTO erp.equipment(id,asset_no,equipment_name,maintenance_type,status_id,company_id) VALUES
('UAT-C3C-EQ-A','UAT-C3C-EQ-A','Equipment A','None','STATUS-UAT-C3C-AVAILABLE','TENANT-UAT-C3C-A');
INSERT INTO erp.assignments(id,equipment_id,operator_id,project_id,assigned_date,expected_return,returned_date,status,company_id) VALUES
('UAT-C3C-ASG-A','UAT-C3C-EQ-A','UAT-C3C-OP-A','UAT-C3C-PROJECT-A','2026-07-01','2026-07-29','2026-07-29','Completed','TENANT-UAT-C3C-A');
INSERT INTO erp.rentals(id,rental_number,customer_id,project_id,customer_snapshot,project_snapshot,date_out,rental_type,status,returned_at,closed_at,company_id) VALUES
('UAT-C3C-REOPEN','UAT-C3C-R-REOPEN','UAT-C3C-CUSTOMER-A','UAT-C3C-PROJECT-A','Customer A','Project A','2026-07-01','Operated Rental','Closed',now(),now(),'TENANT-UAT-C3C-A'),
('UAT-C3C-RETURN','UAT-C3C-R-RETURN','UAT-C3C-CUSTOMER-A','UAT-C3C-PROJECT-A','Customer A','Project A','2026-07-01','Operated Rental','Returned',now(),NULL,'TENANT-UAT-C3C-A'),
('UAT-C3C-BLOCKED','UAT-C3C-R-BLOCKED','UAT-C3C-CUSTOMER-A','UAT-C3C-PROJECT-A','Customer A','Project A','2026-07-01','Operated Rental','Closed',now(),now(),'TENANT-UAT-C3C-A'),
('UAT-C3C-FINANCIAL','UAT-C3C-R-FIN','UAT-C3C-CUSTOMER-A','UAT-C3C-PROJECT-A','Customer A','Project A','2026-07-01','Operated Rental','Closed',now(),now(),'TENANT-UAT-C3C-A'),
('UAT-C3C-CROSS','UAT-C3C-R-CROSS','UAT-C3C-CUSTOMER-B','UAT-C3C-PROJECT-B','Customer B','Project B','2026-07-01','Operated Rental','Closed',now(),now(),'TENANT-UAT-C3C-B');
INSERT INTO erp.rental_equipment_lines(id,rental_id,equipment_id,assignment_id,operator_id,status,company_id)
VALUES('UAT-C3C-LINE-A','UAT-C3C-RETURN','UAT-C3C-EQ-A','UAT-C3C-ASG-A','UAT-C3C-OP-A','Returned','TENANT-UAT-C3C-A');
INSERT INTO erp.deurs(id,deur_number,rental_id,equipment_id,operator_id,project_id,customer_id,work_date,status,evidence_mode,
  billing_locked,billing_statement_id,company_id)
VALUES('UAT-C3C-DEUR-A','UAT-C3C-DEUR-A','UAT-C3C-FINANCIAL','UAT-C3C-EQ-A','UAT-C3C-OP-A','UAT-C3C-PROJECT-A','UAT-C3C-CUSTOMER-A',
  '2026-07-29','Billed','TIME_TIMELINE',true,NULL,'TENANT-UAT-C3C-A');
INSERT INTO erp.billing_statements(id,statement_no,rental_id,customer_snapshot,project_snapshot,billing_from,billing_to,currency,
  subtotal,vat,withholding_tax,grand_total,approval_status,invoice_status,created_by,company_id) VALUES
('UAT-C3C-STATEMENT-VOID','UAT-C3C-BS-VOID','UAT-C3C-FINANCIAL','Customer A','Project A','2026-07-29','2026-07-29','PHP',100,12,2,110,'Draft','Not Invoiced','C3C','TENANT-UAT-C3C-A'),
('UAT-C3C-STATEMENT-INVOICE','UAT-C3C-BS-INVOICE','UAT-C3C-FINANCIAL','Customer A','Project A','2026-07-28','2026-07-28','PHP',100,12,2,110,'Approved','Invoiced','C3C','TENANT-UAT-C3C-A'),
('UAT-C3C-STATEMENT-BLOCK','UAT-C3C-BS-BLOCK','UAT-C3C-BLOCKED','Customer A','Project A','2026-07-27','2026-07-27','PHP',100,12,2,110,'Approved','Partially Collected','C3C','TENANT-UAT-C3C-A');
UPDATE erp.deurs SET billing_statement_id='UAT-C3C-STATEMENT-VOID' WHERE id='UAT-C3C-DEUR-A';
INSERT INTO erp.billing_statement_lines(id,billing_statement_id,equipment_id,deur_id,operator_id,work_date,description,cost_code_snapshot,
  billing_method,hours,hourly_rate,amount,vat,withholding_tax,grand_total,company_id)
VALUES('UAT-C3C-BILLING-LINE','UAT-C3C-STATEMENT-VOID','UAT-C3C-EQ-A','UAT-C3C-DEUR-A','UAT-C3C-OP-A','2026-07-29','Rental','',
  'Per Hour',1,100,100,12,2,110,'TENANT-UAT-C3C-A');
UPDATE erp.billing_statements SET approval_status='Approved' WHERE id='UAT-C3C-STATEMENT-VOID';
INSERT INTO erp.collections(id,billing_statement_id,amount,currency,reference_no,collected_at)
VALUES('UAT-C3C-COLLECTION','UAT-C3C-STATEMENT-BLOCK',10,'PHP','UAT-C3C-REF',now());

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','74000000-0000-0000-0000-000000000001',true);
SELECT pg_temp.assert_true(erp.command_reopen_rental('{"commandId":"UAT-C3C-REOPEN","idempotencyKey":"UAT-C3C-IDEM-REOPEN","rentalId":"UAT-C3C-REOPEN","expectedVersion":1,"reason":"Incorrect closure approved for recovery"}'::jsonb)->'value'->>'status'='Returned','reopen');
SELECT pg_temp.assert_true(erp.command_reopen_rental('{"commandId":"UAT-C3C-REOPEN-RETRY","idempotencyKey":"UAT-C3C-IDEM-REOPEN","rentalId":"UAT-C3C-REOPEN","expectedVersion":1,"reason":"Incorrect closure approved for recovery"}'::jsonb)->>'disposition'='REPLAYED','replay');
SELECT pg_temp.assert_true(erp.command_reopen_rental('{"commandId":"UAT-C3C-REOPEN-MISMATCH","idempotencyKey":"UAT-C3C-IDEM-REOPEN","rentalId":"UAT-C3C-REOPEN","expectedVersion":1,"reason":"Different approved recovery reason"}'::jsonb)->>'code'='IDEMPOTENCY_MISMATCH','idempotency mismatch');
SELECT pg_temp.assert_true(erp.command_reopen_rental('{"commandId":"UAT-C3C-BLOCKED","idempotencyKey":"UAT-C3C-IDEM-BLOCKED","rentalId":"UAT-C3C-BLOCKED","expectedVersion":1,"reason":"Attempted unsafe downstream recovery"}'::jsonb)->>'code'='DOWNSTREAM_EVIDENCE_EXISTS','downstream block');
SELECT pg_temp.assert_true(erp.command_reverse_rental_return('{"commandId":"UAT-C3C-RETURN-STALE","idempotencyKey":"UAT-C3C-IDEM-RETURN-STALE","rentalId":"UAT-C3C-RETURN","expectedVersion":0,"reason":"Incorrect return approved for recovery"}'::jsonb)->>'code'='CONFLICT','stale version');
SELECT pg_temp.assert_true(erp.command_reverse_rental_return('{"commandId":"UAT-C3C-RETURN","idempotencyKey":"UAT-C3C-IDEM-RETURN","rentalId":"UAT-C3C-RETURN","expectedVersion":1,"reason":"Incorrect return approved for recovery"}'::jsonb)->'value'->>'status'='Active','reverse return');
SELECT pg_temp.assert_true(erp.command_void_billing_statement('{"commandId":"UAT-C3C-VOID","idempotencyKey":"UAT-C3C-IDEM-VOID","statementId":"UAT-C3C-STATEMENT-VOID","expectedVersion":2,"reason":"Incorrect billing statement approved for void"}'::jsonb)->'value'->>'status'='Cancelled','void statement');
SELECT pg_temp.assert_true(erp.command_release_deur_consumption('{"commandId":"UAT-C3C-RELEASE","idempotencyKey":"UAT-C3C-IDEM-RELEASE","statementId":"UAT-C3C-STATEMENT-VOID","deurId":"UAT-C3C-DEUR-A","expectedVersion":2,"reason":"Voided statement permits consumption release"}'::jsonb)->'value'->>'status'='Acknowledged','release DEUR');
SELECT pg_temp.assert_true(erp.command_cancel_invoice('{"commandId":"UAT-C3C-CANCEL-INVOICE","idempotencyKey":"UAT-C3C-IDEM-CANCEL-INVOICE","statementId":"UAT-C3C-STATEMENT-INVOICE","expectedVersion":1,"reason":"Incorrect invoice approved for cancellation"}'::jsonb)->'value'->>'status'='Cancelled','cancel invoice');
SELECT pg_temp.assert_true(erp.command_cancel_invoice('{"commandId":"UAT-C3C-CANCEL-COLLECTED","idempotencyKey":"UAT-C3C-IDEM-CANCEL-COLLECTED","statementId":"UAT-C3C-STATEMENT-BLOCK","expectedVersion":1,"reason":"Unsafe collected invoice cancellation attempt"}'::jsonb)->>'code'='DOWNSTREAM_EVIDENCE_EXISTS','collected invoice block');
SELECT pg_temp.assert_true(erp.command_reopen_rental('{"commandId":"UAT-C3C-CROSS","idempotencyKey":"UAT-C3C-IDEM-CROSS","rentalId":"UAT-C3C-CROSS","expectedVersion":1,"reason":"Cross company recovery must be rejected"}'::jsonb)->>'code'='NOT_FOUND','cross tenant');
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','74000000-0000-0000-0000-000000000002',true);
SELECT pg_temp.assert_true(erp.command_reopen_rental('{"commandId":"UAT-C3C-DENIED","idempotencyKey":"UAT-C3C-IDEM-DENIED","rentalId":"UAT-C3C-BLOCKED","expectedVersion":1,"reason":"Unauthorized recovery attempt rejected"}'::jsonb)->>'code'='FORBIDDEN','ordinary denied');
RESET ROLE;

SELECT pg_temp.assert_true(NOT has_function_privilege('anon','erp.command_reopen_rental(jsonb)','EXECUTE'),'anonymous denied');
SELECT pg_temp.assert_true((SELECT count(*) FROM erp.recovery_compensations WHERE company_id='TENANT-UAT-C3C-A')=5,'recovery ledger');
SELECT pg_temp.assert_true((SELECT count(*) FROM erp.audit_log WHERE correlation_id LIKE 'UAT-C3C-%')=5,'audit ledger');
SELECT pg_temp.assert_true((SELECT count(*) FROM erp.billing_statement_lines WHERE id='UAT-C3C-BILLING-LINE')=1,'line preserved');
SELECT pg_temp.assert_true((SELECT consumption_released_at IS NOT NULL FROM erp.billing_statement_lines WHERE id='UAT-C3C-BILLING-LINE'),'release metadata');
SELECT pg_temp.assert_true((SELECT NOT billing_locked AND billing_statement_id IS NULL AND status='Acknowledged' FROM erp.deurs WHERE id='UAT-C3C-DEUR-A'),'DEUR unlocked');

ROLLBACK;

SELECT 1/(CASE WHEN
  (SELECT count(*) FROM erp.companies WHERE id LIKE 'TENANT-UAT-C3C-%')=0 AND
  (SELECT count(*) FROM erp.recovery_compensations WHERE company_id LIKE 'TENANT-UAT-C3C-%')=0 AND
  (SELECT count(*) FROM erp.rentals WHERE id LIKE 'UAT-C3C-%')=0
THEN 1 ELSE 0 END);
