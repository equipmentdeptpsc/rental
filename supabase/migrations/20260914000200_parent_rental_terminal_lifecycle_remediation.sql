BEGIN;

SET LOCAL search_path = erp, auth, extensions, pg_catalog;

-- The legacy status remains readable for compatibility.  This helper prevents all
-- new operational writes to canonical terminal parents and historical Returned parents.
CREATE OR REPLACE FUNCTION erp.rental_parent_is_mutable(
  legacy_status erp.rental_status,
  canonical_status erp.rental_parent_status
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT legacy_status NOT IN ('Cancelled', 'Closed', 'Returned')
    AND coalesce(canonical_status::text, legacy_status::text) NOT IN ('Cancelled', 'Closed');
$$;

CREATE OR REPLACE FUNCTION erp.get_rental_closure_readiness(command jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = erp, auth, extensions, pg_catalog
AS $$
DECLARE
  tenant text = erp.current_company_id();
  target_rental_id text = command->>'rentalId';
  blockers jsonb;
BEGIN
  IF tenant IS NULL OR NOT EXISTS (
    SELECT 1 FROM erp.rentals r WHERE r.id = target_rental_id AND r.company_id = tenant
  ) THEN
    RETURN jsonb_build_object('success', false, 'code', 'NOT_FOUND');
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'code', blocker.code,
    'message', blocker.message,
    'rentalLineId', blocker.line_id,
    'deurId', blocker.deur_id
  )), '[]'::jsonb)
  INTO blockers
  FROM (
    SELECT
      'LINE_NOT_FINAL'::text AS code,
      'Equipment line must be Returned or Cancelled before Rental Close.'::text AS message,
      line.id AS line_id,
      NULL::text AS deur_id
    FROM erp.rental_equipment_lines line
    WHERE line.rental_id = target_rental_id
      AND line.company_id = tenant
      AND line.deleted_at IS NULL
      AND coalesce(line.canonical_line_status::text, line.status::text) NOT IN ('Returned', 'Cancelled')
      AND NOT (line.canonical_line_status IS NULL AND line.status = 'Closed')

    UNION ALL

    SELECT
      'ASSIGNMENT_ACTIVE',
      'Equipment assignment is still active.',
      line.id,
      NULL::text
    FROM erp.rental_equipment_lines line
    JOIN erp.assignments assignment_row
      ON assignment_row.id = line.assignment_id
      AND assignment_row.company_id = line.company_id
    WHERE line.rental_id = target_rental_id
      AND line.company_id = tenant
      AND line.deleted_at IS NULL
      AND assignment_row.status = 'Active'

    UNION ALL

    SELECT
      'DEUR_INCOMPLETE',
      'Daily operations are not finalized.',
      deur.rental_equipment_line_id,
      deur.id
    FROM erp.deurs deur
    WHERE deur.rental_id = target_rental_id
      AND deur.company_id = tenant
      AND deur.status IN ('Draft', 'In Progress', 'Submitted', 'Pending Acknowledgement', 'Rejected')

    UNION ALL

    SELECT
      'DEUR_BILLING_UNRESOLVED',
      'A DEUR remains eligible for billing.',
      deur.rental_equipment_line_id,
      deur.id
    FROM erp.deurs deur
    CROSS JOIN LATERAL erp.calculate_deur_billing_evidence(deur.id, tenant) AS billing_evidence
    WHERE deur.rental_id = target_rental_id
      AND deur.company_id = tenant
      AND coalesce((billing_evidence->>'success')::boolean, false)
  ) AS blocker;

  RETURN jsonb_build_object(
    'success', true,
    'disposition', 'ACCEPTED',
    'serverOccurredAt', clock_timestamp(),
    'refresh', '[]'::jsonb,
    'value', jsonb_build_object(
      'rentalId', target_rental_id,
      'ready', jsonb_array_length(blockers) = 0,
      'lines', '[]'::jsonb,
      'blockers', blockers
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION erp.command_return_rental_line(command jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = erp, auth, extensions, pg_catalog
AS $$
DECLARE
  tenant text = erp.current_company_id();
  target_rental erp.rentals%ROWTYPE;
  target_line erp.rental_equipment_lines%ROWTYPE;
  available_status text;
  now_at timestamptz = clock_timestamp();
  idem jsonb;
  payload_hash text;
  response jsonb;
  return_business_date date;
BEGIN
  IF tenant IS NULL OR NOT erp.current_user_has_permission('rental.return') THEN
    RETURN jsonb_build_object('success', false, 'code', 'FORBIDDEN', 'message', 'Rental return is not authorized.', 'retryable', false, 'refreshRequired', false);
  END IF;
  IF command->>'actualReturnDate' IS NULL OR command->>'actualReturnDate' !~ '^\\d{4}-\\d{2}-\\d{2}$' THEN
    RETURN jsonb_build_object('success', false, 'code', 'VALIDATION_REJECTED', 'message', 'An explicit Return business date is required.', 'retryable', false, 'refreshRequired', false);
  END IF;
  BEGIN
    return_business_date = (command->>'actualReturnDate')::date;
  EXCEPTION WHEN others THEN
    RETURN jsonb_build_object('success', false, 'code', 'VALIDATION_REJECTED', 'message', 'Return business date is invalid.', 'retryable', false, 'refreshRequired', false);
  END;

  SELECT r.* INTO target_rental
  FROM erp.rentals r
  WHERE r.id = command->>'rentalId' AND r.company_id = tenant
  FOR UPDATE;
  IF target_rental.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'NOT_FOUND', 'message', 'Rental was not found.', 'retryable', false, 'refreshRequired', false);
  END IF;
  IF return_business_date < target_rental.date_out THEN
    RETURN jsonb_build_object('success', false, 'code', 'VALIDATION_REJECTED', 'message', 'Return business date cannot be before Rental start.', 'retryable', false, 'refreshRequired', false);
  END IF;

  SELECT line.* INTO target_line
  FROM erp.rental_equipment_lines line
  WHERE line.id = command->>'rentalLineId'
    AND line.rental_id = target_rental.id
    AND line.company_id = tenant
    AND line.deleted_at IS NULL
  FOR UPDATE;
  IF target_line.id IS NULL
    OR target_line.equipment_id <> command->>'equipmentId'
    OR target_line.assignment_id IS DISTINCT FROM command->>'assignmentId'
  THEN
    RETURN jsonb_build_object('success', false, 'code', 'VALIDATION_REJECTED', 'message', 'Rental Equipment Line does not match the canonical return target.', 'retryable', false, 'refreshRequired', false);
  END IF;

  idem = erp.begin_operational_command(command, 'RETURN_RENTAL_LINE', 'RENTAL_LINE', target_line.id, tenant, auth.uid()::text);
  IF idem->>'state' = 'INVALID' THEN RETURN jsonb_build_object('success', false, 'code', 'VALIDATION_REJECTED', 'message', 'Return command is invalid.', 'retryable', false, 'refreshRequired', false); END IF;
  IF idem->>'state' = 'MISMATCH' THEN RETURN jsonb_build_object('success', false, 'code', 'IDEMPOTENCY_MISMATCH', 'message', 'Idempotency key payload mismatch.', 'retryable', false, 'refreshRequired', false); END IF;
  IF idem->>'state' = 'REPLAY' THEN RETURN (idem->'response') || jsonb_build_object('disposition', 'REPLAYED'); END IF;
  payload_hash = idem->>'payloadHash';

  IF NOT erp.rental_parent_is_mutable(target_rental.status, target_rental.canonical_parent_status) THEN
    RETURN jsonb_build_object('success', false, 'code', 'PARENT_READ_ONLY', 'message', 'Cancelled, Closed, and historical Returned Rentals are read-only.', 'retryable', false, 'refreshRequired', false);
  END IF;
  IF target_line.row_version <> coalesce((command->>'expectedVersion')::bigint, target_line.row_version) THEN
    RETURN jsonb_build_object('success', false, 'code', 'CONFLICT', 'message', 'Rental Equipment Line version is stale.', 'retryable', false, 'refreshRequired', true, 'currentVersion', target_line.row_version);
  END IF;
  IF coalesce(target_line.canonical_line_status::text, target_line.status::text) = 'Returned' THEN
    IF target_line.actual_return_date IS DISTINCT FROM return_business_date THEN
      RETURN jsonb_build_object('success', false, 'code', 'CONFLICT', 'message', 'Authoritative Return business date is already recorded and cannot be overwritten.', 'retryable', false, 'refreshRequired', true, 'currentVersion', target_line.row_version);
    END IF;
    response = jsonb_build_object('success', true, 'disposition', 'ALREADY_COMPLETED', 'serverOccurredAt', now_at,
      'refresh', jsonb_build_array(target_rental.id, target_line.id, target_line.equipment_id, target_line.assignment_id),
      'value', jsonb_build_object('rentalId', target_rental.id, 'rentalLineId', target_line.id, 'status', target_line.status, 'version', target_line.row_version, 'actualReturnDate', target_line.actual_return_date));
    RETURN erp.finish_operational_command(command, 'RETURN_RENTAL_LINE', 'RENTAL_LINE', target_line.id, tenant, auth.uid()::text, payload_hash, response, target_line.row_version);
  END IF;
  IF coalesce(target_line.canonical_line_status::text, target_line.status::text) IN ('Closed', 'Cancelled') THEN
    RETURN jsonb_build_object('success', false, 'code', 'INVALID_TRANSITION', 'message', 'Final Rental Equipment Lines cannot be returned.', 'retryable', false, 'refreshRequired', false);
  END IF;
  IF EXISTS (
    SELECT 1 FROM erp.deurs d
    WHERE d.rental_equipment_line_id = target_line.id
      AND d.status IN ('Draft', 'In Progress', 'Submitted', 'Pending Acknowledgement', 'Rejected')
  ) THEN
    RETURN jsonb_build_object('success', false, 'code', 'INVALID_TRANSITION', 'message', 'Open DEUR work must be completed before Return.', 'retryable', false, 'refreshRequired', false);
  END IF;

  SELECT es.id INTO available_status FROM erp.equipment_statuses es WHERE lower(es.code) = 'available' ORDER BY es.id LIMIT 1;
  IF available_status IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'PERSISTENCE_FAILURE', 'message', 'Available Equipment status is unavailable.', 'retryable', false, 'refreshRequired', true);
  END IF;
  UPDATE erp.rental_equipment_lines line
  SET status = 'Returned', canonical_line_status = 'Returned', actual_return_date = return_business_date
  WHERE line.id = target_line.id
  RETURNING line.* INTO target_line;
  UPDATE erp.equipment equipment_row
  SET status_id = available_status, project_id = NULL, operator_id = NULL
  WHERE equipment_row.id = target_line.equipment_id AND equipment_row.company_id = tenant;
  UPDATE erp.assignments assignment_row
  SET status = 'Completed', returned_date = return_business_date
  WHERE assignment_row.id = target_line.assignment_id
    AND assignment_row.company_id = tenant
    AND assignment_row.status = 'Active';

  -- Return changes one equipment line only.  Parent status is intentionally untouched.
  response = jsonb_build_object('success', true, 'disposition', 'ACCEPTED', 'serverOccurredAt', now_at,
    'refresh', jsonb_build_array(target_rental.id, target_line.id, target_line.equipment_id, target_line.assignment_id),
    'value', jsonb_build_object('rentalId', target_rental.id, 'rentalLineId', target_line.id, 'status', target_line.status, 'version', target_line.row_version, 'actualReturnDate', target_line.actual_return_date));
  RETURN erp.finish_operational_command(command, 'RETURN_RENTAL_LINE', 'RENTAL_LINE', target_line.id, tenant, auth.uid()::text, payload_hash, response, target_line.row_version);
END;
$$;

CREATE OR REPLACE FUNCTION erp.command_return_all_rental_lines(command jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = erp, auth, extensions, pg_catalog
AS $$
DECLARE
  tenant text = erp.current_company_id();
  target erp.rentals%ROWTYPE;
  line erp.rental_equipment_lines%ROWTYPE;
  outcomes jsonb = '[]'::jsonb;
  result jsonb;
  readiness jsonb;
  idem jsonb;
  payload_hash text;
  response jsonb;
BEGIN
  IF tenant IS NULL OR NOT erp.current_user_has_permission('rental.return') THEN RETURN jsonb_build_object('success', false, 'code', 'FORBIDDEN', 'message', 'Rental return is not authorized.', 'retryable', false, 'refreshRequired', false); END IF;
  IF command->>'actualReturnDate' IS NULL OR command->>'actualReturnDate' !~ '^\\d{4}-\\d{2}-\\d{2}$' THEN RETURN jsonb_build_object('success', false, 'code', 'VALIDATION_REJECTED', 'message', 'An explicit Return business date is required.', 'retryable', false, 'refreshRequired', false); END IF;
  SELECT * INTO target FROM erp.rentals WHERE id = command->>'rentalId' AND company_id = tenant FOR UPDATE;
  IF target.id IS NULL THEN RETURN jsonb_build_object('success', false, 'code', 'NOT_FOUND', 'message', 'Rental was not found.', 'retryable', false, 'refreshRequired', false); END IF;
  PERFORM 1 FROM erp.rental_equipment_lines WHERE rental_id = target.id AND company_id = tenant FOR UPDATE;
  idem = erp.begin_operational_command(command, 'RETURN_ALL_RENTAL_LINES', 'RENTAL', target.id, tenant, auth.uid()::text);
  IF idem->>'state' = 'INVALID' THEN RETURN jsonb_build_object('success', false, 'code', 'VALIDATION_REJECTED', 'message', 'Return command is invalid.', 'retryable', false, 'refreshRequired', false); END IF;
  IF idem->>'state' = 'MISMATCH' THEN RETURN jsonb_build_object('success', false, 'code', 'IDEMPOTENCY_MISMATCH', 'message', 'Idempotency key payload mismatch.', 'retryable', false, 'refreshRequired', false); END IF;
  IF idem->>'state' = 'REPLAY' THEN RETURN (idem->'response') || jsonb_build_object('disposition', 'REPLAYED'); END IF;
  payload_hash = idem->>'payloadHash';
  IF NOT erp.rental_parent_is_mutable(target.status, target.canonical_parent_status) THEN RETURN jsonb_build_object('success', false, 'code', 'PARENT_READ_ONLY', 'retryable', false, 'refreshRequired', false); END IF;
  IF target.row_version <> coalesce((command->>'expectedVersion')::bigint, target.row_version) THEN RETURN jsonb_build_object('success', false, 'code', 'CONFLICT', 'message', 'Rental version is stale.', 'retryable', false, 'refreshRequired', true, 'currentVersion', target.row_version); END IF;
  IF coalesce(target.canonical_parent_status::text, target.status::text) <> 'Active' THEN RETURN jsonb_build_object('success', false, 'code', 'INVALID_TRANSITION', 'message', 'Only an Active Rental can return equipment.', 'retryable', false, 'refreshRequired', false); END IF;
  readiness = erp.get_rental_return_readiness(jsonb_build_object('rentalId', target.id));
  IF readiness->'value'->>'ready' <> 'true' THEN RETURN jsonb_build_object('success', false, 'code', 'INVALID_TRANSITION', 'message', 'Required historical DEUR expectations must be acknowledged or waived before Return.', 'retryable', false, 'refreshRequired', false); END IF;
  IF EXISTS (SELECT 1 FROM erp.deurs WHERE rental_id = target.id AND company_id = tenant AND status IN ('Draft', 'In Progress', 'Submitted', 'Pending Acknowledgement', 'Rejected')) THEN RETURN jsonb_build_object('success', false, 'code', 'INVALID_TRANSITION', 'message', 'Open DEUR work must be completed before Return.', 'retryable', false, 'refreshRequired', false); END IF;
  FOR line IN SELECT * FROM erp.rental_equipment_lines WHERE rental_id = target.id AND company_id = tenant AND deleted_at IS NULL ORDER BY id LOOP
    IF coalesce(line.canonical_line_status::text, line.status::text) NOT IN ('Returned', 'Closed', 'Cancelled') THEN
      SELECT erp.command_return_rental_line(command || jsonb_build_object('commandId', (command->>'commandId') || ':' || line.id, 'idempotencyKey', (command->>'idempotencyKey') || ':line:' || line.id, 'rentalLineId', line.id, 'equipmentId', line.equipment_id, 'assignmentId', line.assignment_id, 'expectedVersion', line.row_version, 'actualReturnDate', command->>'actualReturnDate')) INTO result;
      IF NOT coalesce((result->>'success')::boolean, false) THEN RAISE EXCEPTION 'Atomic return blocked'; END IF;
    END IF;
    outcomes = outcomes || jsonb_build_array(jsonb_build_object('rentalId', line.rental_id, 'rentalLineId', line.id, 'status', coalesce(line.canonical_line_status::text, line.status::text), 'actualReturnDate', command->>'actualReturnDate'));
  END LOOP;
  response = jsonb_build_object('success', true, 'disposition', 'ACCEPTED', 'serverOccurredAt', clock_timestamp(), 'refresh', jsonb_build_array(target.id), 'value', jsonb_build_object('rentalId', target.id, 'lines', outcomes, 'version', target.row_version));
  RETURN erp.finish_operational_command(command, 'RETURN_ALL_RENTAL_LINES', 'RENTAL', target.id, tenant, auth.uid()::text, payload_hash, response, target.row_version);
END;
$$;

CREATE OR REPLACE FUNCTION erp.command_cancel_rental(command jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = erp, auth, extensions, pg_catalog
AS $$
DECLARE
  tenant text = erp.current_company_id();
  actor text = auth.uid()::text;
  target erp.rentals%ROWTYPE;
  line erp.rental_equipment_lines%ROWTYPE;
  idem jsonb;
  payload_hash text;
  response jsonb;
  now_at timestamptz = clock_timestamp();
  prior_status text;
BEGIN
  IF tenant IS NULL OR NOT erp.current_user_has_permission('rental.update') THEN
    RETURN jsonb_build_object('success', false, 'code', 'FORBIDDEN', 'message', 'Rental cancellation is not authorized.', 'retryable', false, 'refreshRequired', false);
  END IF;
  SELECT * INTO target FROM erp.rentals WHERE id = command->>'rentalId' AND company_id = tenant FOR UPDATE;
  IF target.id IS NULL THEN RETURN jsonb_build_object('success', false, 'code', 'NOT_FOUND', 'message', 'Rental was not found.', 'retryable', false, 'refreshRequired', false); END IF;
  PERFORM 1 FROM erp.rental_equipment_lines WHERE rental_id = target.id AND company_id = tenant FOR UPDATE;
  idem = erp.begin_operational_command(command, 'CANCEL_RENTAL', 'RENTAL', target.id, tenant, actor);
  IF idem->>'state' = 'INVALID' THEN RETURN jsonb_build_object('success', false, 'code', 'VALIDATION_REJECTED', 'message', 'An idempotency key is required.', 'retryable', false, 'refreshRequired', false); END IF;
  IF idem->>'state' = 'MISMATCH' THEN RETURN jsonb_build_object('success', false, 'code', 'IDEMPOTENCY_MISMATCH', 'message', 'Idempotency key payload mismatch.', 'retryable', false, 'refreshRequired', false); END IF;
  IF idem->>'state' = 'REPLAY' THEN RETURN (idem->'response') || jsonb_build_object('disposition', 'REPLAYED'); END IF;
  payload_hash = idem->>'payloadHash';
  IF NOT erp.rental_parent_is_mutable(target.status, target.canonical_parent_status) THEN RETURN jsonb_build_object('success', false, 'code', 'PARENT_READ_ONLY', 'message', 'Cancelled, Closed, and historical Returned Rentals are read-only.', 'retryable', false, 'refreshRequired', false); END IF;
  IF target.row_version <> coalesce((command->>'expectedVersion')::bigint, target.row_version) THEN RETURN jsonb_build_object('success', false, 'code', 'CONFLICT', 'message', 'Rental version is stale.', 'retryable', false, 'refreshRequired', true, 'currentVersion', target.row_version); END IF;
  IF coalesce(target.canonical_parent_status::text, target.status::text) NOT IN ('Draft', 'Assigned', 'Reserved', 'Released', 'Active') THEN RETURN jsonb_build_object('success', false, 'code', 'INVALID_TRANSITION', 'message', 'Rental cancellation is not allowed from this lifecycle state.', 'retryable', false, 'refreshRequired', false); END IF;
  IF EXISTS (SELECT 1 FROM erp.rental_equipment_lines line WHERE line.rental_id = target.id AND line.company_id = tenant AND line.deleted_at IS NULL AND coalesce(line.canonical_line_status::text, line.status::text) = 'Active') THEN RETURN jsonb_build_object('success', false, 'code', 'PARENT_CANCEL_ACTIVE_EQUIPMENT', 'message', 'Active equipment must leave Active before parent cancellation.', 'retryable', false, 'refreshRequired', false); END IF;
  IF EXISTS (
    SELECT 1
    FROM erp.deurs deur
    CROSS JOIN LATERAL erp.calculate_deur_billing_evidence(deur.id, tenant) AS billing_evidence
    WHERE deur.rental_id = target.id
      AND deur.company_id = tenant
      AND coalesce((billing_evidence->>'success')::boolean, false)
  ) THEN
    RETURN jsonb_build_object('success', false, 'code', 'PARENT_CANCEL_BILLABLE_DEUR', 'message', 'Billing-eligible DEUR evidence prevents parent cancellation.', 'retryable', false, 'refreshRequired', false);
  END IF;

  prior_status = target.status::text;
  UPDATE erp.rental_equipment_lines line
  SET status = 'Cancelled', canonical_line_status = 'Cancelled', updated_by = actor
  WHERE line.rental_id = target.id
    AND line.company_id = tenant
    AND line.deleted_at IS NULL
    AND coalesce(line.canonical_line_status::text, line.status::text) IN ('Draft', 'Assigned', 'Reserved', 'Released');
  UPDATE erp.rentals
  SET status = 'Cancelled', canonical_parent_status = 'Cancelled', cancelled_at = now_at, updated_by = actor
  WHERE id = target.id
  RETURNING * INTO target;

  FOR line IN SELECT * FROM erp.rental_equipment_lines WHERE rental_id = target.id AND company_id = tenant AND deleted_at IS NULL ORDER BY equipment_id LOOP
    UPDATE erp.equipment equipment_row
    SET status_id = coalesce((SELECT id FROM erp.equipment_statuses WHERE lower(code) = CASE WHEN EXISTS (SELECT 1 FROM erp.assignments assignment_row WHERE assignment_row.id = line.assignment_id AND assignment_row.status = 'Active') THEN 'assigned' ELSE 'available' END LIMIT 1), equipment_row.status_id),
        project_id = CASE WHEN EXISTS (SELECT 1 FROM erp.assignments assignment_row WHERE assignment_row.id = line.assignment_id AND assignment_row.status = 'Active') THEN (SELECT project_id FROM erp.assignments WHERE id = line.assignment_id) ELSE NULL END,
        operator_id = CASE WHEN EXISTS (SELECT 1 FROM erp.assignments assignment_row WHERE assignment_row.id = line.assignment_id AND assignment_row.status = 'Active') THEN line.operator_id ELSE NULL END,
        updated_by = actor
    WHERE equipment_row.id = line.equipment_id
      AND equipment_row.company_id = tenant
      AND NOT EXISTS (
        SELECT 1
        FROM erp.rental_equipment_lines other_line
        JOIN erp.rentals other_rental ON other_rental.id = other_line.rental_id
        WHERE other_line.equipment_id = equipment_row.id
          AND other_line.deleted_at IS NULL
          AND other_rental.id <> target.id
          AND coalesce(other_rental.canonical_parent_status::text, other_rental.status::text) IN ('Draft', 'Reserved', 'Released', 'Active')
      );
  END LOOP;

  INSERT INTO erp.audit_log(id, aggregate_type, aggregate_id, action, actor_id, occurred_at, correlation_id, previous_values, new_values, metadata, company_id)
  VALUES (extensions.gen_random_uuid()::text, 'Rental', target.id, 'CANCEL_RENTAL', actor, now_at, command->>'commandId',
    jsonb_build_object('status', prior_status), jsonb_build_object('status', 'Cancelled', 'canonicalParentStatus', 'Cancelled', 'version', target.row_version),
    jsonb_build_object('source', 'parent_lifecycle_remediation'), tenant);
  response = jsonb_build_object('success', true, 'disposition', 'ACCEPTED', 'serverOccurredAt', now_at, 'refresh', jsonb_build_array(target.id),
    'value', jsonb_build_object('rentalId', target.id, 'rentalNumber', target.rental_number, 'status', target.status, 'version', target.row_version));
  RETURN erp.finish_operational_command(command, 'CANCEL_RENTAL', 'RENTAL', target.id, tenant, actor, payload_hash, response, target.row_version);
END;
$$;

CREATE OR REPLACE FUNCTION erp.command_close_rental(command jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = erp, auth, extensions, pg_catalog
AS $$
DECLARE
  tenant text = erp.current_company_id();
  target erp.rentals%ROWTYPE;
  readiness jsonb;
  now_at timestamptz = clock_timestamp();
  idem jsonb;
  payload_hash text;
  response jsonb;
BEGIN
  IF tenant IS NULL OR NOT erp.current_user_has_permission('rental.close') THEN RETURN jsonb_build_object('success', false, 'code', 'FORBIDDEN'); END IF;
  SELECT * INTO target FROM erp.rentals WHERE id = command->>'rentalId' AND company_id = tenant FOR UPDATE;
  IF target.id IS NULL THEN RETURN jsonb_build_object('success', false, 'code', 'NOT_FOUND'); END IF;
  idem = erp.begin_operational_command(command, 'CLOSE_RENTAL', 'RENTAL', target.id, tenant, auth.uid()::text);
  IF idem->>'state' = 'MISMATCH' THEN RETURN jsonb_build_object('success', false, 'code', 'IDEMPOTENCY_MISMATCH', 'message', 'Idempotency key payload mismatch.', 'retryable', false, 'refreshRequired', false); END IF;
  IF idem->>'state' = 'REPLAY' THEN RETURN (idem->'response') || jsonb_build_object('disposition', 'REPLAYED'); END IF;
  payload_hash = idem->>'payloadHash';
  IF NOT erp.rental_parent_is_mutable(target.status, target.canonical_parent_status) THEN RETURN jsonb_build_object('success', false, 'code', 'PARENT_READ_ONLY', 'message', 'Cancelled, Closed, and historical Returned Rentals are read-only.', 'retryable', false, 'refreshRequired', false); END IF;
  IF target.row_version <> coalesce((command->>'expectedVersion')::bigint, target.row_version) THEN RETURN jsonb_build_object('success', false, 'code', 'CONFLICT', 'currentVersion', target.row_version, 'refreshRequired', true); END IF;
  IF coalesce(target.canonical_parent_status::text, target.status::text) <> 'Active' THEN RETURN jsonb_build_object('success', false, 'code', 'INVALID_TRANSITION', 'message', 'Only an Active Rental can be closed.', 'retryable', false, 'refreshRequired', false); END IF;
  readiness = erp.get_rental_closure_readiness(command);
  IF NOT coalesce((readiness->'value'->>'ready')::boolean, false) THEN RETURN jsonb_build_object('success', false, 'code', 'INVALID_TRANSITION', 'message', 'Rental is not ready to close.', 'details', readiness->'value'->'blockers', 'retryable', false, 'refreshRequired', false); END IF;

  UPDATE erp.rentals
  SET status = 'Closed', canonical_parent_status = 'Closed', closed_at = now_at, updated_by = auth.uid()::text
  WHERE id = target.id
  RETURNING * INTO target;
  -- Parent Close preserves Returned and Cancelled line history.  It never creates line Closed states.
  INSERT INTO erp.audit_log(id, company_id, aggregate_type, aggregate_id, action, actor_id, occurred_at, correlation_id, new_values)
  VALUES (extensions.gen_random_uuid()::text, tenant, 'RENTAL', target.id, 'CLOSE', auth.uid()::text, now_at, command->>'commandId', jsonb_build_object('status', 'Closed', 'canonicalParentStatus', 'Closed'));
  response = jsonb_build_object('success', true, 'disposition', 'ACCEPTED', 'serverOccurredAt', now_at, 'refresh', jsonb_build_array(target.id),
    'value', jsonb_build_object('rentalId', target.id, 'status', 'Closed', 'version', target.row_version, 'closedAt', target.closed_at));
  RETURN erp.finish_operational_command(command, 'CLOSE_RENTAL', 'RENTAL', target.id, tenant, auth.uid()::text, payload_hash, response, target.row_version);
END;
$$;

ALTER FUNCTION erp.rental_parent_is_mutable(erp.rental_status, erp.rental_parent_status) OWNER TO postgres;
ALTER FUNCTION erp.get_rental_closure_readiness(jsonb) OWNER TO postgres;
ALTER FUNCTION erp.command_return_rental_line(jsonb) OWNER TO postgres;
ALTER FUNCTION erp.command_return_all_rental_lines(jsonb) OWNER TO postgres;
ALTER FUNCTION erp.command_cancel_rental(jsonb) OWNER TO postgres;
ALTER FUNCTION erp.command_close_rental(jsonb) OWNER TO postgres;

REVOKE ALL ON FUNCTION erp.rental_parent_is_mutable(erp.rental_status, erp.rental_parent_status), erp.get_rental_closure_readiness(jsonb), erp.command_return_rental_line(jsonb), erp.command_return_all_rental_lines(jsonb), erp.command_cancel_rental(jsonb), erp.command_close_rental(jsonb) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION erp.get_rental_closure_readiness(jsonb), erp.command_return_rental_line(jsonb), erp.command_return_all_rental_lines(jsonb), erp.command_cancel_rental(jsonb), erp.command_close_rental(jsonb) TO authenticated;

COMMIT;
