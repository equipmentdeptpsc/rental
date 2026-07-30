BEGIN;
SET search_path TO erp, public;

-- PostgreSQL grants EXECUTE on new functions to PUBLIC by default. Remove that
-- implicit capability from every application-owned ERP function, and remove any
-- inherited/explicit anonymous access before rebuilding the approved RPC surface.
DO $$
DECLARE
  function_signature text;
BEGIN
  FOR function_signature IN
    SELECT p.oid::regprocedure::text
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'erp'
  LOOP
    EXECUTE format(
      'REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon',
      function_signature
    );
  END LOOP;
END $$;

-- Authenticated application command entry points. Their frozen permission checks
-- remain inside the SECURITY DEFINER command boundary.
GRANT EXECUTE ON FUNCTION
  command_start_deur_shift(jsonb),
  command_transition_deur_activity(jsonb),
  command_complete_deur_shift(jsonb),
  command_submit_deur(jsonb),
  command_create_customer_review_request(jsonb),
  command_create_deur_correction(jsonb),
  command_record_meter_checkpoint(jsonb),
  command_return_rental_line(jsonb),
  command_return_all_rental_lines(jsonb),
  get_rental_closure_readiness(jsonb),
  command_close_rental(jsonb)
TO authenticated;

-- These are the only anonymous RPCs. They expose token-scoped review responses;
-- raw tokens and internal identity/permission helpers remain inaccessible.
GRANT EXECUTE ON FUNCTION
  get_public_customer_review(jsonb),
  public_acknowledge_customer_review(jsonb),
  public_reject_customer_review(jsonb)
TO anon, authenticated;

DROP POLICY IF EXISTS user_roles_authenticated_read ON user_roles;
CREATE POLICY user_roles_authenticated_read
ON user_roles
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR (
    current_user_has_permission('users.manage')
    AND EXISTS (
      SELECT 1
      FROM users target_user
      WHERE target_user.id = user_roles.user_id
        AND target_user.company_id = current_company_id()
    )
  )
);

COMMENT ON POLICY user_roles_authenticated_read ON user_roles IS
  'Users may read their own role assignments; users.manage may read assignments only for active-user company scope.';
COMMENT ON POLICY permissions_authenticated_read ON app_permissions IS
  'Intentional global authenticated read of the frozen permission catalog.';
COMMENT ON POLICY roles_authenticated_read ON app_roles IS
  'Intentional global authenticated read of system role definitions.';
COMMENT ON POLICY role_permissions_authenticated_read ON role_permissions IS
  'Intentional global authenticated read of frozen role-to-permission reference mappings.';

COMMIT;
