BEGIN;

SET LOCAL search_path = erp, auth, extensions, pg_catalog;

-- The parent dates remain the engagement dates.  These helpers are for a
-- persisted equipment-line booking interval only; their legacy fallback keeps
-- historical rows readable while D5 line onboarding is introduced separately.
CREATE OR REPLACE FUNCTION erp.rental_line_commitment_start(
  p_effective_start_date date,
  p_parent_date_out date
)
RETURNS date
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$ SELECT coalesce(p_effective_start_date, p_parent_date_out) $$;

CREATE OR REPLACE FUNCTION erp.rental_line_commitment_end(
  p_actual_return_date date,
  p_parent_expected_return date
)
RETURNS date
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$ SELECT coalesce(p_actual_return_date, p_parent_expected_return) $$;

CREATE OR REPLACE FUNCTION erp.rental_line_is_committing(
  p_legacy_line_status erp.rental_status,
  p_canonical_line_status erp.rental_equipment_line_status,
  p_legacy_parent_status erp.rental_status,
  p_canonical_parent_status erp.rental_parent_status
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT
    (coalesce(p_canonical_line_status::text, p_legacy_line_status::text) IN ('Draft', 'Reserved', 'Released', 'Active')
      OR (p_canonical_line_status IS NULL AND p_legacy_line_status = 'Assigned'))
    AND (coalesce(p_canonical_parent_status::text, p_legacy_parent_status::text) IN ('Draft', 'Reserved', 'Released', 'Active')
      OR (p_canonical_parent_status IS NULL AND p_legacy_parent_status = 'Assigned'));
$$;

-- D3: all write-time interval enforcement reads persisted line dates, never a
-- client-supplied substitute.  Cancelled/Closed/legacy Returned parents and
-- Returned/Cancelled lines are non-committing by the shared status gate.
CREATE OR REPLACE FUNCTION erp.assert_equipment_interval_available(
  p_company_id text,
  p_equipment_id text,
  p_requested_start date,
  p_requested_end date,
  p_exclude_rental_line_id text DEFAULT NULL,
  p_exclude_assignment_id text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = erp, auth, pg_catalog
AS $$
DECLARE
  v_conflict record;
BEGIN
  IF p_company_id IS NULL OR p_company_id <> erp.current_company_id()
     OR p_equipment_id IS NULL OR p_requested_start IS NULL
     OR (p_requested_end IS NOT NULL AND p_requested_end < p_requested_start) THEN
    RAISE EXCEPTION 'EQUIPMENT_INTERVAL_CONFLICT' USING ERRCODE = 'P0001';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_company_id || ':' || p_equipment_id, 0));

  SELECT * INTO v_conflict
  FROM (
    SELECT 'RENTAL'::text source_type, line.id rental_line_id, NULL::text assignment_id,
      rental.rental_number reference,
      erp.rental_line_commitment_start(line.effective_start_date, rental.date_out) starts_on,
      erp.rental_line_commitment_end(line.actual_return_date, rental.expected_return) ends_on
    FROM erp.rental_equipment_lines line
    JOIN erp.rentals rental ON rental.id = line.rental_id AND rental.company_id = line.company_id
    WHERE line.company_id = p_company_id AND line.equipment_id = p_equipment_id
      AND line.deleted_at IS NULL
      AND erp.rental_line_is_committing(line.status, line.canonical_line_status, rental.status, rental.canonical_parent_status)
      AND line.id IS DISTINCT FROM p_exclude_rental_line_id
    UNION ALL
    SELECT 'ASSIGNMENT', NULL::text, assignment.id, assignment.id,
      assignment.assigned_date, assignment.expected_return
    FROM erp.assignments assignment
    WHERE assignment.company_id = p_company_id AND assignment.equipment_id = p_equipment_id
      AND assignment.deleted_at IS NULL AND assignment.status = 'Active'
      AND assignment.id IS DISTINCT FROM p_exclude_assignment_id
      AND NOT EXISTS (
        SELECT 1
        FROM erp.rental_equipment_lines line
        JOIN erp.rentals rental ON rental.id = line.rental_id AND rental.company_id = line.company_id
        WHERE line.company_id = assignment.company_id AND line.assignment_id = assignment.id
          AND line.equipment_id = assignment.equipment_id AND line.deleted_at IS NULL
          AND erp.rental_line_is_committing(line.status, line.canonical_line_status, rental.status, rental.canonical_parent_status)
      )
  ) commitment
  WHERE commitment.starts_on <= coalesce(p_requested_end, 'infinity'::date)
    AND coalesce(commitment.ends_on, 'infinity'::date) >= p_requested_start
  ORDER BY commitment.starts_on, commitment.source_type, commitment.rental_line_id NULLS LAST, commitment.assignment_id NULLS LAST
  LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'EQUIPMENT_INTERVAL_CONFLICT' USING ERRCODE = 'P0001', DETAIL = jsonb_build_object(
      'equipmentId', p_equipment_id, 'sourceType', v_conflict.source_type, 'reference', v_conflict.reference,
      'commitmentStart', v_conflict.starts_on, 'commitmentEnd', v_conflict.ends_on,
      'requestedStart', p_requested_start, 'requestedEnd', p_requested_end
    )::text;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION erp.enforce_rental_line_commitment_interval()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = erp, auth, pg_catalog
AS $$
DECLARE
  rental erp.rentals%ROWTYPE;
  line_start date;
  line_end date;
  exact_source_assignment_id text;
BEGIN
  IF NEW.deleted_at IS NULL THEN
    SELECT * INTO rental FROM erp.rentals WHERE id = NEW.rental_id AND company_id = NEW.company_id;
    IF rental.id IS NULL THEN RAISE EXCEPTION 'EQUIPMENT_INTERVAL_CONFLICT' USING ERRCODE = 'P0001'; END IF;
    IF erp.rental_line_is_committing(NEW.status, NEW.canonical_line_status, rental.status, rental.canonical_parent_status) THEN
      line_start = erp.rental_line_commitment_start(NEW.effective_start_date, rental.date_out);
      line_end = erp.rental_line_commitment_end(NEW.actual_return_date, rental.expected_return);
      SELECT assignment.id INTO exact_source_assignment_id
      FROM erp.assignments assignment
      WHERE assignment.id = NEW.assignment_id AND assignment.company_id = NEW.company_id
        AND assignment.equipment_id = NEW.equipment_id AND assignment.status = 'Active'
        AND assignment.deleted_at IS NULL AND assignment.assigned_date = line_start
        AND assignment.expected_return IS NOT DISTINCT FROM line_end;
      PERFORM erp.assert_equipment_interval_available(NEW.company_id, NEW.equipment_id, line_start, line_end, NEW.id, exact_source_assignment_id);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_rental_line_commitment_interval ON erp.rental_equipment_lines;
CREATE TRIGGER enforce_rental_line_commitment_interval
  BEFORE INSERT OR UPDATE OF rental_id, equipment_id, status, canonical_line_status, effective_start_date, actual_return_date, deleted_at
  ON erp.rental_equipment_lines
  FOR EACH ROW EXECUTE FUNCTION erp.enforce_rental_line_commitment_interval();

-- D4's ordinary and relationship-aware reads both consume this projection.
-- Their public signatures already accept a candidate start/end, so they remain
-- neutral for New Rental and the future Add Equipment workflow.
CREATE OR REPLACE FUNCTION erp._equipment_commitment_rows()
RETURNS TABLE (
  source_type text, company_id text, equipment_id text, rental_equipment_line_id text,
  rental_id text, assignment_id text, customer_id text, project_id text, rental_number text,
  commitment_status text, commitment_start date, commitment_end date, is_open_ended boolean
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = erp, auth, pg_catalog
AS $$
  SELECT
    'RENTAL'::text, line.company_id, line.equipment_id, line.id, rental.id,
    line.assignment_id, rental.customer_id, rental.project_id, rental.rental_number,
    coalesce(line.canonical_line_status::text, line.status::text),
    erp.rental_line_commitment_start(line.effective_start_date, rental.date_out),
    erp.rental_line_commitment_end(line.actual_return_date, rental.expected_return),
    erp.rental_line_commitment_end(line.actual_return_date, rental.expected_return) IS NULL
  FROM erp.rental_equipment_lines line
  JOIN erp.rentals rental ON rental.id = line.rental_id AND rental.company_id = line.company_id
  WHERE line.deleted_at IS NULL
    AND erp.can_read_company_row(line.company_id)
    AND erp.rental_line_is_committing(line.status, line.canonical_line_status, rental.status, rental.canonical_parent_status)
  UNION ALL
  SELECT
    'ASSIGNMENT'::text, assignment.company_id, assignment.equipment_id, NULL,
    NULL, assignment.id, NULL, assignment.project_id, NULL,
    assignment.status::text, assignment.assigned_date, assignment.expected_return,
    assignment.expected_return IS NULL
  FROM erp.assignments assignment
  WHERE assignment.deleted_at IS NULL AND assignment.status = 'Active'
    AND erp.can_read_company_row(assignment.company_id)
    AND NOT EXISTS (
      SELECT 1 FROM erp.rental_equipment_lines line
      JOIN erp.rentals rental ON rental.id = line.rental_id AND rental.company_id = line.company_id
      WHERE line.deleted_at IS NULL AND line.assignment_id = assignment.id
        AND line.equipment_id = assignment.equipment_id AND line.company_id = assignment.company_id
        AND erp.rental_line_is_committing(line.status, line.canonical_line_status, rental.status, rental.canonical_parent_status)
    );
$$;

-- Booking rows are equipment-line rows, so their start/end and calendar
-- overlap use the same authoritative interval. Parent headers continue to
-- query Rental date_out/expected_return separately.
CREATE OR REPLACE FUNCTION erp._search_booking_rows_v2(
  p_status text DEFAULT NULL, p_customer_id text DEFAULT NULL, p_project_id text DEFAULT NULL,
  p_equipment_id text DEFAULT NULL, p_rental_number_search text DEFAULT NULL,
  p_order_field text DEFAULT 'createdAt', p_order_ascending boolean DEFAULT false,
  p_offset integer DEFAULT 0, p_limit integer DEFAULT 25,
  p_window_start date DEFAULT NULL, p_window_end date DEFAULT NULL,
  p_operational_queue text DEFAULT NULL
)
RETURNS TABLE (
  o_rental_id text, o_rental_number text, o_rental_status text, o_rental_equipment_line_id text,
  o_equipment_id text, o_equipment_asset_number text, o_equipment_name text, o_customer_id text,
  o_customer_name text, o_project_id text, o_project_name text, o_date_out date,
  o_expected_return date, o_actual_return date, o_created_at timestamptz, o_reserved_at timestamptz,
  o_released_at timestamptz, o_activated_at timestamptz, o_returned_at timestamptz,
  o_closed_at timestamptz, o_cancelled_at timestamptz, o_total_count bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = erp, auth, pg_catalog
AS $$
DECLARE
  v_limit integer := LEAST(100, GREATEST(1, COALESCE(p_limit, 25)));
  v_offset integer := GREATEST(0, COALESCE(p_offset, 0));
  v_order_field text := CASE WHEN p_order_field IN ('createdAt', 'dateOut', 'expectedReturn', 'rentalStatus') THEN p_order_field ELSE 'createdAt' END;
BEGIN
  IF NOT erp.current_user_has_permission('rental.read') THEN RAISE EXCEPTION 'rental.read permission is required' USING ERRCODE = '42501'; END IF;
  IF p_operational_queue IS NOT NULL AND p_operational_queue NOT IN ('UPCOMING_RELEASE', 'EXPECTED_RETURN') THEN RAISE EXCEPTION 'operational booking queue is invalid' USING ERRCODE = '22023'; END IF;
  IF (p_window_start IS NULL) <> (p_window_end IS NULL) THEN RAISE EXCEPTION 'calendar window start and end are both required' USING ERRCODE = '22023'; END IF;
  IF p_window_start IS NOT NULL AND p_window_start > p_window_end THEN RAISE EXCEPTION 'calendar window start must not follow end' USING ERRCODE = '22023'; END IF;
  IF p_window_start IS NOT NULL AND p_window_end - p_window_start > 92 THEN RAISE EXCEPTION 'calendar window must not exceed 93 days' USING ERRCODE = '22023'; END IF;
  IF p_operational_queue IS NOT NULL AND p_window_start IS NULL THEN RAISE EXCEPTION 'operational booking window is required' USING ERRCODE = '22023'; END IF;
  RETURN QUERY
  WITH rows AS (
    SELECT rental.id rental_id, rental.rental_number, rental.status::text rental_status,
      line.id rental_equipment_line_id, line.equipment_id,
      CASE WHEN erp.current_user_has_permission('equipment.read') THEN equipment.asset_no END equipment_asset_number,
      CASE WHEN erp.current_user_has_permission('equipment.read') THEN equipment.equipment_name END equipment_name,
      rental.customer_id, CASE WHEN erp.current_user_has_permission('customer.read') THEN customer.name END customer_name,
      rental.project_id, CASE WHEN erp.current_user_has_permission('project.read') THEN project.name END project_name,
      erp.rental_line_commitment_start(line.effective_start_date, rental.date_out) date_out,
      erp.rental_line_commitment_end(line.actual_return_date, rental.expected_return) expected_return,
      line.actual_return_date actual_return, rental.created_at, rental.reserved_at, rental.released_at,
      rental.activated_at, rental.returned_at, rental.closed_at, rental.cancelled_at
    FROM erp.rental_equipment_lines line
    JOIN erp.rentals rental ON rental.id = line.rental_id AND rental.company_id = line.company_id
    JOIN erp.equipment equipment ON equipment.id = line.equipment_id AND equipment.company_id = line.company_id AND equipment.deleted_at IS NULL
    LEFT JOIN erp.customers customer ON customer.id = rental.customer_id AND customer.company_id = rental.company_id AND customer.deleted_at IS NULL
    LEFT JOIN erp.projects project ON project.id = rental.project_id AND project.company_id = rental.company_id AND project.deleted_at IS NULL
    WHERE line.deleted_at IS NULL AND erp.can_read_company_row(rental.company_id)
      AND (p_status IS NULL OR rental.status::text = p_status)
      AND (p_customer_id IS NULL OR rental.customer_id = p_customer_id)
      AND (p_project_id IS NULL OR rental.project_id = p_project_id)
      AND (p_equipment_id IS NULL OR line.equipment_id = p_equipment_id)
      AND (p_rental_number_search IS NULL OR rental.rental_number ILIKE '%' || p_rental_number_search || '%')
      AND ((p_operational_queue = 'UPCOMING_RELEASE' AND rental.status = 'Reserved' AND line.status = 'Reserved'
            AND COALESCE(rental.legacy_payload->>'approvalStatus', '') = 'Approved'
            AND erp.rental_line_commitment_start(line.effective_start_date, rental.date_out) BETWEEN p_window_start AND p_window_end)
        OR (p_operational_queue = 'EXPECTED_RETURN' AND rental.status IN ('Released', 'Active') AND line.status IN ('Released', 'Active')
            AND erp.rental_line_commitment_end(line.actual_return_date, rental.expected_return) IS NOT NULL
            AND erp.rental_line_commitment_end(line.actual_return_date, rental.expected_return) BETWEEN p_window_start AND p_window_end)
        OR (p_operational_queue IS NULL AND (p_window_start IS NULL OR (
            erp.rental_line_commitment_start(line.effective_start_date, rental.date_out) <= p_window_end
            AND coalesce(erp.rental_line_commitment_end(line.actual_return_date, rental.expected_return), 'infinity'::date) >= p_window_start))))
  ), counted AS (SELECT rows.*, count(*) OVER () total_count FROM rows)
  SELECT rental_id, rental_number, rental_status, rental_equipment_line_id, equipment_id,
    equipment_asset_number, equipment_name, customer_id, customer_name, project_id, project_name,
    date_out, expected_return, actual_return, created_at, reserved_at, released_at, activated_at,
    returned_at, closed_at, cancelled_at, total_count
  FROM counted
  ORDER BY
    CASE WHEN v_order_field = 'createdAt' AND p_order_ascending THEN counted.created_at END ASC NULLS LAST,
    CASE WHEN v_order_field = 'createdAt' AND NOT p_order_ascending THEN counted.created_at END DESC NULLS LAST,
    CASE WHEN v_order_field = 'dateOut' AND p_order_ascending THEN counted.date_out END ASC NULLS LAST,
    CASE WHEN v_order_field = 'dateOut' AND NOT p_order_ascending THEN counted.date_out END DESC NULLS LAST,
    CASE WHEN v_order_field = 'expectedReturn' AND p_order_ascending THEN counted.expected_return END ASC NULLS LAST,
    CASE WHEN v_order_field = 'expectedReturn' AND NOT p_order_ascending THEN counted.expected_return END DESC NULLS LAST,
    CASE WHEN v_order_field = 'rentalStatus' AND p_order_ascending THEN counted.rental_status END ASC NULLS LAST,
    CASE WHEN v_order_field = 'rentalStatus' AND NOT p_order_ascending THEN counted.rental_status END DESC NULLS LAST,
    CASE WHEN p_operational_queue IS NULL THEN counted.rental_equipment_line_id END DESC,
    CASE WHEN p_operational_queue IS NOT NULL THEN counted.rental_equipment_line_id END ASC
  OFFSET v_offset LIMIT v_limit;
END;
$$;

ALTER FUNCTION erp.rental_line_commitment_start(date, date) OWNER TO postgres;
ALTER FUNCTION erp.rental_line_commitment_end(date, date) OWNER TO postgres;
ALTER FUNCTION erp.rental_line_is_committing(erp.rental_status, erp.rental_equipment_line_status, erp.rental_status, erp.rental_parent_status) OWNER TO postgres;
ALTER FUNCTION erp.assert_equipment_interval_available(text,text,date,date,text,text) OWNER TO postgres;
ALTER FUNCTION erp.enforce_rental_line_commitment_interval() OWNER TO postgres;
ALTER FUNCTION erp._equipment_commitment_rows() OWNER TO postgres;
ALTER FUNCTION erp._search_booking_rows_v2(text,text,text,text,text,text,boolean,integer,integer,date,date,text) OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.rental_line_commitment_start(date,date), erp.rental_line_commitment_end(date,date), erp.rental_line_is_committing(erp.rental_status,erp.rental_equipment_line_status,erp.rental_status,erp.rental_parent_status), erp.assert_equipment_interval_available(text,text,date,date,text,text), erp.enforce_rental_line_commitment_interval(), erp._equipment_commitment_rows(), erp._search_booking_rows_v2(text,text,text,text,text,text,boolean,integer,integer,date,date,text) FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION erp._equipment_commitment_rows() IS
  'D5B2 read-only equipment commitments use line effective_start_date (legacy fallback parent date_out) through line actual_return_date or parent expected_return. Candidate D4 start/end parameters remain caller-neutral.';

COMMIT;
