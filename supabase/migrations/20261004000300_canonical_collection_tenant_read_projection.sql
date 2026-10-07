BEGIN;

-- Browser collection reads use this tenant-scoped projection rather than a
-- direct table scan. It is read-only and explicitly restores the tenant
-- predicate under a fixed search path.
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
    AND collection_row.company_id = erp.current_company_id()
    AND collection_row.rental_id = read_collections_for_rental.target_rental_id
  ORDER BY collection_row.collected_at ASC, collection_row.id ASC;
$$;

ALTER FUNCTION erp.read_collections_for_rental(text) OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.read_collections_for_rental(text) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION erp.read_collections_for_rental(text) TO authenticated;
NOTIFY pgrst, 'reload schema';

COMMIT;
