\set ON_ERROR_STOP on
BEGIN;
SET LOCAL search_path=erp,auth,pg_catalog;

CREATE TEMP TABLE legacy_role_baseline AS
SELECT code,id FROM erp.app_roles WHERE code IN('finance','system-administrator');
INSERT INTO erp.app_roles(id,code,name,active,catalog_version)
VALUES('ROLE-LEGACY-RENTAL-OPERATIONS','rental-operations','Rental Operations',true,'legacy')
ON CONFLICT(code) DO NOTHING;
INSERT INTO legacy_role_baseline VALUES('rental-operations',(SELECT id FROM erp.app_roles WHERE code='rental-operations'));

INSERT INTO erp.companies(id,code,name,active,environment_class) VALUES('TENANT-RBAC-LEGACY','RBACL','RBAC Legacy Certification',true,'test');
INSERT INTO auth.users(id,email) VALUES
 ('25000000-0000-4000-8000-000000000001','rbac.admin@example.test'),
 ('25000000-0000-4000-8000-000000000002','rbac.finance@example.test'),
 ('25000000-0000-4000-8000-000000000003','rbac.operations@example.test');
INSERT INTO erp.users(id,username,display_name,email,status,company_id) VALUES
 ('25000000-0000-4000-8000-000000000001','rbac.admin','RBAC Admin','rbac.admin@example.test','active','TENANT-RBAC-LEGACY'),
 ('25000000-0000-4000-8000-000000000002','rbac.finance','RBAC Finance','rbac.finance@example.test','active','TENANT-RBAC-LEGACY'),
 ('25000000-0000-4000-8000-000000000003','rbac.operations','RBAC Operations','rbac.operations@example.test','active','TENANT-RBAC-LEGACY');
INSERT INTO erp.user_roles(user_id,role_id)
SELECT '25000000-0000-4000-8000-000000000001'::uuid,id FROM erp.app_roles WHERE code='system-administrator'
UNION ALL SELECT '25000000-0000-4000-8000-000000000002'::uuid,id FROM erp.app_roles WHERE code='finance'
UNION ALL SELECT '25000000-0000-4000-8000-000000000003'::uuid,id FROM erp.app_roles WHERE code='rental-operations';
INSERT INTO erp.role_permissions(role_id,permission_id)
SELECT role.id,permission.id FROM erp.app_roles role CROSS JOIN erp.app_permissions permission
WHERE role.code='rental-operations' AND permission.code='assignment.manage'
ON CONFLICT DO NOTHING;
CREATE TEMP TABLE legacy_membership_baseline AS SELECT user_id,role_id FROM erp.user_roles WHERE user_id::text LIKE '25000000-0000-4000-8000-00000000000%';
CREATE TEMP TABLE legacy_permission_baseline AS SELECT role_id,permission_id FROM erp.role_permissions WHERE role_id=(SELECT id FROM erp.app_roles WHERE code='rental-operations');
COMMIT;

\ir ../../supabase/migrations/20260825000100_canonical_rbac_catalog_2_runtime_parity.sql

BEGIN;
CREATE FUNCTION pg_temp.assert_true(value boolean,message text) RETURNS void LANGUAGE plpgsql AS $$BEGIN IF value IS NOT TRUE THEN RAISE EXCEPTION '%',message;END IF;END$$;
SELECT pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM legacy_role_baseline baseline JOIN erp.app_roles role USING(code) WHERE baseline.id<>role.id),'Legacy role IDs must be preserved');
SELECT pg_temp.assert_true((SELECT count(*) FROM legacy_membership_baseline)=(SELECT count(*) FROM erp.user_roles current JOIN legacy_membership_baseline baseline USING(user_id,role_id)),'Legacy memberships must be preserved');
SELECT pg_temp.assert_true((SELECT count(*) FROM legacy_permission_baseline)=(SELECT count(*) FROM erp.role_permissions current JOIN legacy_permission_baseline baseline USING(role_id,permission_id)),'Rental Operations permissions must be preserved without broadening');
SELECT pg_temp.assert_true((SELECT count(*) FROM legacy_permission_baseline)=(SELECT count(*) FROM erp.role_permissions WHERE role_id=(SELECT id FROM erp.app_roles WHERE code='rental-operations')),'Rental Operations authority must not be broadened');
SELECT pg_temp.assert_true((SELECT active AND deprecated_at IS NOT NULL AND catalog_version='legacy-compatibility' FROM erp.app_roles WHERE code='rental-operations'),'Rental Operations must remain active deprecated compatibility');
SELECT pg_temp.assert_true((SELECT active AND deprecated_at IS NOT NULL AND catalog_version='legacy-compatibility' FROM erp.app_roles WHERE code='finance'),'Finance must remain active deprecated compatibility');
SELECT pg_temp.assert_true((SELECT count(*)=9 FROM erp.app_roles WHERE catalog_version='2.0.0'),'All nine canonical roles must exist');
SELECT pg_temp.assert_true((SELECT id FROM erp.app_roles WHERE code='operations-manager')<>(SELECT id FROM erp.app_roles WHERE code='rental-operations'),'Operations Manager must be distinct from Rental Operations');
SELECT pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM erp.user_roles WHERE user_id='25000000-0000-4000-8000-000000000003' AND role_id=(SELECT id FROM erp.app_roles WHERE code='operations-manager')),'Legacy users must not be migrated to Operations Manager');
SELECT pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM erp.role_permissions rp JOIN erp.app_roles r ON r.id=rp.role_id JOIN erp.app_permissions p ON p.id=rp.permission_id WHERE r.code='finance' AND p.code='rental.approval.decide'),'Finance must not gain Rental approval');
SELECT pg_temp.assert_true(EXISTS(SELECT 1 FROM erp.role_permissions rp JOIN erp.app_roles r ON r.id=rp.role_id JOIN erp.app_permissions p ON p.id=rp.permission_id WHERE r.code='system-administrator' AND p.code='work_description.create'),'System Administrator extension permissions must survive');
SELECT pg_temp.assert_true((SELECT array_agg(code ORDER BY code) FROM erp.app_roles WHERE active AND deprecated_at IS NULL)=ARRAY['billing-staff','dispatcher','equipment-coordinator','maintenance-staff','management-viewer','operations-manager','operator','read-only-auditor','system-administrator'],'Assignable runtime roles must exclude legacy compatibility roles');
ROLLBACK;
