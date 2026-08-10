BEGIN;

SET search_path TO erp, pg_catalog;

CREATE FUNCTION erp.enforce_customer_review_company_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = erp, pg_catalog
AS $$
DECLARE
  canonical_company_name text;
BEGIN
  SELECT btrim(company.name)
  INTO canonical_company_name
  FROM erp.companies company
  WHERE company.id = NEW.company_id
    AND company.active
    AND nullif(btrim(company.name), '') IS NOT NULL;

  IF canonical_company_name IS NULL THEN
    RAISE EXCEPTION 'CANONICAL_COMPANY_REQUIRED' USING ERRCODE = '22023';
  END IF;

  NEW.snapshot = jsonb_set(
    coalesce(NEW.snapshot, '{}'::jsonb),
    '{companyName}',
    to_jsonb(canonical_company_name),
    true
  );
  RETURN NEW;
END;
$$;

ALTER FUNCTION erp.enforce_customer_review_company_snapshot() OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.enforce_customer_review_company_snapshot()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS customer_review_company_snapshot
  ON erp.customer_review_requests;
CREATE TRIGGER customer_review_company_snapshot
BEFORE INSERT ON erp.customer_review_requests
FOR EACH ROW
EXECUTE FUNCTION erp.enforce_customer_review_company_snapshot();

COMMENT ON FUNCTION erp.enforce_customer_review_company_snapshot() IS
  'Freezes the active canonical tenant company display name into new immutable customer-review snapshots.';

COMMIT;
