BEGIN;

-- D4B3A: retain the established ordinary RPC signature while allowing a NULL
-- requested end to mean an open-ended interval from p_window_start onward.
CREATE OR REPLACE FUNCTION erp.check_equipment_availability(
  p_equipment_id text,
  p_window_start date,
  p_window_end date
)
RETURNS TABLE (
  equipment_id text,
  available boolean,
  conflict_count bigint,
  source_type text,
  status text,
  rental_number text,
  project_label text,
  customer_label text,
  commitment_start date,
  commitment_end date,
  is_open_ended boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = erp, auth, pg_catalog
AS $$
DECLARE
  v_can_rental boolean := erp.current_user_has_permission('rental.read');
  v_can_assignment boolean := erp.current_user_has_permission('assignment.read');
  v_can_project boolean := erp.current_user_has_permission('project.read');
  v_can_customer boolean := erp.current_user_has_permission('customer.read');
BEGIN
  IF NOT erp.current_user_has_permission('equipment.read') THEN
    RAISE EXCEPTION 'equipment.read permission is required' USING ERRCODE = '42501';
  END IF;
  IF p_equipment_id IS NULL OR btrim(p_equipment_id) = '' THEN
    RAISE EXCEPTION 'equipment id is required' USING ERRCODE = '22023';
  END IF;
  IF p_window_start IS NULL OR (p_window_end IS NOT NULL AND p_window_start > p_window_end) THEN
    RAISE EXCEPTION 'availability window start is required and end must not precede it' USING ERRCODE = '22023';
  END IF;
  IF p_window_end IS NOT NULL AND p_window_end - p_window_start > 92 THEN
    RAISE EXCEPTION 'availability window must not exceed 93 days' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM erp.equipment AS equipment
    WHERE equipment.id = p_equipment_id
      AND equipment.deleted_at IS NULL
      AND erp.can_read_company_row(equipment.company_id)
  ) THEN
    RAISE EXCEPTION 'equipment is not available to the current tenant' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH conflicts AS (
    SELECT commitment.*
    FROM erp._equipment_commitment_rows() AS commitment
    WHERE commitment.equipment_id = p_equipment_id
      AND (p_window_end IS NULL OR commitment.commitment_start <= p_window_end)
      AND (commitment.commitment_end IS NULL OR commitment.commitment_end >= p_window_start)
  ), counted AS (
    SELECT conflicts.*, count(*) OVER () AS all_conflicts
    FROM conflicts
  ), bounded AS (
    SELECT * FROM counted
    ORDER BY commitment_start ASC, equipment_id ASC, source_type ASC,
      rental_equipment_line_id ASC NULLS LAST, assignment_id ASC NULLS LAST
    LIMIT 100
  )
  SELECT p_equipment_id, false, bounded.all_conflicts,
    CASE WHEN (bounded.source_type = 'RENTAL' AND v_can_rental)
              OR (bounded.source_type = 'ASSIGNMENT' AND v_can_assignment)
         THEN bounded.source_type ELSE 'RESTRICTED' END,
    CASE WHEN (bounded.source_type = 'RENTAL' AND v_can_rental)
              OR (bounded.source_type = 'ASSIGNMENT' AND v_can_assignment)
         THEN bounded.commitment_status END,
    CASE WHEN bounded.source_type = 'RENTAL' AND v_can_rental THEN bounded.rental_number END,
    CASE WHEN v_can_project AND ((bounded.source_type = 'RENTAL' AND v_can_rental)
              OR (bounded.source_type = 'ASSIGNMENT' AND v_can_assignment)) THEN project.name END,
    CASE WHEN bounded.source_type = 'RENTAL' AND v_can_rental AND v_can_customer THEN customer.name END,
    CASE WHEN (bounded.source_type = 'RENTAL' AND v_can_rental)
              OR (bounded.source_type = 'ASSIGNMENT' AND v_can_assignment)
         THEN bounded.commitment_start END,
    CASE WHEN (bounded.source_type = 'RENTAL' AND v_can_rental)
              OR (bounded.source_type = 'ASSIGNMENT' AND v_can_assignment)
         THEN bounded.commitment_end END,
    CASE WHEN (bounded.source_type = 'RENTAL' AND v_can_rental)
              OR (bounded.source_type = 'ASSIGNMENT' AND v_can_assignment)
         THEN bounded.is_open_ended END
  FROM bounded
  LEFT JOIN erp.projects AS project ON project.id = bounded.project_id
    AND project.company_id = bounded.company_id AND project.deleted_at IS NULL
  LEFT JOIN erp.customers AS customer ON customer.id = bounded.customer_id
    AND customer.company_id = bounded.company_id AND customer.deleted_at IS NULL

  UNION ALL

  SELECT p_equipment_id, true, 0::bigint, NULL::text, NULL::text, NULL::text,
    NULL::text, NULL::text, NULL::date, NULL::date, NULL::boolean
  WHERE NOT EXISTS (SELECT 1 FROM conflicts);
END;
$$;

-- Keep D4A1 aligned with the ordinary NULL-requested-end semantics while
-- preserving its exact, null-safe source Assignment exemption.
CREATE OR REPLACE FUNCTION erp.check_equipment_availability_for_pending_rental(
  p_equipment_id text,
  p_window_start date,
  p_window_end date,
  p_source_assignment_id text
)
RETURNS TABLE (
  equipment_id text, available boolean, conflict_count bigint, source_type text,
  status text, rental_number text, project_label text, customer_label text,
  commitment_start date, commitment_end date, is_open_ended boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = erp, auth, pg_catalog
AS $$
DECLARE
  v_can_rental boolean := erp.current_user_has_permission('rental.read');
  v_can_assignment boolean := erp.current_user_has_permission('assignment.read');
  v_can_project boolean := erp.current_user_has_permission('project.read');
  v_can_customer boolean := erp.current_user_has_permission('customer.read');
BEGIN
  PERFORM * FROM erp.check_equipment_availability(p_equipment_id, p_window_start, p_window_end);
  RETURN QUERY
  WITH exact_source AS (
    SELECT assignment.id FROM erp.assignments assignment
    WHERE assignment.id = p_source_assignment_id AND assignment.equipment_id = p_equipment_id
      AND assignment.status = 'Active' AND assignment.deleted_at IS NULL
      AND assignment.assigned_date = p_window_start
      AND assignment.expected_return IS NOT DISTINCT FROM p_window_end
      AND erp.can_read_company_row(assignment.company_id)
  ), conflicts AS (
    SELECT c.* FROM erp._equipment_commitment_rows() c
    WHERE c.equipment_id = p_equipment_id
      AND (p_window_end IS NULL OR c.commitment_start <= p_window_end)
      AND (c.commitment_end IS NULL OR c.commitment_end >= p_window_start)
      AND NOT (c.source_type = 'ASSIGNMENT' AND c.assignment_id = p_source_assignment_id
               AND EXISTS (SELECT 1 FROM exact_source))
  ), counted AS (SELECT c.*, count(*) OVER () all_conflicts FROM conflicts c), bounded AS (
    SELECT * FROM counted ORDER BY commitment_start, equipment_id, source_type,
      rental_equipment_line_id NULLS LAST, assignment_id NULLS LAST LIMIT 100
  )
  SELECT p_equipment_id, false, b.all_conflicts,
    CASE WHEN (b.source_type='RENTAL' AND v_can_rental) OR (b.source_type='ASSIGNMENT' AND v_can_assignment) THEN b.source_type ELSE 'RESTRICTED' END,
    CASE WHEN (b.source_type='RENTAL' AND v_can_rental) OR (b.source_type='ASSIGNMENT' AND v_can_assignment) THEN b.commitment_status END,
    CASE WHEN b.source_type='RENTAL' AND v_can_rental THEN b.rental_number END,
    CASE WHEN v_can_project AND ((b.source_type='RENTAL' AND v_can_rental) OR (b.source_type='ASSIGNMENT' AND v_can_assignment)) THEN p.name END,
    CASE WHEN b.source_type='RENTAL' AND v_can_rental AND v_can_customer THEN cu.name END,
    CASE WHEN (b.source_type='RENTAL' AND v_can_rental) OR (b.source_type='ASSIGNMENT' AND v_can_assignment) THEN b.commitment_start END,
    CASE WHEN (b.source_type='RENTAL' AND v_can_rental) OR (b.source_type='ASSIGNMENT' AND v_can_assignment) THEN b.commitment_end END,
    CASE WHEN (b.source_type='RENTAL' AND v_can_rental) OR (b.source_type='ASSIGNMENT' AND v_can_assignment) THEN b.is_open_ended END
  FROM bounded b
  LEFT JOIN erp.projects p ON p.id=b.project_id AND p.company_id=b.company_id AND p.deleted_at IS NULL
  LEFT JOIN erp.customers cu ON cu.id=b.customer_id AND cu.company_id=b.company_id AND cu.deleted_at IS NULL
  UNION ALL SELECT p_equipment_id, true, 0::bigint, NULL::text, NULL::text, NULL::text,
    NULL::text, NULL::text, NULL::date, NULL::date, NULL::boolean
  WHERE NOT EXISTS (SELECT 1 FROM conflicts);
END;
$$;

COMMENT ON FUNCTION erp.check_equipment_availability(text,date,date) IS
  'D4 advisory availability read; a NULL requested end is an open-ended interval.';
COMMENT ON FUNCTION erp.check_equipment_availability_for_pending_rental(text,date,date,text) IS
  'D4 advisory pending Rental availability read; supports open-ended requests and excludes only an exact active source Assignment with matching null-safe interval.';

COMMIT;
