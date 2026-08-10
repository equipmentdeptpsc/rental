BEGIN;

SET search_path TO erp, pg_catalog;

CREATE OR REPLACE FUNCTION erp.reject_customer_review_evidence_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = erp, pg_catalog
AS $$
DECLARE
  database_owner name;
BEGIN
  SELECT pg_get_userbyid(datdba)
    INTO database_owner
    FROM pg_database
   WHERE datname = current_database();

  IF TG_OP = 'DELETE'
     AND session_user = database_owner
     AND current_user = database_owner
     AND (
       (current_setting('erp.c7_release_fixture_cleanup', true) = 'TENANT-UAT-C7-RELEASE-001'
         AND OLD.company_id = 'TENANT-UAT-C7-RELEASE-001')
       OR
       (current_setting('erp.c7_normalization_fixture_cleanup', true) = 'TENANT-UAT-C7-NORMALIZE-001'
         AND OLD.company_id = 'TENANT-UAT-C7-NORMALIZE-001')
       OR
       (current_setting('erp.c12_c4e_outcome_residue_cleanup', true) = 'TENANT-UAT-C4E-FINANCIAL'
         AND OLD.company_id = 'TENANT-UAT-C4E-FINANCIAL')
     ) THEN
    RETURN OLD;
  END IF;

  RAISE EXCEPTION 'customer review evidence is immutable'
    USING ERRCODE = '55000';
END;
$$;

CREATE FUNCTION erp.cleanup_c4e_customer_review_outcome_residue(
  target_tenant_id text,
  expected_tenant_code text,
  confirmation text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = erp, pg_catalog
AS $$
DECLARE
  database_owner name;
  matched_count integer;
  tenant_count integer;
  deleted_count integer;
  manifest_hashes constant text[] := ARRAY[
    'ae732757d889cd1001dbedee05ee3bc51c6390d00feb46c5679747c851772a64',
    'c5ae87030acfb93aead26afcc73d0ca691b04c5b753e8aeee2333a9a043cc2cd',
    '51161cf05c4d4721873a8d30159f116ce648c184fe98b875fd1a933d3173af1f',
    '285341944d1100f59ec272a1efe70e1d51e6aec751f163a27369bd48a31af2b6',
    'c4f166e2dd1f6ed9b4f5d3c274b6aeab51c0219b9d5a8b536ac8a4ee279f0e37',
    'cf1a74826c81734f1b45f16b9c0eaf3cf781b1e66641e7647e023ded0b39f0d0'
  ];
BEGIN
  IF target_tenant_id IS DISTINCT FROM 'TENANT-UAT-C4E-FINANCIAL'
     OR expected_tenant_code IS DISTINCT FROM 'TENANT-UAT-C4E-FINANCIAL'
     OR confirmation IS DISTINCT FROM 'CONFIRM-C4E-OUTCOME-RESIDUE-CLEANUP'
     OR target_tenant_id = 'TENANT-LOCAL-001' THEN
    RAISE EXCEPTION 'C4E outcome residue cleanup rejected: exact allowlist confirmation required'
      USING ERRCODE = '22023';
  END IF;

  SELECT pg_get_userbyid(datdba)
    INTO database_owner
    FROM pg_database
   WHERE datname = current_database();
  IF session_user <> database_owner OR current_user <> database_owner THEN
    RAISE EXCEPTION 'C4E outcome residue cleanup rejected: database-owner session required'
      USING ERRCODE = '42501';
  END IF;

  IF (SELECT count(*) FROM erp.companies
       WHERE id = 'TENANT-LOCAL-001'
         AND code = 'LOCAL'
         AND environment_class = 'compatibility') <> 1 THEN
    RAISE EXCEPTION 'C4E outcome residue cleanup rejected: protected local tenant invariant failed'
      USING ERRCODE = '55000';
  END IF;
  IF EXISTS (SELECT 1 FROM erp.companies WHERE environment_class = 'approved') THEN
    RAISE EXCEPTION 'C4E outcome residue cleanup rejected: approved environment detected'
      USING ERRCODE = '55000';
  END IF;

  SELECT count(*) INTO tenant_count
    FROM erp.customer_review_outcomes
   WHERE company_id = 'TENANT-UAT-C4E-FINANCIAL';
  SELECT count(*) INTO matched_count
    FROM erp.customer_review_outcomes
   WHERE company_id = 'TENANT-UAT-C4E-FINANCIAL'
     AND encode(extensions.digest(id::text, 'sha256'), 'hex') = ANY(manifest_hashes);

  IF matched_count NOT IN (0, 6) OR tenant_count <> matched_count THEN
    RAISE EXCEPTION 'C4E outcome residue cleanup rejected: certified six-row manifest mismatch'
      USING ERRCODE = '55000';
  END IF;

  IF matched_count = 6 AND (
    EXISTS (
      SELECT 1 FROM erp.customer_review_outcomes outcome
      JOIN erp.customer_review_requests request ON request.id = outcome.review_request_id
      WHERE outcome.company_id = 'TENANT-UAT-C4E-FINANCIAL'
        AND encode(extensions.digest(outcome.id::text, 'sha256'), 'hex') = ANY(manifest_hashes)
    )
    OR EXISTS (
      SELECT 1 FROM erp.customer_review_outcomes outcome
      JOIN erp.deurs deur ON deur.id = outcome.deur_id
      WHERE outcome.company_id = 'TENANT-UAT-C4E-FINANCIAL'
        AND encode(extensions.digest(outcome.id::text, 'sha256'), 'hex') = ANY(manifest_hashes)
    )
    OR EXISTS (
      SELECT 1 FROM erp.customer_review_outcomes outcome
      JOIN erp.rentals rental ON rental.id = outcome.rental_id
      WHERE outcome.company_id = 'TENANT-UAT-C4E-FINANCIAL'
        AND encode(extensions.digest(outcome.id::text, 'sha256'), 'hex') = ANY(manifest_hashes)
    )
    OR EXISTS (SELECT 1 FROM erp.companies WHERE id = 'TENANT-UAT-C4E-FINANCIAL')
    OR EXISTS (
      SELECT 1 FROM pg_constraint
       WHERE contype = 'f'
         AND confrelid = 'erp.customer_review_outcomes'::regclass
    )
  ) THEN
    RAISE EXCEPTION 'C4E outcome residue cleanup rejected: parent or retained reference exists'
      USING ERRCODE = '55000';
  END IF;

  PERFORM set_config(
    'erp.c12_c4e_outcome_residue_cleanup',
    'TENANT-UAT-C4E-FINANCIAL',
    true
  );

  DELETE FROM erp.customer_review_outcomes
   WHERE company_id = 'TENANT-UAT-C4E-FINANCIAL'
     AND encode(extensions.digest(id::text, 'sha256'), 'hex') = ANY(manifest_hashes);
  GET DIAGNOSTICS deleted_count = ROW_COUNT;

  IF deleted_count <> matched_count THEN
    RAISE EXCEPTION 'C4E outcome residue cleanup rejected: deletion count mismatch'
      USING ERRCODE = '55000';
  END IF;
  IF (SELECT count(*) FROM erp.companies
       WHERE id = 'TENANT-LOCAL-001'
         AND code = 'LOCAL'
         AND environment_class = 'compatibility') <> 1 THEN
    RAISE EXCEPTION 'C4E outcome residue cleanup rejected: protected local tenant postcondition failed'
      USING ERRCODE = '55000';
  END IF;

  RETURN jsonb_build_object('customer_review_outcomes', deleted_count);
END;
$$;

ALTER FUNCTION erp.reject_customer_review_evidence_change() OWNER TO postgres;
ALTER FUNCTION erp.cleanup_c4e_customer_review_outcome_residue(text, text, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.reject_customer_review_evidence_change()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION erp.cleanup_c4e_customer_review_outcome_residue(text, text, text)
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION erp.cleanup_c4e_customer_review_outcome_residue(text, text, text) IS
  'Owner-only exact cleanup for six certified orphan outcomes belonging to TENANT-UAT-C4E-FINANCIAL; returns aggregate counts only.';

COMMIT;
