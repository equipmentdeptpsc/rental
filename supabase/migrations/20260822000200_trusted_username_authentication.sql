BEGIN;
SET LOCAL search_path = erp, pg_catalog;

CREATE FUNCTION erp.resolve_active_application_user_login(identifier text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = erp, auth, pg_catalog
AS $$
DECLARE
  normalized_identifier text := lower(btrim(identifier));
  match_count integer;
  resolved_email text;
BEGIN
  IF normalized_identifier = '' OR length(normalized_identifier) > 120 THEN
    RETURN jsonb_build_object('success', false);
  END IF;

  SELECT count(*)::integer, min(lower(auth_user.email))
  INTO match_count, resolved_email
  FROM erp.users application_user
  JOIN erp.companies company
    ON company.id = application_user.company_id
   AND company.active
  JOIN auth.users auth_user
    ON auth_user.id = application_user.id
  WHERE application_user.status = 'active'
    AND lower(application_user.username) = normalized_identifier
    AND auth_user.email IS NOT NULL;

  IF match_count <> 1 THEN
    RETURN jsonb_build_object('success', false);
  END IF;

  RETURN jsonb_build_object('success', true, 'email', resolved_email);
END $$;

REVOKE ALL ON FUNCTION erp.resolve_active_application_user_login(text)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION erp.resolve_active_application_user_login(text)
TO service_role;

COMMIT;
