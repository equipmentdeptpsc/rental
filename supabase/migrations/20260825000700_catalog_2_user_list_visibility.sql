BEGIN;
SET LOCAL search_path = erp, auth, pg_catalog;

CREATE OR REPLACE FUNCTION erp.can_read_target_user(target_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = erp, auth, pg_catalog
AS $$
  SELECT auth.uid() IS NOT NULL
    AND target_user_id IS NOT NULL
    AND (
      target_user_id = auth.uid()
      OR EXISTS (
        SELECT 1
        FROM erp.users caller
        JOIN erp.companies company
          ON company.id = caller.company_id
         AND company.active
        JOIN erp.users target
          ON target.id = target_user_id
         AND target.company_id = caller.company_id
        WHERE caller.id = auth.uid()
          AND caller.status = 'active'
          AND EXISTS (
            SELECT 1
            FROM erp.user_roles caller_role
            JOIN erp.role_permissions role_permission
              ON role_permission.role_id = caller_role.role_id
            JOIN erp.app_permissions permission
              ON permission.id = role_permission.permission_id
             AND permission.active
            WHERE caller_role.user_id = caller.id
              AND permission.code = 'users.read'
          )
      )
    )
$$;

CREATE OR REPLACE FUNCTION erp.can_manage_target_user_role(target_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = erp, auth, pg_catalog
AS $$
  SELECT auth.uid() IS NOT NULL
    AND target_user_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM erp.users caller
      JOIN erp.companies company
        ON company.id = caller.company_id
       AND company.active
      JOIN erp.users target
        ON target.id = target_user_id
       AND target.company_id = caller.company_id
      WHERE caller.id = auth.uid()
        AND caller.status = 'active'
        AND EXISTS (
          SELECT 1
          FROM erp.user_roles caller_role
          JOIN erp.role_permissions role_permission
            ON role_permission.role_id = caller_role.role_id
          JOIN erp.app_permissions permission
            ON permission.id = role_permission.permission_id
           AND permission.active
          WHERE caller_role.user_id = caller.id
            AND permission.code = 'users.read'
        )
    )
$$;

DROP POLICY IF EXISTS self_or_unlinked_user_administrator ON erp.users;
DROP POLICY IF EXISTS users_authenticated_read ON erp.users;
CREATE POLICY users_authenticated_read
ON erp.users FOR SELECT TO authenticated
USING (erp.can_read_target_user(id));

DO $$
BEGIN
  -- Clean replay applies the P9 catalog policies and helpers. Historical UAT
  -- retained its intentionally authenticated-readable catalog policies and did
  -- not execute those P9 helper definitions, so no catalog rewrite is needed.
  IF to_regprocedure('erp.current_linked_operator_id()') IS NOT NULL
     AND to_regprocedure('erp.current_user_has_any_read_permission(text[])') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM pg_policy policy
       JOIN pg_class relation ON relation.oid=policy.polrelid
       JOIN pg_namespace namespace ON namespace.oid=relation.relnamespace
       WHERE namespace.nspname='erp' AND relation.relname='app_roles'
         AND policy.polname='unlinked_authorization_administrator_read'
     ) THEN
    DROP POLICY unlinked_authorization_administrator_read ON erp.app_roles;
    EXECUTE $policy$
      CREATE POLICY catalog_2_authorization_administrator_read
      ON erp.app_roles FOR SELECT TO authenticated
      USING (
        erp.current_linked_operator_id() IS NULL
        AND erp.current_user_has_any_read_permission(ARRAY['users.read','roles.read'])
      )
    $policy$;

    DROP POLICY unlinked_authorization_administrator_read ON erp.app_permissions;
    EXECUTE $policy$
      CREATE POLICY catalog_2_authorization_administrator_read
      ON erp.app_permissions FOR SELECT TO authenticated
      USING (
        erp.current_linked_operator_id() IS NULL
        AND erp.current_user_has_any_read_permission(ARRAY['users.read','permissions.catalog.read'])
      )
    $policy$;

    DROP POLICY unlinked_authorization_administrator_read ON erp.role_permissions;
    EXECUTE $policy$
      CREATE POLICY catalog_2_authorization_administrator_read
      ON erp.role_permissions FOR SELECT TO authenticated
      USING (
        erp.current_linked_operator_id() IS NULL
        AND erp.current_user_has_any_read_permission(ARRAY['users.read','roles.read'])
      )
    $policy$;
  END IF;
END
$$;

COMMENT ON FUNCTION erp.can_read_target_user(uuid) IS
  'Catalog 2.0 RLS helper: callers read themselves; active users.read callers may read same-active-company application users, including inactive administration targets.';
COMMENT ON FUNCTION erp.can_manage_target_user_role(uuid) IS
  'Catalog 2.0 RLS helper: active users.read callers may read role assignments for same-active-company administration targets, including inactive users.';
COMMENT ON POLICY users_authenticated_read ON erp.users IS
  'Authenticated users read themselves; Catalog 2.0 users.read grants same-active-company administration visibility.';

COMMIT;
