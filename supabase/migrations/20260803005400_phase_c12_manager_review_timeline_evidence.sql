BEGIN;
SET search_path = erp, pg_catalog;

CREATE OR REPLACE FUNCTION erp.build_manager_review_evidence(
  target_company_id text,
  target_rental_id text,
  target_line_id text,
  target_deur_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = erp, pg_catalog
AS $$
DECLARE
  company_record companies;
  rental_record rentals;
  line_record rental_equipment_lines;
  target deurs;
  equipment_record equipment;
  operator_record operators;
  project_record projects;
  decision record;
  start_at timestamptz;
  end_at timestamptz;
  starts integer;
  ends integer;
  decisions integer;
  timeline jsonb;
BEGIN
  SELECT * INTO company_record FROM companies
  WHERE id = target_company_id AND active = true;
  SELECT * INTO rental_record FROM rentals
  WHERE id = target_rental_id AND company_id = target_company_id;
  SELECT * INTO line_record FROM rental_equipment_lines
  WHERE id = target_line_id AND rental_id = target_rental_id
    AND company_id = target_company_id;
  SELECT * INTO target FROM deurs
  WHERE id = target_deur_id AND rental_id = target_rental_id
    AND rental_equipment_line_id = target_line_id
    AND company_id = target_company_id;
  SELECT * INTO equipment_record FROM equipment
  WHERE id = line_record.equipment_id AND company_id = target_company_id;
  SELECT * INTO operator_record FROM operators
  WHERE id = line_record.operator_id AND company_id = target_company_id;
  SELECT * INTO project_record FROM projects
  WHERE id = rental_record.project_id AND company_id = target_company_id;

  SELECT count(*) FILTER (WHERE activity_type = 'shift' AND action = 'start'),
    count(*) FILTER (WHERE activity_type = 'shift' AND action = 'end'),
    min(occurred_at) FILTER (WHERE activity_type = 'shift' AND action = 'start'),
    min(occurred_at) FILTER (WHERE activity_type = 'shift' AND action = 'end')
  INTO starts, ends, start_at, end_at
  FROM deur_events
  WHERE company_id = target_company_id AND deur_id = target_deur_id;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'activity', event_rows.activity_type,
    'action', event_rows.action,
    'occurredAt', event_rows.occurred_at,
    'sequence', event_rows.sequence
  ) ORDER BY event_rows.sequence, event_rows.occurred_at, event_rows.id), '[]'::jsonb)
  INTO timeline
  FROM deur_events event_rows
  WHERE event_rows.company_id = target_company_id
    AND event_rows.deur_id = target_deur_id
    AND event_rows.activity_type <> 'shift'
    AND event_rows.is_open = false
    AND (
      (event_rows.action = 'start' AND EXISTS (
        SELECT 1 FROM deur_events completed_end
        WHERE completed_end.company_id = target_company_id
          AND completed_end.deur_id = target_deur_id
          AND completed_end.activity_type = event_rows.activity_type
          AND completed_end.action = 'end'
          AND completed_end.sequence > event_rows.sequence
      ))
      OR
      (event_rows.action = 'end' AND EXISTS (
        SELECT 1 FROM deur_events completed_start
        WHERE completed_start.company_id = target_company_id
          AND completed_start.deur_id = target_deur_id
          AND completed_start.activity_type = event_rows.activity_type
          AND completed_start.action = 'start'
          AND completed_start.sequence < event_rows.sequence
      ))
    );

  SELECT count(*) INTO decisions
  FROM customer_review_outcomes outcome
  JOIN customer_review_requests request
    ON request.id = outcome.review_request_id
    AND request.company_id = outcome.company_id
  WHERE outcome.company_id = target_company_id
    AND outcome.rental_id = target_rental_id
    AND request.rental_equipment_line_id = target_line_id
    AND outcome.deur_id = target_deur_id
    AND outcome.revision_id = target_deur_id
    AND request.deur_id = target_deur_id
    AND request.revision_id = target_deur_id
    AND outcome.action = 'ACKNOWLEDGE'
    AND request.status = 'Acknowledged';
  SELECT outcome.action, outcome.occurred_at INTO decision
  FROM customer_review_outcomes outcome
  JOIN customer_review_requests request
    ON request.id = outcome.review_request_id
    AND request.company_id = outcome.company_id
  WHERE outcome.company_id = target_company_id
    AND outcome.rental_id = target_rental_id
    AND request.rental_equipment_line_id = target_line_id
    AND outcome.deur_id = target_deur_id
    AND outcome.revision_id = target_deur_id
    AND request.deur_id = target_deur_id
    AND request.revision_id = target_deur_id
    AND outcome.action = 'ACKNOWLEDGE'
    AND request.status = 'Acknowledged'
  LIMIT 1;

  IF company_record.id IS NULL OR rental_record.id IS NULL OR line_record.id IS NULL
    OR target.id IS NULL OR equipment_record.id IS NULL OR operator_record.id IS NULL
    OR nullif(btrim(rental_record.customer_snapshot), '') IS NULL
    OR target.equipment_id IS DISTINCT FROM line_record.equipment_id
    OR target.operator_id IS DISTINCT FROM line_record.operator_id
    OR target.status <> 'Acknowledged'
    OR target.superseded_by_revision_id IS NOT NULL
    OR starts <> 1 OR ends <> 1 OR start_at IS NULL OR end_at IS NULL
    OR end_at < start_at OR decisions <> 1
    OR decision.action IS DISTINCT FROM 'ACKNOWLEDGE'
  THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'companyName', company_record.name,
    'customerName', rental_record.customer_snapshot,
    'rentalReference', rental_record.rental_number,
    'project', coalesce(project_record.name, rental_record.project_snapshot),
    'equipment', equipment_record.equipment_name,
    'assetNumber', equipment_record.asset_no,
    'operator', operator_record.name,
    'workDate', target.work_date,
    'shift', target.shift,
    'shiftStart', start_at,
    'shiftEnd', end_at,
    'submittedRevision', concat(coalesce(target.deur_number, 'DEUR'), ' R', coalesce(target.revision_number, 1)),
    'operationMinutes', target.total_operating_minutes,
    'idleMinutes', target.total_idle_minutes,
    'standbyMinutes', target.total_standby_minutes,
    'breakdownMinutes', target.total_maintenance_minutes,
    'openingMeter', target.opening_meter,
    'closingMeter', target.closing_meter,
    'timeline', timeline,
    'customerDecision', jsonb_build_object(
      'action', decision.action,
      'occurredAt', decision.occurred_at
    ),
    'billingEligible', NOT target.billing_locked
  );
END;
$$;

ALTER FUNCTION erp.build_manager_review_evidence(text, text, text, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.build_manager_review_evidence(text, text, text, text)
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION erp.build_manager_review_evidence(text, text, text, text) IS
  'Builds immutable Manager Review identity, acknowledgement, totals, shift, and canonically ordered completed DEUR event evidence for the exact tenant, rental line, and effective revision.';

COMMIT;
