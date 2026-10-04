BEGIN;
SET LOCAL search_path=erp,auth,extensions,pg_catalog;
-- Keep the deployed invoker-rights read boundary and its exact existing
-- projections.  meter_capability is appended so the existing column order and
-- all consumers of the view remain stable.
CREATE OR REPLACE VIEW erp.equipment_read_model WITH (security_invoker=true) AS
SELECT
  equipment.id,
  equipment.asset_no,
  equipment.equipment_name,
  equipment.prefix_id,
  equipment.category_id,
  equipment.type_id,
  equipment.model_id,
  equipment.brand_id,
  equipment.condition_id,
  equipment.location_id,
  equipment.ownership_id,
  equipment.status_id,
  equipment.project_id,
  equipment.operator_id,
  equipment.cost_code_id,
  equipment.manufacturer,
  equipment.model_text,
  equipment.serial_number,
  equipment.engine_number,
  equipment.chassis_number,
  equipment.plate_number,
  equipment.year_model,
  equipment.capacity,
  equipment.maintenance_type,
  equipment.current_reading,
  equipment.remarks,
  equipment.active,
  equipment.deleted_at,
  equipment.deleted_by,
  equipment.created_at,
  equipment.created_by,
  equipment.updated_at,
  equipment.updated_by,
  equipment.row_version,
  equipment.legacy_payload,
  equipment.company_id,
  equipment.subcategory_id,
  subcategory.subcategory_name,
  subcategory.subcategory_active,
  current_customer.customer_id,
  equipment.meter_capability AS meter_capability
FROM erp.equipment equipment
LEFT JOIN LATERAL erp.read_equipment_subcategory_projection(equipment.id) subcategory ON true
LEFT JOIN LATERAL erp.read_equipment_current_customer_projection(equipment.id) current_customer ON true;
ALTER VIEW erp.equipment_read_model OWNER TO postgres;
GRANT SELECT ON erp.equipment_read_model TO authenticated;
COMMIT;
