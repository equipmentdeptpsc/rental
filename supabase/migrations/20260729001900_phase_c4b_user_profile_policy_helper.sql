BEGIN;
SET search_path TO erp, auth;

CREATE FUNCTION can_read_target_user(target_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = erp, auth
AS $$
  SELECT auth.uid() IS NOT NULL
    AND target_user_id IS NOT NULL
    AND (
      target_user_id = auth.uid()
      OR EXISTS (
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
    )
$$;

REVOKE EXECUTE ON FUNCTION can_read_target_user(uuid)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION can_read_target_user(uuid)
TO authenticated;

DROP POLICY IF EXISTS tenant_read ON users;
CREATE POLICY users_authenticated_read
ON users
FOR SELECT
TO authenticated
USING (can_read_target_user(id));

COMMENT ON FUNCTION can_read_target_user(uuid) IS
  'Boolean-only RLS helper: callers read their own profile; active users.manage callers may read active users in the same active company.';
COMMENT ON POLICY users_authenticated_read ON users IS
  'Authenticated users read their own profile or same-active-company profiles authorized through users.manage.';

COMMIT;
