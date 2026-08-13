BEGIN;
SET search_path = erp, auth, pg_catalog;

ALTER TABLE erp.users
  ADD CONSTRAINT users_company_id_id_unique UNIQUE (company_id, id);

CREATE TABLE erp.manager_review_recipient_configurations (
  company_id text PRIMARY KEY REFERENCES erp.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  active boolean NOT NULL DEFAULT true,
  configured_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  configured_by uuid REFERENCES erp.users(id) ON DELETE SET NULL,
  CONSTRAINT manager_review_recipient_same_company_user
    FOREIGN KEY (company_id, user_id)
    REFERENCES erp.users(company_id, id)
    ON DELETE CASCADE
);

ALTER TABLE erp.manager_review_recipient_configurations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE erp.manager_review_recipient_configurations
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION erp.configure_manager_review_recipient(target_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = erp, auth, pg_catalog
AS $$
DECLARE
  tenant text = erp.current_company_id();
  target erp.users;
BEGIN
  IF auth.uid() IS NULL OR tenant IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'UNAUTHENTICATED');
  END IF;
  IF NOT erp.current_user_has_permission('users.manage') THEN
    RETURN jsonb_build_object('success', false, 'code', 'FORBIDDEN');
  END IF;
  IF target_user_id IS NULL THEN
    DELETE FROM erp.manager_review_recipient_configurations
    WHERE company_id = tenant;
    RETURN jsonb_build_object('success', true, 'code', 'REMOVED');
  END IF;

  SELECT * INTO target FROM erp.users
  WHERE id = target_user_id AND company_id = tenant AND status = 'active';
  IF target.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'INVALID_MANAGER_REVIEWER');
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM erp.user_roles ur
    JOIN erp.role_permissions rp ON rp.role_id = ur.role_id
    JOIN erp.app_permissions permission ON permission.id = rp.permission_id
    WHERE ur.user_id = target.id AND permission.code = 'rental.approve'
  ) THEN
    RETURN jsonb_build_object('success', false, 'code', 'MANAGER_REVIEWER_NOT_CONFIGURED');
  END IF;
  IF target.email IS NULL
     OR target.email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
     OR target.email ~ E'[\\r\\n]' THEN
    RETURN jsonb_build_object('success', false, 'code', 'MANAGER_EMAIL_REQUIRED');
  END IF;

  INSERT INTO erp.manager_review_recipient_configurations(
    company_id, user_id, active, configured_at, configured_by
  ) VALUES (tenant, target.id, true, clock_timestamp(), auth.uid())
  ON CONFLICT (company_id) DO UPDATE SET
    user_id = EXCLUDED.user_id,
    active = true,
    configured_at = EXCLUDED.configured_at,
    configured_by = EXCLUDED.configured_by;

  RETURN jsonb_build_object('success', true, 'code', 'CONFIGURED', 'userId', target.id);
END;
$$;

CREATE OR REPLACE FUNCTION erp.resolve_manager_review_recipient(target_company_id text)
RETURNS TABLE(user_id uuid, display_name text, destination text, resolution_code text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = erp, auth, pg_catalog
AS $$
DECLARE
  designation erp.manager_review_recipient_configurations;
  candidate erp.users;
BEGIN
  IF auth.uid() IS NULL
     OR target_company_id IS NULL
     OR target_company_id IS DISTINCT FROM erp.current_company_id() THEN
    RETURN QUERY SELECT NULL::uuid, NULL::text, NULL::text,
      'MANAGER_REVIEWER_NOT_CONFIGURED'::text;
    RETURN;
  END IF;

  SELECT * INTO designation
  FROM erp.manager_review_recipient_configurations configuration
  WHERE configuration.company_id = target_company_id AND configuration.active = true;
  IF designation.company_id IS NULL THEN
    RETURN QUERY SELECT NULL::uuid, NULL::text, NULL::text,
      'MANAGER_REVIEWER_NOT_CONFIGURED'::text;
    RETURN;
  END IF;

  SELECT * INTO candidate FROM erp.users target
  WHERE target.id = designation.user_id
    AND target.company_id = target_company_id
    AND target.status = 'active';
  IF candidate.id IS NULL OR NOT EXISTS (
    SELECT 1
    FROM erp.user_roles ur
    JOIN erp.role_permissions rp ON rp.role_id = ur.role_id
    JOIN erp.app_permissions permission ON permission.id = rp.permission_id
    WHERE ur.user_id = candidate.id AND permission.code = 'rental.approve'
  ) THEN
    RETURN QUERY SELECT NULL::uuid, NULL::text, NULL::text,
      'MANAGER_REVIEWER_NOT_CONFIGURED'::text;
    RETURN;
  END IF;

  IF candidate.email IS NULL
     OR candidate.email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
     OR candidate.email ~ E'[\\r\\n]' THEN
    RETURN QUERY SELECT candidate.id, candidate.display_name, NULL::text,
      'MANAGER_EMAIL_REQUIRED'::text;
    RETURN;
  END IF;

  RETURN QUERY SELECT candidate.id, candidate.display_name,
    lower(btrim(candidate.email)), 'OK'::text;
END;
$$;

ALTER FUNCTION erp.configure_manager_review_recipient(uuid) OWNER TO postgres;
ALTER FUNCTION erp.resolve_manager_review_recipient(text) OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.configure_manager_review_recipient(uuid)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION erp.configure_manager_review_recipient(uuid) TO authenticated;
REVOKE ALL ON FUNCTION erp.resolve_manager_review_recipient(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION erp.resolve_manager_review_recipient(text) TO service_role;

COMMENT ON TABLE erp.manager_review_recipient_configurations IS
  'Tenant-scoped canonical Manager Review recipient designation; permission eligibility remains independently validated.';
COMMENT ON FUNCTION erp.configure_manager_review_recipient(uuid) IS
  'users.manage-only same-tenant designation command; NULL removes the designation; no caller email authority.';
COMMENT ON FUNCTION erp.resolve_manager_review_recipient(text) IS
  'Resolves only the configured active same-tenant user after rental.approve and canonical users.email validation.';

COMMIT;
