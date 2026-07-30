BEGIN;
CREATE FUNCTION pg_temp.assert_true(ok boolean, label text) RETURNS integer LANGUAGE plpgsql AS $$
BEGIN IF NOT coalesce(ok,false) THEN RAISE EXCEPTION 'C3B smoke assertion failed: %',label; END IF; RETURN 1; END $$;

INSERT INTO auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,email_change,email_change_token_new,recovery_token)
VALUES
('00000000-0000-0000-0000-000000000000','73000000-0000-0000-0000-000000000001','authenticated','authenticated','c3b-finance@invalid.local','',now(),'{}','{}',now(),now(),'','','',''),
('00000000-0000-0000-0000-000000000000','73000000-0000-0000-0000-000000000002','authenticated','authenticated','c3b-ordinary@invalid.local','',now(),'{}','{}',now(),now(),'','','','');
INSERT INTO erp.companies(id,code,name,environment_class) VALUES
('TENANT-UAT-C3B-A','TENANT-UAT-C3B-A','C3B A','test'),('TENANT-UAT-C3B-B','TENANT-UAT-C3B-B','C3B B','test');
INSERT INTO erp.users(id,username,display_name,status,company_id) VALUES
('73000000-0000-0000-0000-000000000001','c3b-finance','C3B Finance','active','TENANT-UAT-C3B-A'),
('73000000-0000-0000-0000-000000000002','c3b-ordinary','C3B Ordinary','active','TENANT-UAT-C3B-A');
INSERT INTO erp.app_roles(id,code,name) VALUES ('ROLE-UAT-C3B-FINANCE','c3b-finance','C3B Finance');
INSERT INTO erp.app_permissions(id,code,name) VALUES
('PERM-UAT-C3B-CREATE','billing.create','Billing Create'),('PERM-UAT-C3B-UPDATE','billing.update','Billing Update');
INSERT INTO erp.role_permissions VALUES
('ROLE-UAT-C3B-FINANCE','PERM-UAT-C3B-CREATE'),('ROLE-UAT-C3B-FINANCE','PERM-UAT-C3B-UPDATE');
INSERT INTO erp.user_roles(user_id,role_id) VALUES ('73000000-0000-0000-0000-000000000001','ROLE-UAT-C3B-FINANCE');
INSERT INTO erp.customers(id,customer_code,name,company_id) VALUES
('UAT-C3B-CUSTOMER-A','UAT-C3B-CUST-A','Customer A','TENANT-UAT-C3B-A'),
('UAT-C3B-CUSTOMER-B','UAT-C3B-CUST-B','Customer B','TENANT-UAT-C3B-B');
INSERT INTO erp.projects(id,project_code,name,customer_id,company_id) VALUES
('UAT-C3B-PROJECT-A','UAT-C3B-PROJ-A','Project A','UAT-C3B-CUSTOMER-A','TENANT-UAT-C3B-A'),
('UAT-C3B-PROJECT-B','UAT-C3B-PROJ-B','Project B','UAT-C3B-CUSTOMER-B','TENANT-UAT-C3B-B');
INSERT INTO erp.operators(id,name,status,company_id) VALUES
('UAT-C3B-OP-A','Operator A','Active','TENANT-UAT-C3B-A'),('UAT-C3B-OP-B','Operator B','Active','TENANT-UAT-C3B-B');
INSERT INTO erp.equipment(id,asset_no,equipment_name,maintenance_type,company_id) VALUES
('UAT-C3B-EQ-A','UAT-C3B-EQ-A','Equipment A','None','TENANT-UAT-C3B-A'),
('UAT-C3B-EQ-B','UAT-C3B-EQ-B','Equipment B','None','TENANT-UAT-C3B-B');
INSERT INTO erp.rentals(id,rental_number,customer_id,project_id,customer_snapshot,project_snapshot,date_out,rental_type,status,company_id) VALUES
('UAT-C3B-RENTAL-A','UAT-C3B-R-A','UAT-C3B-CUSTOMER-A','UAT-C3B-PROJECT-A','Customer A','Project A','2026-07-29','Operated Rental','Returned','TENANT-UAT-C3B-A'),
('UAT-C3B-RENTAL-B','UAT-C3B-R-B','UAT-C3B-CUSTOMER-B','UAT-C3B-PROJECT-B','Customer B','Project B','2026-07-29','Operated Rental','Returned','TENANT-UAT-C3B-B');
INSERT INTO erp.rental_equipment_lines(id,rental_id,equipment_id,operator_id,status,company_id) VALUES
('UAT-C3B-LINE-A','UAT-C3B-RENTAL-A','UAT-C3B-EQ-A','UAT-C3B-OP-A','Returned','TENANT-UAT-C3B-A'),
('UAT-C3B-LINE-B','UAT-C3B-RENTAL-B','UAT-C3B-EQ-B','UAT-C3B-OP-B','Returned','TENANT-UAT-C3B-B');
INSERT INTO erp.commercial_snapshots(id,rental_id,rental_equipment_line_id,billing_method,unit_rate,minimum_billable_hours,standby_rate,
  mobilization_fee,demobilization_fee,fuel_charge,operator_included,operator_rate,tax_rate,withholding_tax,currency,captured_at)
VALUES
('UAT-C3B-SNAPSHOT-A','UAT-C3B-RENTAL-A','UAT-C3B-LINE-A','Per Hour',100,3,10,25,25,5,false,50,12,2,'PHP',now()),
('UAT-C3B-SNAPSHOT-B','UAT-C3B-RENTAL-B','UAT-C3B-LINE-B','Per Hour',100,1,0,0,0,0,true,0,0,0,'PHP',now());
INSERT INTO erp.deurs(id,deur_number,rental_id,rental_equipment_line_id,equipment_id,operator_id,project_id,customer_id,commercial_snapshot_id,
  work_date,status,evidence_mode,billing_method_snapshot,total_operating_minutes,total_idle_minutes,company_id)
VALUES
('UAT-C3B-DEUR-A','UAT-C3B-DEUR-A','UAT-C3B-RENTAL-A','UAT-C3B-LINE-A','UAT-C3B-EQ-A','UAT-C3B-OP-A','UAT-C3B-PROJECT-A','UAT-C3B-CUSTOMER-A','UAT-C3B-SNAPSHOT-A','2026-07-29','Acknowledged','TIME_TIMELINE','Per Hour',120,60,'TENANT-UAT-C3B-A'),
('UAT-C3B-DEUR-B','UAT-C3B-DEUR-B','UAT-C3B-RENTAL-B','UAT-C3B-LINE-B','UAT-C3B-EQ-B','UAT-C3B-OP-B','UAT-C3B-PROJECT-B','UAT-C3B-CUSTOMER-B','UAT-C3B-SNAPSHOT-B','2026-07-29','Acknowledged','TIME_TIMELINE','Per Hour',60,0,'TENANT-UAT-C3B-B');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','73000000-0000-0000-0000-000000000001',true);
SELECT pg_temp.assert_true((erp.command_generate_billing_evidence('{"commandId":"UAT-C3B-EVIDENCE","idempotencyKey":"UAT-C3B-IDEM-EVIDENCE","deurId":"UAT-C3B-DEUR-A"}'::jsonb)->'value'->>'hours')::numeric=3,'minimum hours');
RESET ROLE;
INSERT INTO erp.billing_statements(id,statement_no,rental_id,customer_snapshot,project_snapshot,billing_from,billing_to,currency,subtotal,vat,withholding_tax,grand_total,approval_status,invoice_status,created_by,updated_by,company_id)
VALUES('UAT-C3B-DIAGNOSTIC',erp.next_billing_statement_number(),'UAT-C3B-RENTAL-A','Customer A','Project A','2026-07-28','2026-07-28','PHP',0,0,0,0,'Draft','Not Invoiced','73000000-0000-0000-0000-000000000001','73000000-0000-0000-0000-000000000001','TENANT-UAT-C3B-A');
DELETE FROM erp.billing_statements WHERE id='UAT-C3B-DIAGNOSTIC';
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true((erp.command_create_billing_statement('{"commandId":"UAT-C3B-STATEMENT","idempotencyKey":"UAT-C3B-IDEM-STATEMENT","statementId":"UAT-C3B-STATEMENT-A","rentalId":"UAT-C3B-RENTAL-A","billingFrom":"2026-07-29","billingTo":"2026-07-29"}'::jsonb)->>'success')::boolean,'statement create');
SELECT pg_temp.assert_true(erp.command_consume_deur('{"commandId":"UAT-C3B-CONSUME-STALE","idempotencyKey":"UAT-C3B-IDEM-CONSUME-STALE","statementId":"UAT-C3B-STATEMENT-A","deurId":"UAT-C3B-DEUR-A","lineId":"UAT-C3B-BILLING-LINE-STALE","expectedVersion":0}'::jsonb)->>'code'='CONFLICT','optimistic concurrency');
SELECT pg_temp.assert_true((erp.command_consume_deur('{"commandId":"UAT-C3B-CONSUME","idempotencyKey":"UAT-C3B-IDEM-CONSUME","statementId":"UAT-C3B-STATEMENT-A","deurId":"UAT-C3B-DEUR-A","lineId":"UAT-C3B-BILLING-LINE-A","expectedVersion":1}'::jsonb)->>'success')::boolean,'consume');
SELECT pg_temp.assert_true(erp.command_consume_deur('{"commandId":"UAT-C3B-CONSUME-REPLAY","idempotencyKey":"UAT-C3B-IDEM-CONSUME","statementId":"UAT-C3B-STATEMENT-A","deurId":"UAT-C3B-DEUR-A","lineId":"UAT-C3B-BILLING-LINE-A","expectedVersion":1}'::jsonb)->>'disposition'='REPLAYED','replay');
SELECT pg_temp.assert_true(erp.command_consume_deur('{"commandId":"UAT-C3B-CONSUME-DUP","idempotencyKey":"UAT-C3B-IDEM-CONSUME-DUP","statementId":"UAT-C3B-STATEMENT-A","deurId":"UAT-C3B-DEUR-A","lineId":"UAT-C3B-BILLING-LINE-B","expectedVersion":2}'::jsonb)->>'code'='DUPLICATE_CONSUMPTION','duplicate');
SELECT pg_temp.assert_true(erp.command_finalize_billing_statement('{"commandId":"UAT-C3B-FINALIZE","idempotencyKey":"UAT-C3B-IDEM-FINALIZE","statementId":"UAT-C3B-STATEMENT-A","expectedVersion":2}'::jsonb)->'value'->>'approvalStatus'='Approved','finalize');
SELECT pg_temp.assert_true(erp.command_create_invoice('{"commandId":"UAT-C3B-INVOICE","idempotencyKey":"UAT-C3B-IDEM-INVOICE","statementId":"UAT-C3B-STATEMENT-A","expectedVersion":3}'::jsonb)->'value'->>'invoiceStatus'='Invoiced','invoice create');
SELECT pg_temp.assert_true(erp.command_update_invoice('{"commandId":"UAT-C3B-INVOICE-UPDATE","idempotencyKey":"UAT-C3B-IDEM-INVOICE-UPDATE","statementId":"UAT-C3B-STATEMENT-A","invoiceStatus":"Fully Collected","expectedVersion":4}'::jsonb)->'value'->>'invoiceStatus'='Fully Collected','invoice update');
SELECT pg_temp.assert_true(erp.command_generate_billing_evidence('{"commandId":"UAT-C3B-CROSS","idempotencyKey":"UAT-C3B-IDEM-CROSS","deurId":"UAT-C3B-DEUR-B"}'::jsonb)->>'code'='NOT_FOUND','cross tenant');
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','73000000-0000-0000-0000-000000000002',true);
SELECT pg_temp.assert_true(erp.command_create_billing_statement('{"commandId":"UAT-C3B-DENIED","idempotencyKey":"UAT-C3B-IDEM-DENIED","statementId":"UAT-C3B-DENIED","rentalId":"UAT-C3B-RENTAL-A","billingFrom":"2026-07-01","billingTo":"2026-07-02"}'::jsonb)->>'code'='FORBIDDEN','ordinary denied');
RESET ROLE;

SELECT pg_temp.assert_true(NOT has_function_privilege('anon','erp.command_create_billing_statement(jsonb)','EXECUTE'),'anonymous denied');
SELECT pg_temp.assert_true((SELECT count(*) FROM erp.billing_statement_lines WHERE deur_id='UAT-C3B-DEUR-A')=1,'one billing line');
SELECT pg_temp.assert_true((SELECT count(*) FROM erp.audit_log WHERE aggregate_id='UAT-C3B-STATEMENT-A')=5,'audit count');

ROLLBACK;

SELECT 1/(CASE WHEN
  (SELECT count(*) FROM erp.companies WHERE id LIKE 'TENANT-UAT-C3B-%')=0 AND
  (SELECT count(*) FROM erp.billing_statements WHERE id LIKE 'UAT-C3B-%')=0 AND
  (SELECT count(*) FROM erp.deurs WHERE id LIKE 'UAT-C3B-%')=0
THEN 1 ELSE 0 END);
