BEGIN;
CREATE OR REPLACE FUNCTION erp.read_customer_review_requests_for_rental(target_rental_id text)
RETURNS TABLE(
  id uuid,
  rental_id text,
  rental_equipment_line_id text,
  deur_id text,
  revision_id text,
  status text,
  created_at timestamptz,
  issued_at timestamptz,
  expires_at timestamptz,
  row_version bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=erp,auth,pg_catalog
AS $$
DECLARE
  tenant text:=erp.current_company_id();
BEGIN
  IF auth.uid() IS NULL OR tenant IS NULL THEN
    RAISE EXCEPTION 'authenticated tenant context is required' USING ERRCODE='42501';
  END IF;
  IF NOT erp.current_user_has_permission('rental.read') THEN
    RAISE EXCEPTION 'rental.read permission is required' USING ERRCODE='42501';
  END IF;
  IF nullif(btrim(target_rental_id),'') IS NULL THEN
    RAISE EXCEPTION 'target rental is required' USING ERRCODE='22023';
  END IF;

  RETURN QUERY
  SELECT request.id,request.rental_id,request.rental_equipment_line_id,
    request.deur_id,request.revision_id,request.status,request.created_at,
    request.issued_at,request.expires_at,request.row_version
  FROM erp.customer_review_requests AS request
  WHERE request.company_id=tenant
    AND request.rental_id=target_rental_id
  ORDER BY request.issued_at DESC,request.created_at DESC,request.id DESC;
END $$;
ALTER FUNCTION erp.read_customer_review_requests_for_rental(text) OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.read_customer_review_requests_for_rental(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION erp.read_customer_review_requests_for_rental(text) TO authenticated;
COMMENT ON FUNCTION erp.read_customer_review_requests_for_rental(text) IS
  'Tenant-scoped, rental.read-authorized operational customer-review state. It intentionally excludes review tokens, token hashes, customer links, and notification credentials.';
COMMIT;
