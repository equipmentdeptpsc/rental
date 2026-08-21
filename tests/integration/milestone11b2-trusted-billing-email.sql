\set ON_ERROR_STOP on

CREATE OR REPLACE FUNCTION pg_temp.assert_true(condition boolean, message text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF condition IS NOT TRUE THEN RAISE EXCEPTION 'ASSERTION FAILED: %', message; END IF;
END $$;

INSERT INTO erp.companies(id,code,name,active) VALUES
  ('M11B2-A','M11B2-A','Company A',true),('M11B2-B','M11B2-B','Company B',true);

INSERT INTO auth.users(id,role,email) VALUES
  ('10000000-0000-4000-8000-000000000001','authenticated','finance-a@example.test'),
  ('10000000-0000-4000-8000-000000000002','authenticated','admin-a@example.test'),
  ('10000000-0000-4000-8000-000000000003','authenticated','operator-a@example.test'),
  ('10000000-0000-4000-8000-000000000004','authenticated','operations-a@example.test'),
  ('10000000-0000-4000-8000-000000000005','authenticated','inactive-a@example.test'),
  ('20000000-0000-4000-8000-000000000001','authenticated','finance-b@example.test');
INSERT INTO erp.users(id,username,display_name,status,company_id,email) VALUES
  ('10000000-0000-4000-8000-000000000001','finance-a','Finance A','active','M11B2-A','finance-a@example.test'),
  ('10000000-0000-4000-8000-000000000002','admin-a','Administrator A','active','M11B2-A','admin-a@example.test'),
  ('10000000-0000-4000-8000-000000000003','operator-a','Operator A','active','M11B2-A','operator-a@example.test'),
  ('10000000-0000-4000-8000-000000000004','operations-a','Rental Operations A','active','M11B2-A','operations-a@example.test'),
  ('10000000-0000-4000-8000-000000000005','inactive-a','Inactive A','inactive','M11B2-A','inactive-a@example.test'),
  ('20000000-0000-4000-8000-000000000001','finance-b','Finance B','active','M11B2-B','finance-b@example.test');

INSERT INTO erp.app_permissions(id,code,name) VALUES
  ('M11B2-P-BILLING-READ','billing.read','Read billing'),
  ('M11B2-P-BILLING-CREATE','billing.create','Create billing'),
  ('M11B2-P-BILLING-UPDATE','billing.update','Update billing')
ON CONFLICT (code) DO NOTHING;
INSERT INTO erp.app_roles(id,code,name) VALUES
  ('M11B2-R-FINANCE','finance','Finance'),
  ('M11B2-R-OPERATOR','operator','Operator'),
  ('M11B2-R-OPERATIONS','rental-operations','Rental Operations')
ON CONFLICT (code) DO NOTHING;
INSERT INTO erp.role_permissions(role_id,permission_id)
SELECT role.id,permission.id FROM (VALUES
  ('finance','billing.read'),('finance','billing.create'),('finance','billing.update'),
  ('system-administrator','billing.read'),('system-administrator','billing.create'),('system-administrator','billing.update'),
  ('rental-operations','billing.read')
) AS grant_matrix(role_code,permission_code)
JOIN erp.app_roles role ON role.code=grant_matrix.role_code
JOIN erp.app_permissions permission ON permission.code=grant_matrix.permission_code
ON CONFLICT DO NOTHING;
INSERT INTO erp.user_roles(user_id,role_id)
SELECT assignment.user_id::uuid,role.id FROM (VALUES
  ('10000000-0000-4000-8000-000000000001','finance'),
  ('10000000-0000-4000-8000-000000000002','system-administrator'),
  ('10000000-0000-4000-8000-000000000003','operator'),
  ('10000000-0000-4000-8000-000000000004','rental-operations'),
  ('10000000-0000-4000-8000-000000000005','finance'),
  ('20000000-0000-4000-8000-000000000001','finance')
) AS assignment(user_id,role_code) JOIN erp.app_roles role ON role.code=assignment.role_code;

INSERT INTO erp.customers(id,name,company_id) VALUES
  ('M11B2-CUSTOMER-A','Customer A','M11B2-A'),('M11B2-CUSTOMER-B','Customer B','M11B2-B');
INSERT INTO erp.rentals(id,rental_number,customer_id,customer_snapshot,project_snapshot,date_out,status,company_id,customer_review_name_snapshot,customer_review_email_snapshot) VALUES
  ('M11B2-RENTAL-A','R-A','M11B2-CUSTOMER-A','Customer A','Project A','2026-08-01','Active','M11B2-A','Accounts Payable','accounts-a@example.test'),
  ('M11B2-RENTAL-NOEMAIL','R-NOEMAIL','M11B2-CUSTOMER-A','Customer A','Project A','2026-08-01','Active','M11B2-A',NULL,NULL),
  ('M11B2-RENTAL-B','R-B','M11B2-CUSTOMER-B','Customer B','Project B','2026-08-01','Active','M11B2-B','Accounts B','accounts-b@example.test');
INSERT INTO erp.billing_statements(id,statement_no,rental_id,customer_snapshot,project_snapshot,billing_from,billing_to,subtotal,grand_total,approval_status,invoice_status,created_by,row_version,company_id) VALUES
  ('M11B2-STMT-A','BS-A','M11B2-RENTAL-A','Customer A','Project A','2026-08-01','2026-08-21',100,100,'Approved','Not Invoiced','seed',3,'M11B2-A'),
  ('M11B2-STMT-DRAFT','BS-DRAFT','M11B2-RENTAL-A','Customer A','Project A','2026-07-01','2026-07-15',100,100,'Draft','Not Invoiced','seed',1,'M11B2-A'),
  ('M11B2-STMT-REJECTED','BS-REJECTED','M11B2-RENTAL-A','Customer A','Project A','2026-07-16','2026-07-31',100,100,'Rejected','Not Invoiced','seed',1,'M11B2-A'),
  ('M11B2-STMT-NOEMAIL','BS-NOEMAIL','M11B2-RENTAL-NOEMAIL','Customer A','Project A','2026-08-01','2026-08-21',100,100,'Approved','Not Invoiced','seed',1,'M11B2-A'),
  ('M11B2-STMT-B','BS-B','M11B2-RENTAL-B','Customer B','Project B','2026-08-01','2026-08-21',100,100,'Approved','Not Invoiced','seed',1,'M11B2-B');

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',false),set_config('request.jwt.claim.role','authenticated',false);
SELECT pg_temp.assert_true((erp.command_send_billing_statement_email('{"statementId":"M11B2-STMT-A","commandId":"30000000-0000-4000-8000-000000000001","idempotencyKey":"m11b2-a","expectedVersion":3}'::jsonb)->>'success')::boolean,'Finance must enqueue');
SELECT pg_temp.assert_true(erp.command_send_billing_statement_email('{"statementId":"M11B2-STMT-A","commandId":"30000000-0000-4000-8000-000000000001","idempotencyKey":"m11b2-a","expectedVersion":3}'::jsonb)->>'disposition'='REPLAYED','matching replay must return the existing logical notification');
SELECT pg_temp.assert_true(erp.command_send_billing_statement_email('{"statementId":"M11B2-STMT-DRAFT","commandId":"30000000-0000-4000-8000-000000000002","idempotencyKey":"m11b2-draft","expectedVersion":1}'::jsonb)->>'code'='INVALID_TRANSITION','Draft must be rejected');
SELECT pg_temp.assert_true(erp.command_send_billing_statement_email('{"statementId":"M11B2-STMT-REJECTED","commandId":"30000000-0000-4000-8000-000000000003","idempotencyKey":"m11b2-rejected","expectedVersion":1}'::jsonb)->>'code'='INVALID_TRANSITION','Rejected must be rejected');
SELECT pg_temp.assert_true(erp.command_send_billing_statement_email('{"statementId":"M11B2-STMT-A","commandId":"30000000-0000-4000-8000-000000000004","idempotencyKey":"m11b2-version","expectedVersion":2}'::jsonb)->>'code'='CONFLICT','stale version must conflict');
SELECT pg_temp.assert_true(erp.command_send_billing_statement_email('{"statementId":"M11B2-STMT-NOEMAIL","commandId":"30000000-0000-4000-8000-000000000005","idempotencyKey":"m11b2-noemail","expectedVersion":1}'::jsonb)->>'code'='CUSTOMER_EMAIL_MISSING','missing canonical email must reject');
SELECT pg_temp.assert_true(erp.command_send_billing_statement_email('{"statementId":"M11B2-STMT-A","commandId":"30000000-0000-4000-8000-000000000006","idempotencyKey":"m11b2-malicious","expectedVersion":3,"companyId":"M11B2-B","recipient":"attacker@example.test","total":1,"pdf":"evil"}'::jsonb)->>'code'='VALIDATION_REJECTED','extra authority properties must reject');
SELECT pg_temp.assert_true(erp.command_send_billing_statement_email('{"statementId":"M11B2-STMT-B","commandId":"30000000-0000-4000-8000-000000000007","idempotencyKey":"m11b2-cross","expectedVersion":1}'::jsonb)->>'code'='NOT_FOUND','cross-tenant statement must be unavailable');
SELECT pg_temp.assert_true(erp.command_send_billing_statement_email('{"statementId":"missing","commandId":"30000000-0000-4000-8000-000000000008","idempotencyKey":"m11b2-missing","expectedVersion":1}'::jsonb)->>'code'='NOT_FOUND','missing statement must be indistinguishable');

SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',false);
SELECT pg_temp.assert_true((erp.command_send_billing_statement_email('{"statementId":"M11B2-STMT-A","commandId":"30000000-0000-4000-8000-000000000009","idempotencyKey":"m11b2-admin","expectedVersion":3}'::jsonb)->>'success')::boolean,'System Administrator must enqueue under configured authority');
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',false);
SELECT pg_temp.assert_true(erp.command_send_billing_statement_email('{"statementId":"M11B2-STMT-A","commandId":"30000000-0000-4000-8000-000000000010","idempotencyKey":"m11b2-operator","expectedVersion":3}'::jsonb)->>'code'='FORBIDDEN','Operator must be denied');
SELECT pg_temp.assert_true(erp.get_billing_statement_email_status('M11B2-STMT-A')->>'code'='FORBIDDEN','Operator status read must be denied');
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000004',false);
SELECT pg_temp.assert_true(erp.command_send_billing_statement_email('{"statementId":"M11B2-STMT-A","commandId":"30000000-0000-4000-8000-000000000011","idempotencyKey":"m11b2-operations","expectedVersion":3}'::jsonb)->>'code'='FORBIDDEN','Rental Operations without billing.update must be denied');
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000005',false);
SELECT pg_temp.assert_true(erp.command_send_billing_statement_email('{"statementId":"M11B2-STMT-A","commandId":"30000000-0000-4000-8000-000000000012","idempotencyKey":"m11b2-inactive","expectedVersion":3}'::jsonb)->>'code'='UNAUTHENTICATED','Inactive user must be denied');
SELECT set_config('request.jwt.claim.sub','',false);
SELECT pg_temp.assert_true(erp.command_send_billing_statement_email('{"statementId":"M11B2-STMT-A","commandId":"30000000-0000-4000-8000-000000000013","idempotencyKey":"m11b2-anon","expectedVersion":3}'::jsonb)->>'code'='UNAUTHENTICATED','Unauthenticated caller must be denied');
RESET ROLE;

SELECT pg_temp.assert_true((SELECT count(*)=1 FROM erp.notification_outbox WHERE company_id='M11B2-A' AND idempotency_key='m11b2-a'),'idempotency must create one row');
SELECT pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM erp.notification_outbox WHERE idempotency_key='m11b2-noemail'),'missing email must not create outbox evidence');
SELECT pg_temp.assert_true((SELECT notification_type='BILLING_STATEMENT_EMAIL' AND source_aggregate_id='M11B2-STMT-A' AND rental_id='M11B2-RENTAL-A' AND customer_id='M11B2-CUSTOMER-A' AND initiating_actor_id='10000000-0000-4000-8000-000000000001' AND correlation_id='30000000-0000-4000-8000-000000000001' AND source_version=3 AND status='Pending' AND template_payload->>'sourceVersion'='3' FROM erp.notification_outbox WHERE idempotency_key='m11b2-a'),'outbox authority evidence must be complete');
SELECT pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM erp.notification_outbox n WHERE n::text ~* '(pdf|service.role|resend|access.token|password|credential)'),'outbox must contain no secret or PDF material');

SELECT pg_temp.assert_true((erp.claim_notification_delivery((SELECT id FROM erp.notification_outbox WHERE idempotency_key='m11b2-a'),'40000000-0000-4000-8000-000000000001')->>'success')::boolean,'first worker must claim');
SELECT pg_temp.assert_true(NOT (erp.claim_notification_delivery((SELECT id FROM erp.notification_outbox WHERE idempotency_key='m11b2-a'),'40000000-0000-4000-8000-000000000002')->>'success')::boolean,'second worker must not claim');
SELECT pg_temp.assert_true((erp.complete_billing_statement_email_delivery(jsonb_build_object('id',(SELECT id FROM erp.notification_outbox WHERE idempotency_key='m11b2-a'),'workerId','40000000-0000-4000-8000-000000000001','status','ProviderAccepted','providerName','fake','providerMessageId','fake-provider-1','uatOverrideApplied',true))->>'success')::boolean,'provider acceptance must complete');
SELECT pg_temp.assert_true(EXISTS(SELECT 1 FROM erp.audit_log WHERE action='BILLING_STATEMENT_EMAIL_SENT' AND aggregate_id='M11B2-STMT-A' AND actor_id='10000000-0000-4000-8000-000000000001' AND correlation_id='30000000-0000-4000-8000-000000000001' AND new_values->>'providerMessageId'='fake-provider-1' AND new_values->>'uatOverrideApplied'='true'),'sent audit evidence must be complete');
SELECT pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM erp.audit_log a WHERE a::text ~* '(pdf|service.role|resend.api|access.token|password|credential)'),'audit must contain no secret or PDF material');

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',false);
SELECT pg_temp.assert_true(erp.get_billing_statement_email_status('M11B2-STMT-A')#>>'{value,status}'='Pending','Finance status read must expose the latest safe status');
SELECT pg_temp.assert_true(erp.get_billing_statement_email_status('M11B2-STMT-B')#>'{value}'='null'::jsonb,'cross-tenant status must be empty');
RESET ROLE;

SELECT pg_temp.assert_true(has_function_privilege('authenticated','erp.command_send_billing_statement_email(jsonb)','EXECUTE'),'authenticated command grant required');
SELECT pg_temp.assert_true(NOT has_function_privilege('anon','erp.command_send_billing_statement_email(jsonb)','EXECUTE'),'anon command grant forbidden');
SELECT pg_temp.assert_true(NOT has_function_privilege('authenticated','erp.complete_billing_statement_email_delivery(jsonb)','EXECUTE'),'browser completion grant forbidden');
SELECT pg_temp.assert_true(has_function_privilege('service_role','erp.complete_billing_statement_email_delivery(jsonb)','EXECUTE'),'service completion grant required');

SELECT 'MILESTONE_11B2_DATABASE_CERTIFICATION_PASS' AS result;
