BEGIN;
CREATE OR REPLACE FUNCTION pg_temp.assert_true(value boolean,message text) RETURNS void LANGUAGE plpgsql AS $$BEGIN IF value IS DISTINCT FROM true THEN RAISE EXCEPTION 'ASSERT: %',message;END IF;END$$;

INSERT INTO erp.companies(id,code,name,active,environment_class) VALUES
 ('TENANT-LIST-A','LISTA','List A',true,'test'),
 ('TENANT-LIST-B','LISTB','List B',true,'test');
INSERT INTO auth.users(id,email,encrypted_password,aud,role) VALUES
 ('25700000-0000-4000-8000-000000000001','admin@list.test','fixture','authenticated','authenticated'),
 ('25700000-0000-4000-8000-000000000002','ops1@list.test','fixture','authenticated','authenticated'),
 ('25700000-0000-4000-8000-000000000003','ops2@list.test','fixture','authenticated','authenticated'),
 ('25700000-0000-4000-8000-000000000004','finance@list.test','fixture','authenticated','authenticated'),
 ('25700000-0000-4000-8000-000000000005','billing@list.test','fixture','authenticated','authenticated'),
 ('25700000-0000-4000-8000-000000000006','inactive@list.test','fixture','authenticated','authenticated'),
 ('25700000-0000-4000-8000-000000000007','other@list.test','fixture','authenticated','authenticated');
INSERT INTO erp.users(id,username,display_name,email,status,company_id) VALUES
 ('25700000-0000-4000-8000-000000000001','admin.list','Admin','admin@list.test','active','TENANT-LIST-A'),
 ('25700000-0000-4000-8000-000000000002','ops1.list','Operations Manager One','ops1@list.test','active','TENANT-LIST-A'),
 ('25700000-0000-4000-8000-000000000003','ops2.list','Operations Manager Two','ops2@list.test','active','TENANT-LIST-A'),
 ('25700000-0000-4000-8000-000000000004','finance.list','Finance','finance@list.test','active','TENANT-LIST-A'),
 ('25700000-0000-4000-8000-000000000005','billing.list','Billing','billing@list.test','active','TENANT-LIST-A'),
 ('25700000-0000-4000-8000-000000000006','inactive.list','Inactive User','inactive@list.test','inactive','TENANT-LIST-A'),
 ('25700000-0000-4000-8000-000000000007','other.list','Other Tenant','other@list.test','active','TENANT-LIST-B');
INSERT INTO erp.user_roles(user_id,role_id,assigned_by)
SELECT value.user_id,role.id,'fixture' FROM (VALUES
 ('25700000-0000-4000-8000-000000000001'::uuid,'system-administrator'),
 ('25700000-0000-4000-8000-000000000002'::uuid,'operations-manager'),
 ('25700000-0000-4000-8000-000000000003'::uuid,'operations-manager'),
 ('25700000-0000-4000-8000-000000000004'::uuid,'finance'),
 ('25700000-0000-4000-8000-000000000005'::uuid,'billing-staff'),
 ('25700000-0000-4000-8000-000000000006'::uuid,'operations-manager'),
 ('25700000-0000-4000-8000-000000000007'::uuid,'operations-manager')
) value(user_id,role_code) JOIN erp.app_roles role ON role.code=value.role_code;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','25700000-0000-4000-8000-000000000001',true);
SELECT pg_temp.assert_true((SELECT count(*)=6 FROM erp.users WHERE company_id='TENANT-LIST-A'),'System Administrator sees every same-tenant user');
SELECT pg_temp.assert_true((SELECT count(*)=2 FROM erp.users WHERE id IN ('25700000-0000-4000-8000-000000000002','25700000-0000-4000-8000-000000000003')),'both Operations Managers visible');
SELECT pg_temp.assert_true(EXISTS(SELECT 1 FROM erp.users WHERE id='25700000-0000-4000-8000-000000000006' AND status='inactive'),'inactive user visible');
SELECT pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM erp.users WHERE id='25700000-0000-4000-8000-000000000007'),'cross-tenant user hidden');
SELECT pg_temp.assert_true((SELECT count(*)=6 FROM erp.user_roles WHERE user_id::text LIKE '25700000-0000-4000-8000-00000000000%'),'same-tenant role metadata visible');

SELECT set_config('request.jwt.claim.sub','25700000-0000-4000-8000-000000000002',true);
SELECT pg_temp.assert_true((SELECT array_agg(id ORDER BY id)=ARRAY['25700000-0000-4000-8000-000000000002'::uuid] FROM erp.users WHERE id::text LIKE '25700000-%'),'Operations Manager sees self only');
SELECT set_config('request.jwt.claim.sub','25700000-0000-4000-8000-000000000004',true);
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM erp.users WHERE id::text LIKE '25700000-%'),'Finance sees self only');
SELECT set_config('request.jwt.claim.sub','25700000-0000-4000-8000-000000000005',true);
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM erp.users WHERE id::text LIKE '25700000-%'),'Billing sees self only');

ROLLBACK;
