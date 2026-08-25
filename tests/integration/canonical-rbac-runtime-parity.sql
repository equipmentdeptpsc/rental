BEGIN;
SET LOCAL search_path=erp,auth,pg_catalog;

CREATE FUNCTION pg_temp.assert_true(value boolean,message text) RETURNS void
LANGUAGE plpgsql AS $$BEGIN IF value IS NOT TRUE THEN RAISE EXCEPTION '%',message;END IF;END$$;

SELECT pg_temp.assert_true(
  (SELECT array_agg(code ORDER BY code) FROM erp.app_roles WHERE catalog_version='2.0.0')=
  ARRAY['billing-staff','dispatcher','equipment-coordinator','maintenance-staff','management-viewer','operations-manager','operator','read-only-auditor','system-administrator'],
  'Catalog 2.0.0 role set is incomplete'
);
SELECT pg_temp.assert_true((SELECT active AND deprecated_at IS NULL FROM erp.app_roles WHERE code='operations-manager'),'Operations Manager must be active');
SELECT pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM erp.app_roles WHERE code='rental-operations'),'Clean Catalog 2.0 must not synthesize Rental Operations');
SELECT pg_temp.assert_true((SELECT count(*)=9 FROM erp.app_roles WHERE catalog_version='2.0.0'),'Clean Catalog 2.0 must contain exactly nine canonical roles');
SELECT pg_temp.assert_true((SELECT active AND deprecated_at IS NOT NULL AND catalog_version='legacy-compatibility' FROM erp.app_roles WHERE code='finance'),'Pre-existing Finance compatibility must be active and nonassignable');
SELECT pg_temp.assert_true((SELECT array_agg(code ORDER BY code) FROM erp.app_roles WHERE active AND deprecated_at IS NULL)=ARRAY['billing-staff','dispatcher','equipment-coordinator','maintenance-staff','management-viewer','operations-manager','operator','read-only-auditor','system-administrator'],'Clean assignable runtime role source must expose exactly nine canonical roles');
SELECT pg_temp.assert_true((SELECT count(*)=28 FROM erp.role_permissions rp JOIN erp.app_roles r ON r.id=rp.role_id JOIN erp.app_permissions p ON p.id=rp.permission_id WHERE r.code='operations-manager' AND p.catalog_version='2.0.0'),'Operations Manager must have 28 Catalog 2.0.0 permissions');
SELECT pg_temp.assert_true(EXISTS(SELECT 1 FROM erp.role_permissions rp JOIN erp.app_roles r ON r.id=rp.role_id JOIN erp.app_permissions p ON p.id=rp.permission_id WHERE r.code='operations-manager' AND p.code='rental.approval.decide'),'Operations Manager approval mapping is missing');
SELECT pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM erp.role_permissions rp JOIN erp.app_roles r ON r.id=rp.role_id JOIN erp.app_permissions p ON p.id=rp.permission_id WHERE r.code IN('finance','billing-staff') AND p.code='rental.approval.decide'),'Finance authority must not include Rental approval');
INSERT INTO erp.companies(id,code,name,active,environment_class) VALUES('TENANT-RBAC-INACTIVE','RBACI','RBAC Inactive Certification',true,'test');
INSERT INTO auth.users(id,email) VALUES('25000000-0000-4000-8000-000000000099','rbac.inactive@example.test');
INSERT INTO erp.users(id,username,display_name,email,status,company_id) VALUES('25000000-0000-4000-8000-000000000099','rbac.inactive','RBAC Inactive','rbac.inactive@example.test','active','TENANT-RBAC-INACTIVE');
INSERT INTO erp.app_roles(id,code,name,catalog_version,active) VALUES('ROLE-CERT-INACTIVE','certification-inactive','Certification Inactive','certification',false);
INSERT INTO erp.role_permissions(role_id,permission_id) SELECT 'ROLE-CERT-INACTIVE',id FROM erp.app_permissions WHERE code='rental.approval.decide';
INSERT INTO erp.user_roles(user_id,role_id) VALUES('25000000-0000-4000-8000-000000000099','ROLE-CERT-INACTIVE');
SELECT pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM erp.effective_user_permissions WHERE user_id='25000000-0000-4000-8000-000000000099'),'Inactive roles must not grant effective permissions');
SELECT pg_temp.assert_true(EXISTS(SELECT 1 FROM pg_proc function JOIN pg_namespace namespace ON namespace.oid=function.pronamespace WHERE namespace.nspname='erp' AND function.proname='current_user_has_permission'),'Current permission helper must remain installed');

ROLLBACK;
