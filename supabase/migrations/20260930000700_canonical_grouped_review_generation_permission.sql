BEGIN;
SET LOCAL search_path = erp, auth, pg_catalog;
-- Catalog 2.0 replaces the legacy combined deur.review permission with the
-- scoped customer-review issuance permission.  Keep the legacy check as the
-- scheduler compatibility path: the trusted scheduler principal is purposely
-- represented through that branch rather than a browser-user role.
DO $$
DECLARE
  definition text;
  legacy_gate constant text :=
    'IF NOT erp.current_user_has_permission(''deur.review'') THEN RETURN jsonb_build_object(''success'',false,''code'',''FORBIDDEN''); END IF;';
  canonical_gate constant text :=
    'IF NOT (erp.current_user_has_permission(''deur.customerReview.issue'') OR erp.current_user_has_permission(''deur.review'')) THEN RETURN jsonb_build_object(''success'',false,''code'',''FORBIDDEN''); END IF;';
BEGIN
  SELECT pg_get_functiondef('erp.command_generate_customer_review_batch(jsonb)'::regprocedure)
    INTO definition;

  IF definition NOT LIKE '%' || legacy_gate || '%' THEN
    RAISE EXCEPTION 'expected grouped-review legacy authorization gate was not found'
      USING ERRCODE = '55000';
  END IF;

  definition := replace(definition, legacy_gate, canonical_gate);
  IF definition NOT LIKE '%' || canonical_gate || '%' THEN
    RAISE EXCEPTION 'canonical grouped-review authorization gate replacement failed'
      USING ERRCODE = '55000';
  END IF;

  EXECUTE definition;
END $$;
ALTER FUNCTION erp.command_generate_customer_review_batch(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.command_generate_customer_review_batch(jsonb) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION erp.command_generate_customer_review_batch(jsonb) TO authenticated;
COMMENT ON FUNCTION erp.command_generate_customer_review_batch(jsonb) IS
  'Authenticated tenant-derived grouped generation. Browser callers require canonical deur.customerReview.issue; the trusted scheduler retains its bounded legacy compatibility branch. A raw credential is returned once for immediate trusted orchestration and is never persisted or logged.';
COMMIT;
