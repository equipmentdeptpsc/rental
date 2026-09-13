BEGIN;

-- D4A1: advisory pre-persistence read for the canonical Rental-from-Assignment
-- workflow.  The established three-argument availability RPC is intentionally
-- left intact for all ordinary callers.
CREATE FUNCTION erp.check_equipment_availability_for_pending_rental(
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
  -- Preserve D1 validation and tenant visibility behaviour before reading rows.
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
      AND c.commitment_start <= p_window_end
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

ALTER FUNCTION erp.check_equipment_availability_for_pending_rental(text,date,date,text) OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.check_equipment_availability_for_pending_rental(text,date,date,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION erp.check_equipment_availability_for_pending_rental(text,date,date,text) TO authenticated;
COMMENT ON FUNCTION erp.check_equipment_availability_for_pending_rental(text,date,date,text) IS
  'D4 advisory pending Rental availability read; excludes only an exact active source Assignment with matching equipment and null-safe interval.';

COMMIT;
