BEGIN;

-- Replace the tenant-scoped read projection without changing its signature or
-- row shape. SECURITY DEFINER must enforce RBAC inside the function because
-- every authenticated caller can invoke it directly.
CREATE OR REPLACE FUNCTION erp.read_collections_for_rental(target_rental_id text)
RETURNS SETOF erp.collections
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = erp, auth, pg_catalog
AS $$
  SELECT collection_row.*
  FROM erp.collections AS collection_row
  WHERE auth.uid() IS NOT NULL
    AND erp.current_user_has_permission('collections.read')
    AND erp.can_read_company_row(collection_row.company_id)
    AND collection_row.company_id = erp.current_company_id()
    AND collection_row.rental_id = read_collections_for_rental.target_rental_id
  ORDER BY collection_row.collected_at ASC, collection_row.id ASC;
$$;

ALTER FUNCTION erp.read_collections_for_rental(text) OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.read_collections_for_rental(text) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION erp.read_collections_for_rental(text) TO authenticated;
NOTIFY pgrst, 'reload schema';

COMMIT;
