BEGIN;
SET search_path TO erp, public;

CREATE FUNCTION can_manage_target_user_role(target_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = erp, auth
AS $$
  SELECT auth.uid() IS NOT NULL
    AND target_user_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM users caller
      JOIN companies company
        ON company.id = caller.company_id
       AND company.active
      JOIN users target
        ON target.id = target_user_id
       AND target.company_id = caller.company_id
       AND target.status = 'active'
      WHERE caller.id = auth.uid()
        AND caller.status = 'active'
        AND EXISTS (
          SELECT 1
          FROM user_roles caller_role
          JOIN role_permissions role_permission
            ON role_permission.role_id = caller_role.role_id
          JOIN app_permissions permission
            ON permission.id = role_permission.permission_id
          WHERE caller_role.user_id = caller.id
            AND permission.code = 'users.manage'
        )
    )
$$;

REVOKE EXECUTE ON FUNCTION can_manage_target_user_role(uuid)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION can_manage_target_user_role(uuid)
TO authenticated;

DROP POLICY IF EXISTS user_roles_authenticated_read ON user_roles;
CREATE POLICY user_roles_authenticated_read
ON user_roles
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR can_manage_target_user_role(user_id)
);

COMMENT ON FUNCTION can_manage_target_user_role(uuid) IS
  'Boolean-only RLS helper: active users.manage caller may inspect an active target in the same active company.';
COMMENT ON POLICY user_roles_authenticated_read ON user_roles IS
  'Users read their own role assignments; same-active-company users.manage access is resolved by a scoped helper.';

COMMIT;
