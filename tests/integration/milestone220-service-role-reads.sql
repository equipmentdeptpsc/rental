\set ON_ERROR_STOP on
BEGIN;
SET LOCAL search_path=erp,pg_catalog;
CREATE FUNCTION pg_temp.assert_true(value boolean,message text) RETURNS void LANGUAGE plpgsql AS $$BEGIN IF value IS NOT TRUE THEN RAISE EXCEPTION 'ASSERT: %',message;END IF;END$$;

INSERT INTO erp.companies(id,code,name) VALUES('TENANT-M220-READS','M220R','M220 service-role reads');
INSERT INTO auth.users(id,role,email) VALUES('22000000-0000-4000-8000-000000000150','authenticated','admin-reads@m220.test');
INSERT INTO erp.users(id,username,display_name,email,status,company_id) VALUES('22000000-0000-4000-8000-000000000150','admin-reads','Admin Reads','admin-reads@m220.test','active','TENANT-M220-READS');
INSERT INTO erp.user_roles(user_id,role_id) SELECT '22000000-0000-4000-8000-000000000150',id FROM erp.app_roles WHERE code='system-administrator';
INSERT INTO erp.operators(id,name,status,company_id) VALUES('M220-READS-OP','Reads Operator','Active','TENANT-M220-READS');

SELECT pg_temp.assert_true(has_schema_privilege('service_role','erp','USAGE'),'service_role schema usage');
SELECT pg_temp.assert_true(has_column_privilege('service_role','erp.users','id','SELECT') AND has_column_privilege('service_role','erp.users','company_id','SELECT') AND has_column_privilege('service_role','erp.users','status','SELECT') AND has_column_privilege('service_role','erp.users','operator_id','SELECT'),'users Worker columns');
SELECT pg_temp.assert_true(has_column_privilege('service_role','erp.effective_user_permissions','user_id','SELECT') AND has_column_privilege('service_role','erp.effective_user_permissions','permission_code','SELECT'),'permission Worker columns');
SELECT pg_temp.assert_true(has_column_privilege('service_role','erp.user_roles','user_id','SELECT') AND has_column_privilege('service_role','erp.user_roles','role_id','SELECT'),'permission view user-role columns');
SELECT pg_temp.assert_true(has_column_privilege('service_role','erp.app_roles','id','SELECT') AND has_column_privilege('service_role','erp.app_roles','code','SELECT'),'permission view and Worker role columns');
SELECT pg_temp.assert_true(has_column_privilege('service_role','erp.role_permissions','role_id','SELECT') AND has_column_privilege('service_role','erp.role_permissions','permission_id','SELECT'),'permission view role-permission columns');
SELECT pg_temp.assert_true(has_column_privilege('service_role','erp.app_permissions','id','SELECT') AND has_column_privilege('service_role','erp.app_permissions','code','SELECT'),'permission view permission columns');
SELECT pg_temp.assert_true(has_column_privilege('service_role','erp.operators','id','SELECT') AND has_column_privilege('service_role','erp.operators','company_id','SELECT') AND has_column_privilege('service_role','erp.operators','status','SELECT'),'operator Worker columns');
SELECT pg_temp.assert_true(NOT has_table_privilege('service_role','erp.user_provisioning_commands','SELECT'),'command table remains unreadable');
SELECT pg_temp.assert_true(has_function_privilege('service_role','erp.lookup_application_user_provisioning_command(jsonb)','EXECUTE') AND has_function_privilege('service_role','erp.command_provision_application_user(jsonb)','EXECUTE') AND has_function_privilege('service_role','erp.record_application_user_password_reset(jsonb)','EXECUTE'),'service_role RPC execute');
SELECT pg_temp.assert_true(NOT has_function_privilege('authenticated','erp.command_provision_application_user(jsonb)','EXECUTE') AND NOT has_function_privilege('anon','erp.command_provision_application_user(jsonb)','EXECUTE'),'browser RPC denied');

SET LOCAL ROLE service_role;
SELECT id,company_id,status FROM erp.users WHERE id='22000000-0000-4000-8000-000000000150';
SELECT permission_code FROM erp.effective_user_permissions WHERE user_id='22000000-0000-4000-8000-000000000150' AND permission_code='users.manage';
SELECT code FROM erp.app_roles WHERE code='system-administrator';
SELECT id FROM erp.operators WHERE id='M220-READS-OP' AND company_id='TENANT-M220-READS' AND status='Active';
DO $$BEGIN
  BEGIN
    PERFORM 1 FROM erp.user_provisioning_commands LIMIT 1;
    RAISE EXCEPTION 'ASSERT: service_role unexpectedly read user_provisioning_commands';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END$$;
SELECT pg_temp.assert_true((erp.lookup_application_user_provisioning_command('{"actorId":"22000000-0000-4000-8000-000000000150","companyId":"TENANT-M220-READS","idempotencyKey":"reads-check","username":"reads-user","displayName":"Reads User","email":"reads-user@m220.test","roleCodes":["finance"]}'::jsonb)->>'state')='NEW','provisioning lookup RPC succeeds');
RESET ROLE;

ROLLBACK;
SELECT 'MILESTONE_220_SERVICE_ROLE_READS_CERTIFICATION_PASS';
