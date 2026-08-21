BEGIN;
SET LOCAL search_path = erp, pg_catalog;

INSERT INTO erp.app_permissions(id, code, name)
VALUES
  ('PERM-M11B-BILLING-CREATE', 'billing.create', 'Create Billing Statements'),
  ('PERM-M11B-BILLING-UPDATE', 'billing.update', 'Update Billing Statements')
ON CONFLICT (code) DO NOTHING;

INSERT INTO erp.app_roles(id, code, name)
VALUES ('ROLE-M11B-FINANCE', 'finance', 'Finance')
ON CONFLICT (code) DO NOTHING;

INSERT INTO erp.role_permissions(role_id, permission_id)
SELECT role.id, permission.id
FROM erp.app_roles AS role
JOIN erp.app_permissions AS permission
  ON permission.code IN ('billing.read', 'billing.create', 'billing.update')
WHERE role.code IN ('finance', 'system-administrator')
ON CONFLICT (role_id, permission_id) DO NOTHING;

COMMIT;
