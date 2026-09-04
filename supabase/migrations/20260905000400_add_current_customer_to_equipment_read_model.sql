BEGIN;

SET LOCAL search_path=erp,auth,extensions,pg_catalog;

-- The Equipment view remains an invoker-rights boundary. This helper exposes
-- only the current Customer identifier for an Equipment row the active caller
-- already has access to; it is not a Rental or Customer read API.
CREATE OR REPLACE FUNCTION erp.read_equipment_current_customer_projection(target_equipment_id text)
RETURNS TABLE(customer_id text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=erp,auth,extensions,pg_catalog
AS $$
  SELECT rental.customer_id
  FROM erp.equipment equipment
  JOIN erp.rental_equipment_lines line
    ON line.equipment_id=equipment.id
   AND line.company_id=equipment.company_id
  JOIN erp.rentals rental
    ON rental.id=line.rental_id
   AND rental.company_id=line.company_id
  WHERE equipment.id=target_equipment_id
    AND EXISTS (
      SELECT 1
      FROM erp.users caller
      JOIN erp.companies company
        ON company.id=caller.company_id
       AND company.active
      WHERE caller.id=auth.uid()
        AND caller.status='active'
        AND caller.company_id=equipment.company_id
    )
    AND line.deleted_at IS NULL
    AND line.status IN ('Draft','Assigned','Reserved','Released','Active')
    AND rental.customer_id IS NOT NULL
    AND rental.status IN ('Draft','Assigned','Reserved','Released','Active')
  ORDER BY rental.updated_at DESC,rental.created_at DESC,rental.id DESC,line.updated_at DESC,line.id DESC
  LIMIT 1
$$;

ALTER FUNCTION erp.read_equipment_current_customer_projection(text) OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.read_equipment_current_customer_projection(text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION erp.read_equipment_current_customer_projection(text) TO authenticated;

CREATE OR REPLACE VIEW erp.equipment_read_model WITH (security_invoker=true) AS
SELECT equipment.*,subcategory.subcategory_name,subcategory.subcategory_active,current_customer.customer_id
FROM erp.equipment equipment
LEFT JOIN LATERAL erp.read_equipment_subcategory_projection(equipment.id) subcategory ON true
LEFT JOIN LATERAL erp.read_equipment_current_customer_projection(equipment.id) current_customer ON true;

GRANT SELECT ON erp.equipment_read_model TO authenticated;

COMMIT;
