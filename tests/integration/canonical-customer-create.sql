\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION pg_temp.assert_true(value boolean,message text) RETURNS void LANGUAGE plpgsql AS $$BEGIN IF value IS NOT TRUE THEN RAISE EXCEPTION 'ASSERT: %',message;END IF;END$$;
INSERT INTO erp.companies(id,code,name,active,environment_class) VALUES ('TENANT-CUSTOMER-A','CUSTA','Customer A',true,'test'),('TENANT-CUSTOMER-B','CUSTB','Customer B',true,'test');
INSERT INTO auth.users(id,email) VALUES ('60000000-0000-4000-8000-000000000001','customer.admin@example.test'),('60000000-0000-4000-8000-000000000002','customer.ops@example.test'),('60000000-0000-4000-8000-000000000003','customer.admin.b@example.test');
INSERT INTO erp.users(id,username,display_name,email,status,company_id) VALUES
 ('60000000-0000-4000-8000-000000000001','customer.admin','Customer Admin','customer.admin@example.test','active','TENANT-CUSTOMER-A'),
 ('60000000-0000-4000-8000-000000000002','customer.ops','Customer Ops','customer.ops@example.test','active','TENANT-CUSTOMER-A'),
 ('60000000-0000-4000-8000-000000000003','customer.admin.b','Customer Admin B','customer.admin.b@example.test','active','TENANT-CUSTOMER-B');
INSERT INTO erp.user_roles(user_id,role_id) SELECT u.id,r.id FROM (VALUES ('60000000-0000-4000-8000-000000000001'::uuid,'system-administrator'),('60000000-0000-4000-8000-000000000002'::uuid,'rental-operations'),('60000000-0000-4000-8000-000000000003'::uuid,'system-administrator')) u(id,role_code) JOIN erp.app_roles r ON r.code=u.role_code;
SELECT set_config('request.jwt.claim.sub','60000000-0000-4000-8000-000000000001',true);
CREATE TEMP TABLE accepted AS SELECT erp.command_create_customer('{"commandId":"customer-ok","idempotencyKey":"customer-ok","customerId":"61000000-0000-4000-8000-000000000001","customerCode":" UAT-CUST-001 ","name":" UAT Customer 001 ","email":"uat@example.test","phone":"555","address":"Site"}'::jsonb) value;
SELECT pg_temp.assert_true((SELECT value->>'success'='true' AND value->>'disposition'='ACCEPTED' FROM accepted),'accepted');
SELECT pg_temp.assert_true((SELECT customer_code='UAT-CUST-001' AND name='UAT Customer 001' AND active AND deleted_at IS NULL AND row_version=1 AND company_id='TENANT-CUSTOMER-A' AND created_by='60000000-0000-4000-8000-000000000001' FROM erp.customers WHERE id='61000000-0000-4000-8000-000000000001'),'canonical persistence');
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM erp.audit_log WHERE aggregate_id='61000000-0000-4000-8000-000000000001' AND action='CUSTOMER_CREATED' AND company_id='TENANT-CUSTOMER-A'),'audit once');
SELECT pg_temp.assert_true((erp.command_create_customer('{"commandId":"customer-ok","idempotencyKey":"customer-ok","customerId":"61000000-0000-4000-8000-000000000001","customerCode":" UAT-CUST-001 ","name":" UAT Customer 001 ","email":"uat@example.test","phone":"555","address":"Site"}'::jsonb)->>'disposition')='REPLAYED','replay');
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM erp.operational_command_idempotency WHERE command_type='CREATE_CUSTOMER' AND target_aggregate_id='61000000-0000-4000-8000-000000000001' AND command_status='COMPLETED'),'command once');
SELECT pg_temp.assert_true((erp.command_create_customer('{"commandId":"changed","idempotencyKey":"customer-ok","customerId":"61000000-0000-4000-8000-000000000009","customerCode":"CHANGED","name":"Changed"}'::jsonb)->>'code')='IDEMPOTENCY_MISMATCH','mismatch');
SELECT pg_temp.assert_true((erp.command_create_customer('{"commandId":"code-dup","idempotencyKey":"code-dup","customerId":"61000000-0000-4000-8000-000000000002","customerCode":"uat-cust-001","name":"Other"}'::jsonb)->>'code')='CUSTOMER_CODE_CONFLICT','normalized code conflict');
SELECT pg_temp.assert_true((erp.command_create_customer('{"commandId":"id-dup","idempotencyKey":"id-dup","customerId":"61000000-0000-4000-8000-000000000001","customerCode":"OTHER","name":"Other"}'::jsonb)->>'code')='CUSTOMER_ID_CONFLICT','id conflict');
SELECT pg_temp.assert_true((erp.command_create_customer('{"commandId":"unknown","idempotencyKey":"unknown","customerId":"61000000-0000-4000-8000-000000000003","customerCode":"X","name":"X","companyId":"TENANT-CUSTOMER-B"}'::jsonb)->>'code')='VALIDATION_REJECTED','authority spoof');
SELECT pg_temp.assert_true((erp.command_create_customer('{"commandId":"bad","idempotencyKey":"bad","customerId":"bad","customerCode":" ","name":" "}'::jsonb)->>'code')='VALIDATION_REJECTED','validation');
SELECT set_config('request.jwt.claim.sub','60000000-0000-4000-8000-000000000002',true);
SELECT pg_temp.assert_true((erp.command_create_customer('{"commandId":"deny","idempotencyKey":"deny","customerId":"61000000-0000-4000-8000-000000000004","customerCode":"DENY","name":"Deny"}'::jsonb)->>'code')='FORBIDDEN','unauthorized role');
SELECT set_config('request.jwt.claim.sub','60000000-0000-4000-8000-000000000003',true);
SELECT pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM erp.customers WHERE id='61000000-0000-4000-8000-000000000001' AND company_id=erp.current_company_id()),'tenant isolation');
SELECT set_config('request.jwt.claim.sub','60000000-0000-4000-8000-000000000001',true);
CREATE FUNCTION pg_temp.fail_customer_audit() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN IF NEW.correlation_id='audit-fail' THEN RAISE EXCEPTION 'forced';END IF;RETURN NEW;END$$;
CREATE TRIGGER cert_fail_customer_audit BEFORE INSERT ON erp.audit_log FOR EACH ROW EXECUTE FUNCTION pg_temp.fail_customer_audit();
SELECT pg_temp.assert_true((erp.command_create_customer('{"commandId":"audit-fail","idempotencyKey":"audit-fail","customerId":"61000000-0000-4000-8000-000000000005","customerCode":"FAIL","name":"Fail"}'::jsonb)->>'code')='PERSISTENCE_FAILURE','controlled rollback');
DROP TRIGGER cert_fail_customer_audit ON erp.audit_log;
SELECT pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM erp.customers WHERE id='61000000-0000-4000-8000-000000000005') AND NOT EXISTS(SELECT 1 FROM erp.operational_command_idempotency WHERE idempotency_key='audit-fail'),'atomic rollback');
SELECT pg_temp.assert_true(has_function_privilege('authenticated','erp.command_create_customer(jsonb)','EXECUTE') AND NOT has_function_privilege('anon','erp.command_create_customer(jsonb)','EXECUTE') AND NOT has_function_privilege('service_role','erp.command_create_customer(jsonb)','EXECUTE'),'RPC grants');
SELECT pg_temp.assert_true(NOT has_table_privilege('authenticated','erp.customers','INSERT') AND NOT has_table_privilege('authenticated','erp.customers','UPDATE') AND NOT has_table_privilege('authenticated','erp.customers','DELETE'),'direct DML denied');
ROLLBACK;
SELECT 'CANONICAL_CUSTOMER_DATABASE_SEQUENTIAL_CERTIFICATION_PASS';
