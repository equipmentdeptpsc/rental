BEGIN;
SET search_path TO erp, public;

-- Preserve the established projection and authenticated SELECT contract while
-- making direct reads execute with the caller's privileges and user_roles RLS.
ALTER VIEW effective_user_permissions
  SET (security_invoker = true);
REVOKE SELECT ON effective_user_permissions FROM PUBLIC, anon;

-- Internal authorization continues to resolve only the current JWT subject.
-- As a SECURITY DEFINER owned by postgres, this path remains available to command
-- functions without exposing an arbitrary-user permission RPC.
CREATE OR REPLACE FUNCTION current_user_has_permission(required_permission text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = erp, auth
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM effective_user_permissions permission
    WHERE permission.user_id = auth.uid()
      AND permission.permission_code = required_permission
  )
$$;

REVOKE EXECUTE ON FUNCTION current_user_has_permission(text)
FROM PUBLIC, anon, authenticated;

COMMENT ON VIEW effective_user_permissions IS
  'Security-invoker projection: direct authenticated reads are constrained by user_roles RLS.';
COMMENT ON FUNCTION current_user_has_permission(text) IS
  'Internal current-JWT permission check; no arbitrary target user can be supplied.';

COMMIT;
