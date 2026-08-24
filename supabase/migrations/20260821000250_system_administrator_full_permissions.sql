BEGIN;

-- System Administrator is the unrestricted administrative role in the
-- application authorization model. Synchronize it with every canonical
-- permission already present in the permission catalogue.
--
-- This is additive only:
--   - no permissions are deleted
--   - no other roles are changed
--   - no users are reassigned
--   - future catalogue additions still require an explicit migration

INSERT INTO erp.role_permissions (
    role_id,
    permission_id
)
SELECT
    role.id,
    permission.id
FROM erp.app_roles AS role
CROSS JOIN erp.app_permissions AS permission
WHERE role.code = 'system-administrator'
ON CONFLICT (role_id, permission_id) DO NOTHING;

COMMIT;
