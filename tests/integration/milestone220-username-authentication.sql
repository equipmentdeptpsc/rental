\set ON_ERROR_STOP on
BEGIN;
SET LOCAL search_path=erp,pg_catalog;
CREATE FUNCTION pg_temp.assert_true(value boolean,message text) RETURNS void LANGUAGE plpgsql AS $$BEGIN IF value IS NOT TRUE THEN RAISE EXCEPTION 'ASSERT: %',message;END IF;END$$;

INSERT INTO erp.companies(id,code,name,active) VALUES
 ('TENANT-USERNAME-A','UNA','Username A',true),
 ('TENANT-USERNAME-B','UNB','Username B',true),
 ('TENANT-USERNAME-OFF','UNO','Username Off',false);
INSERT INTO auth.users(id,role,email) VALUES
 ('22000000-0000-4000-8000-000000000201','authenticated','unique-auth@example.test'),
 ('22000000-0000-4000-8000-000000000202','authenticated','ambiguous-a@example.test'),
 ('22000000-0000-4000-8000-000000000203','authenticated','ambiguous-b@example.test'),
 ('22000000-0000-4000-8000-000000000204','authenticated','inactive-user@example.test'),
 ('22000000-0000-4000-8000-000000000205','authenticated','inactive-company@example.test');
INSERT INTO erp.users(id,username,display_name,email,status,company_id) VALUES
 ('22000000-0000-4000-8000-000000000201','Finance.Unique','Finance Unique','erp-unique@example.test','active','TENANT-USERNAME-A'),
 ('22000000-0000-4000-8000-000000000202','shared.user','Shared A','ambiguous-a@example.test','active','TENANT-USERNAME-A'),
 ('22000000-0000-4000-8000-000000000203','SHARED.USER','Shared B','ambiguous-b@example.test','active','TENANT-USERNAME-B'),
 ('22000000-0000-4000-8000-000000000204','inactive.user','Inactive User','inactive-user@example.test','inactive','TENANT-USERNAME-A'),
 ('22000000-0000-4000-8000-000000000205','inactive.company','Inactive Company','inactive-company@example.test','active','TENANT-USERNAME-OFF');

SELECT pg_temp.assert_true(has_function_privilege('service_role','erp.resolve_active_application_user_login(text)','EXECUTE'),'service role execute');
SELECT pg_temp.assert_true(NOT has_function_privilege('authenticated','erp.resolve_active_application_user_login(text)','EXECUTE') AND NOT has_function_privilege('anon','erp.resolve_active_application_user_login(text)','EXECUTE'),'browser roles denied');
SELECT pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM aclexplode(coalesce((SELECT proacl FROM pg_proc WHERE oid='erp.resolve_active_application_user_login(text)'::regprocedure),acldefault('f',(SELECT proowner FROM pg_proc WHERE oid='erp.resolve_active_application_user_login(text)'::regprocedure)))) WHERE grantee=0 AND privilege_type='EXECUTE'),'PUBLIC denied');
SELECT pg_temp.assert_true(NOT has_column_privilege('service_role','erp.users','username','SELECT') AND NOT has_column_privilege('service_role','erp.users','email','SELECT'),'no direct identity column grant');

SET LOCAL ROLE service_role;
SELECT pg_temp.assert_true((erp.resolve_active_application_user_login(' finance.unique ')->>'email')='unique-auth@example.test','case-insensitive unique Auth email');
SELECT pg_temp.assert_true((erp.resolve_active_application_user_login('missing.user')->>'success')='false','zero match fails closed');
SELECT pg_temp.assert_true((erp.resolve_active_application_user_login('inactive.user')->>'success')='false','inactive user fails closed');
SELECT pg_temp.assert_true((erp.resolve_active_application_user_login('inactive.company')->>'success')='false','inactive company fails closed');
SELECT pg_temp.assert_true((erp.resolve_active_application_user_login('shared.user')->>'success')='false','ambiguous tenant match fails closed');
RESET ROLE;

SET LOCAL ROLE authenticated;
DO $$BEGIN
  BEGIN
    PERFORM erp.resolve_active_application_user_login('finance.unique');
    RAISE EXCEPTION 'ASSERT: authenticated unexpectedly executed resolver';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END$$;
RESET ROLE;
SET LOCAL ROLE anon;
DO $$BEGIN
  BEGIN
    PERFORM erp.resolve_active_application_user_login('finance.unique');
    RAISE EXCEPTION 'ASSERT: anon unexpectedly executed resolver';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END$$;
RESET ROLE;

ROLLBACK;
SELECT 'MILESTONE_220_USERNAME_AUTHENTICATION_CERTIFICATION_PASS';
