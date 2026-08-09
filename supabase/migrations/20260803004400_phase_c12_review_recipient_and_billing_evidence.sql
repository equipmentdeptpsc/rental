BEGIN;

SET search_path TO erp, auth, pg_catalog;

ALTER TABLE erp.users
  ADD COLUMN IF NOT EXISTS email text;

ALTER TABLE erp.users
  DROP CONSTRAINT IF EXISTS users_email_format;
ALTER TABLE erp.users
  ADD CONSTRAINT users_email_format CHECK (
    email IS NULL OR (
      length(email) BETWEEN 3 AND 254
      AND email = lower(btrim(email))
      AND email !~ E'[\\r\\n]'
      AND email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    )
  );

ALTER TABLE erp.rentals
  ADD COLUMN IF NOT EXISTS customer_review_name_snapshot text,
  ADD COLUMN IF NOT EXISTS customer_review_email_snapshot text,
  ADD COLUMN IF NOT EXISTS customer_review_contact_captured_at timestamptz;

ALTER TABLE erp.rentals
  DROP CONSTRAINT IF EXISTS rentals_customer_review_email_format;
ALTER TABLE erp.rentals
  ADD CONSTRAINT rentals_customer_review_email_format CHECK (
    customer_review_email_snapshot IS NULL OR (
      customer_review_name_snapshot IS NOT NULL
      AND length(customer_review_email_snapshot) BETWEEN 3 AND 254
      AND customer_review_email_snapshot = lower(btrim(customer_review_email_snapshot))
      AND customer_review_email_snapshot !~ E'[\\r\\n]'
      AND customer_review_email_snapshot ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    )
  );

ALTER TABLE erp.billing_statement_lines
  ADD COLUMN IF NOT EXISTS charge_breakdown jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE erp.billing_statement_lines
  DROP CONSTRAINT IF EXISTS billing_statement_lines_charge_breakdown_shape;
ALTER TABLE erp.billing_statement_lines
  ADD CONSTRAINT billing_statement_lines_charge_breakdown_shape CHECK (
    jsonb_typeof(charge_breakdown) = 'array'
  );

CREATE OR REPLACE FUNCTION erp.resolve_manager_review_recipient(target_company_id text)
RETURNS TABLE(user_id uuid, display_name text, destination text, resolution_code text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = erp, auth, pg_catalog
AS $$
DECLARE
  candidate_count integer;
BEGIN
  IF auth.uid() IS NULL OR target_company_id IS NULL OR target_company_id IS DISTINCT FROM erp.current_company_id() THEN
    RETURN QUERY SELECT NULL::uuid,NULL::text,NULL::text,'MANAGER_REVIEWER_NOT_CONFIGURED'::text;
    RETURN;
  END IF;

  SELECT count(*) INTO candidate_count
  FROM erp.users candidate
  WHERE candidate.company_id=target_company_id AND candidate.status='active'
    AND EXISTS (
      SELECT 1 FROM erp.user_roles ur
      JOIN erp.role_permissions rp ON rp.role_id=ur.role_id
      JOIN erp.app_permissions permission ON permission.id=rp.permission_id
      WHERE ur.user_id=candidate.id AND permission.code='rental.approve'
    );

  IF candidate_count=0 THEN
    RETURN QUERY SELECT NULL::uuid,NULL::text,NULL::text,'MANAGER_REVIEWER_NOT_CONFIGURED'::text;
  ELSIF candidate_count>1 THEN
    RETURN QUERY SELECT NULL::uuid,NULL::text,NULL::text,'MULTIPLE_MANAGER_REVIEWERS'::text;
  ELSE
    RETURN QUERY
    SELECT candidate.id,candidate.display_name,candidate.email,
      CASE WHEN candidate.email IS NULL THEN 'MANAGER_EMAIL_REQUIRED' ELSE 'OK' END
    FROM erp.users candidate
    WHERE candidate.company_id=target_company_id AND candidate.status='active'
      AND EXISTS (
        SELECT 1 FROM erp.user_roles ur
        JOIN erp.role_permissions rp ON rp.role_id=ur.role_id
        JOIN erp.app_permissions permission ON permission.id=rp.permission_id
        WHERE ur.user_id=candidate.id AND permission.code='rental.approve'
      );
  END IF;
END;
$$;

ALTER FUNCTION erp.resolve_manager_review_recipient(text) OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.resolve_manager_review_recipient(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION erp.resolve_manager_review_recipient(text) TO service_role;

CREATE OR REPLACE FUNCTION erp.enforce_customer_review_snapshot_recipient()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = erp, pg_catalog
AS $$
DECLARE target_rental erp.rentals;
BEGIN
  SELECT * INTO target_rental FROM erp.rentals
  WHERE id=NEW.rental_id AND company_id=NEW.company_id;
  IF target_rental.customer_review_email_snapshot IS NULL THEN
    RAISE EXCEPTION 'CUSTOMER_EMAIL_REQUIRED' USING ERRCODE='22023';
  END IF;
  NEW.recipient_name=target_rental.customer_review_name_snapshot;
  NEW.recipient_destination=target_rental.customer_review_email_snapshot;
  RETURN NEW;
END;
$$;
ALTER FUNCTION erp.enforce_customer_review_snapshot_recipient() OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.enforce_customer_review_snapshot_recipient() FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS customer_review_snapshot_recipient ON erp.customer_review_requests;
CREATE TRIGGER customer_review_snapshot_recipient BEFORE INSERT ON erp.customer_review_requests
FOR EACH ROW EXECUTE FUNCTION erp.enforce_customer_review_snapshot_recipient();

CREATE OR REPLACE FUNCTION erp.enforce_manager_review_user_recipient()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = erp, pg_catalog
AS $$
DECLARE resolved record;
BEGIN
  SELECT * INTO resolved FROM erp.resolve_manager_review_recipient(NEW.company_id);
  IF resolved.resolution_code<>'OK' THEN
    RAISE EXCEPTION '%',resolved.resolution_code USING ERRCODE='22023';
  END IF;
  NEW.recipient_user_id=resolved.user_id;
  NEW.recipient_name=resolved.display_name;
  NEW.recipient_destination=resolved.destination;
  RETURN NEW;
END;
$$;
ALTER FUNCTION erp.enforce_manager_review_user_recipient() OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.enforce_manager_review_user_recipient() FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS manager_review_user_recipient ON erp.manager_review_requests;
CREATE TRIGGER manager_review_user_recipient BEFORE INSERT ON erp.manager_review_requests
FOR EACH ROW EXECUTE FUNCTION erp.enforce_manager_review_user_recipient();

COMMIT;
