BEGIN;

SET LOCAL search_path=erp,auth,extensions,pg_catalog;

-- current_company_id() is intentionally private to command boundaries.  Resolve
-- the same active JWT user/company relationship inside this definer boundary so
-- the view remains usable without broadening that helper's EXECUTE privilege.
CREATE OR REPLACE FUNCTION erp.read_equipment_subcategory_projection(target_equipment_id text)
RETURNS TABLE(subcategory_id uuid,subcategory_name text,subcategory_active boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=erp,auth,extensions,pg_catalog
AS $$
  SELECT e.subcategory_id,s.name,s.active
  FROM erp.equipment e
  LEFT JOIN erp.equipment_subcategories s
    ON s.id=e.subcategory_id
   AND s.company_id=e.company_id
  WHERE e.id=target_equipment_id
    AND EXISTS (
      SELECT 1
      FROM erp.users caller
      JOIN erp.companies company
        ON company.id=caller.company_id
       AND company.active
      WHERE caller.id=auth.uid()
        AND caller.status='active'
        AND caller.company_id=e.company_id
    )
$$;

ALTER FUNCTION erp.read_equipment_subcategory_projection(text) OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.read_equipment_subcategory_projection(text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION erp.read_equipment_subcategory_projection(text) TO authenticated;

COMMIT;
