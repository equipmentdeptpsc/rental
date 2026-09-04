BEGIN;

SET LOCAL search_path=erp,auth,extensions,pg_catalog;

-- Keep the Equipment view security-invoker so its existing Equipment RLS remains
-- authoritative.  This helper is deliberately limited to the presentation fields
-- for one already-visible Equipment row; it is not a general sub-category reader.
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
    AND e.company_id=erp.current_company_id()
    AND erp.can_read_company_row(e.company_id)
$$;

ALTER FUNCTION erp.read_equipment_subcategory_projection(text) OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.read_equipment_subcategory_projection(text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION erp.read_equipment_subcategory_projection(text) TO authenticated;

CREATE OR REPLACE VIEW erp.equipment_read_model WITH (security_invoker=true) AS
SELECT e.*,projection.subcategory_name,projection.subcategory_active
FROM erp.equipment e
LEFT JOIN LATERAL erp.read_equipment_subcategory_projection(e.id) projection ON true;

GRANT SELECT ON erp.equipment_read_model TO authenticated;

COMMIT;
