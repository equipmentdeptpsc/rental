BEGIN;

SET LOCAL search_path = erp, auth, public;

CREATE OR REPLACE FUNCTION erp.get_equipment_maintenance_snapshot(target_equipment_id text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  WITH visible_equipment AS (
    SELECT equipment.id
    FROM erp.equipment AS equipment
    WHERE equipment.id = target_equipment_id
      AND equipment.deleted_at IS NULL
      AND erp.can_read_company_row(equipment.company_id)
  ),
  open_records AS (
    SELECT maintenance.*
    FROM erp.maintenance_records AS maintenance
    JOIN visible_equipment ON visible_equipment.id = maintenance.equipment_id
    WHERE maintenance.deleted_at IS NULL
      AND maintenance.status IN ('Scheduled', 'In Progress')
    ORDER BY
      CASE maintenance.status WHEN 'In Progress' THEN 0 ELSE 1 END,
      maintenance.scheduled_date ASC,
      maintenance.updated_at ASC,
      maintenance.created_at ASC,
      maintenance.id ASC
    LIMIT 5
  ),
  latest_completed AS (
    SELECT maintenance.*
    FROM erp.maintenance_records AS maintenance
    JOIN visible_equipment ON visible_equipment.id = maintenance.equipment_id
    WHERE maintenance.deleted_at IS NULL
      AND maintenance.status = 'Completed'
    ORDER BY
      maintenance.completed_date DESC NULLS LAST,
      maintenance.updated_at DESC,
      maintenance.created_at DESC,
      maintenance.id DESC
    LIMIT 1
  )
  SELECT jsonb_build_object(
    'open_records', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', record.id,
        'equipment_id', record.equipment_id,
        'maintenance_type', record.maintenance_type,
        'scheduled_reading', record.scheduled_reading,
        'current_reading', record.current_reading,
        'scheduled_date', record.scheduled_date,
        'completed_date', record.completed_date,
        'technician', record.technician,
        'remarks', record.remarks,
        'status', record.status,
        'created_at', record.created_at,
        'updated_at', record.updated_at
      ) ORDER BY
        CASE record.status WHEN 'In Progress' THEN 0 ELSE 1 END,
        record.scheduled_date ASC,
        record.updated_at ASC,
        record.created_at ASC,
        record.id ASC
      )
      FROM open_records AS record
    ), '[]'::jsonb),
    'latest_completed', (
      SELECT jsonb_build_object(
        'id', record.id,
        'equipment_id', record.equipment_id,
        'maintenance_type', record.maintenance_type,
        'scheduled_reading', record.scheduled_reading,
        'current_reading', record.current_reading,
        'scheduled_date', record.scheduled_date,
        'completed_date', record.completed_date,
        'technician', record.technician,
        'remarks', record.remarks,
        'status', record.status,
        'created_at', record.created_at,
        'updated_at', record.updated_at
      )
      FROM latest_completed AS record
    )
  );
$$;

ALTER FUNCTION erp.get_equipment_maintenance_snapshot(text) OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.get_equipment_maintenance_snapshot(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION erp.get_equipment_maintenance_snapshot(text) TO authenticated;

COMMENT ON FUNCTION erp.get_equipment_maintenance_snapshot(text) IS
  'Read-only Equipment Maintenance snapshot. Tenant visibility is derived from the caller-visible Equipment row; no client tenant input or direct Maintenance table grant is used.';

COMMIT;
