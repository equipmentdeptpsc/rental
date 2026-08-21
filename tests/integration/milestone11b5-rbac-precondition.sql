\set ON_ERROR_STOP on
INSERT INTO erp.app_permissions(id,code,name)
VALUES ('PERM-M11B5-REMOTE-BILLING-READ','billing.read','Read Billing')
ON CONFLICT (code) DO NOTHING;
INSERT INTO erp.app_roles(id,code,name)
VALUES ('ROLE-M11B5-REMOTE-RENTAL-OPERATIONS','rental-operations','Rental Operations')
ON CONFLICT (code) DO NOTHING;
INSERT INTO erp.role_permissions(role_id,permission_id)
SELECT role.id,permission.id FROM erp.app_roles role CROSS JOIN erp.app_permissions permission
WHERE role.code='rental-operations' AND permission.code='billing.read'
ON CONFLICT DO NOTHING;
CREATE TEMP TABLE m11b5_authority_before AS
SELECT role.code AS role_code,permission.code AS permission_code
FROM erp.role_permissions mapping
JOIN erp.app_roles role ON role.id=mapping.role_id
JOIN erp.app_permissions permission ON permission.id=mapping.permission_id;
