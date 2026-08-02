BEGIN;
SET LOCAL search_path=erp,auth,pg_catalog;

CREATE FUNCTION pg_temp.assert_true(value boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF value IS DISTINCT FROM true THEN RAISE EXCEPTION 'C7.3.1 probe failed: %',label; END IF; END $$;

INSERT INTO auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,email_change,email_change_token_new,recovery_token) VALUES
('00000000-0000-0000-0000-000000000000','7a310000-0000-0000-0000-000000000001','authenticated','authenticated','c73-rel-authorized@example.invalid','',now(),'{}','{}',now(),now(),'','','',''),
('00000000-0000-0000-0000-000000000000','7a310000-0000-0000-0000-000000000002','authenticated','authenticated','c73-rel-ordinary@example.invalid','',now(),'{}','{}',now(),now(),'','','','');
INSERT INTO companies(id,code,name,environment_class) VALUES
('TENANT-UAT-C7-REL-A','TENANT-UAT-C7-REL-A','C7 Release A','test'),
('TENANT-UAT-C7-REL-B','TENANT-UAT-C7-REL-B','C7 Release B','test');
INSERT INTO users(id,username,display_name,status,company_id) VALUES
('7a310000-0000-0000-0000-000000000001','c73-rel-authorized','C7 Authorized','active','TENANT-UAT-C7-REL-A'),
('7a310000-0000-0000-0000-000000000002','c73-rel-ordinary','C7 Ordinary','active','TENANT-UAT-C7-REL-A');
INSERT INTO app_roles(id,code,name) VALUES('ROLE-UAT-C7-REL','c7-release-certifier','C7 Release Certifier');
INSERT INTO role_permissions(role_id,permission_id)
SELECT 'ROLE-UAT-C7-REL',id FROM app_permissions WHERE code='rental.release';
SELECT pg_temp.assert_true((SELECT count(*) FROM role_permissions WHERE role_id='ROLE-UAT-C7-REL')=1,'frozen release permission');
INSERT INTO user_roles(user_id,role_id) VALUES('7a310000-0000-0000-0000-000000000001','ROLE-UAT-C7-REL');
INSERT INTO customers(id,customer_code,name,company_id) VALUES
('CUST-UAT-C7-REL-A','C7-REL-A','Customer A','TENANT-UAT-C7-REL-A'),('CUST-UAT-C7-REL-B','C7-REL-B','Customer B','TENANT-UAT-C7-REL-B');
INSERT INTO projects(id,project_code,name,customer_id,company_id) VALUES
('PRJ-UAT-C7-REL-A','C7-REL-A','Project A','CUST-UAT-C7-REL-A','TENANT-UAT-C7-REL-A'),
('PRJ-UAT-C7-REL-B','C7-REL-B','Project B','CUST-UAT-C7-REL-B','TENANT-UAT-C7-REL-B');
INSERT INTO rentals(id,rental_number,customer_id,project_id,customer_snapshot,project_snapshot,date_out,rental_type,status,company_id) VALUES
('RENT-UAT-C7-REL-A','C7-REL-A','CUST-UAT-C7-REL-A','PRJ-UAT-C7-REL-A','Customer A','Project A','2026-08-02','Operated Rental','Reserved','TENANT-UAT-C7-REL-A'),
('RENT-UAT-C7-REL-B','C7-REL-B','CUST-UAT-C7-REL-B','PRJ-UAT-C7-REL-B','Customer B','Project B','2026-08-02','Operated Rental','Reserved','TENANT-UAT-C7-REL-B');

SELECT pg_temp.assert_true(NOT has_function_privilege('anon','erp.rental_release_readiness(text)','EXECUTE'),'anonymous execute denied');
SELECT pg_temp.assert_true(NOT has_function_privilege('anon','erp.command_release_rental(jsonb)','EXECUTE'),'anonymous release denied');

SELECT set_config('request.jwt.claim.sub','',true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true(erp.rental_release_readiness('RENT-UAT-C7-REL-A')->'reasonCodes'='["UNAUTHENTICATED"]'::jsonb,'unauthenticated denied');
RESET ROLE;

SELECT set_config('request.jwt.claim.sub','7a310000-0000-0000-0000-000000000002',true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true(erp.rental_release_readiness('RENT-UAT-C7-REL-A')->'reasonCodes'='["FORBIDDEN"]'::jsonb,'ordinary same-company forbidden');
RESET ROLE;

SELECT set_config('request.jwt.claim.sub','7a310000-0000-0000-0000-000000000001',true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true(erp.rental_release_readiness('RENT-UAT-C7-REL-A')->'reasonCodes'='["RELEASE_NOT_READY"]'::jsonb,'authorized same-company readiness');
SELECT pg_temp.assert_true(erp.rental_release_readiness('RENT-UAT-C7-REL-B')->'reasonCodes'='["NOT_FOUND"]'::jsonb,'cross-company concealed');
SELECT pg_temp.assert_true((SELECT count(*) FROM rentals WHERE id='RENT-UAT-C7-REL-A')=1,'same-company direct read');
SELECT pg_temp.assert_true((SELECT count(*) FROM rentals WHERE id='RENT-UAT-C7-REL-B')=0,'cross-company direct read concealed');
SELECT pg_temp.assert_true(NOT has_table_privilege('authenticated','erp.commercial_snapshots','SELECT'),'private snapshot direct read denied');
RESET ROLE;

ROLLBACK;

SELECT 1/(CASE WHEN
  (SELECT count(*) FROM auth.users WHERE email LIKE 'c73-rel-%@example.invalid')=0 AND
  (SELECT count(*) FROM erp.companies WHERE id IN ('TENANT-UAT-C7-REL-A','TENANT-UAT-C7-REL-B'))=0 AND
  (SELECT count(*) FROM erp.rentals WHERE id IN ('RENT-UAT-C7-REL-A','RENT-UAT-C7-REL-B'))=0
THEN 1 ELSE 0 END) AS zero_residue;
