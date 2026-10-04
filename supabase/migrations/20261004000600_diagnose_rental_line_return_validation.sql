BEGIN;

-- Keep the canonical return guards unchanged while making their first failing
-- branch observable.  This is a function-only forward migration: it does not
-- alter rental, line, assignment, equipment, DEUR, billing, or audit data.
-- The ISO date expression intentionally uses a single PostgreSQL regex escape.
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
    RETURN jsonb_build_object('success', false, 'code', 'FORBIDDEN', 'retryable', false, 'refreshRequired', false);
  END IF;

  IF command->>'actualReturnDate' IS NULL OR command->>'actualReturnDate' !~ '^\d{4}-\d{2}-\d{2}$' THEN
    RETURN jsonb_build_object('success', false, 'code', 'VALIDATION_REJECTED', 'reasonCode', 'INVALID_RETURN_DATE', 'retryable', false, 'refreshRequired', false);
  END IF;
  BEGIN
    return_business_date = (command->>'actualReturnDate')::date;
  EXCEPTION WHEN others THEN
    RETURN jsonb_build_object('success', false, 'code', 'VALIDATION_REJECTED', 'reasonCode', 'INVALID_RETURN_DATE', 'retryable', false, 'refreshRequired', false);
  END;

  SELECT * INTO target_rental
  FROM erp.rentals
  WHERE id = command->>'rentalId' AND company_id = tenant
  FOR UPDATE;
  IF target_rental.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'NOT_FOUND', 'reasonCode', 'RENTAL_NOT_FOUND', 'retryable', false, 'refreshRequired', false);
  END IF;
  IF return_business_date < target_rental.date_out THEN
    RETURN jsonb_build_object('success', false, 'code', 'VALIDATION_REJECTED', 'reasonCode', 'RETURN_DATE_BEFORE_RENTAL_START', 'retryable', false, 'refreshRequired', false);
  END IF;

  SELECT * INTO target_line
  FROM erp.rental_equipment_lines
  WHERE id = command->>'rentalLineId'
    AND rental_id = target_rental.id
    AND company_id = tenant
    AND deleted_at IS NULL
  FOR UPDATE;
  IF target_line.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'VALIDATION_REJECTED', 'reasonCode', 'LINE_NOT_FOUND', 'retryable', false, 'refreshRequired', false);
  END IF;
  IF target_line.equipment_id <> command->>'equipmentId' THEN
    RETURN jsonb_build_object('success', false, 'code', 'VALIDATION_REJECTED', 'reasonCode', 'LINE_EQUIPMENT_MISMATCH', 'retryable', false, 'refreshRequired', false);
  END IF;
  IF target_line.assignment_id IS DISTINCT FROM command->>'assignmentId' THEN
    RETURN jsonb_build_object('success', false, 'code', 'VALIDATION_REJECTED', 'reasonCode', 'LINE_ASSIGNMENT_MISMATCH', 'retryable', false, 'refreshRequired', false);
  END IF;

  idem = erp.begin_operational_command(command, 'RETURN_RENTAL_LINE', 'RENTAL_LINE', target_line.id, tenant, auth.uid()::text);
  IF idem->>'state' = 'INVALID' THEN
    RETURN jsonb_build_object('success', false, 'code', 'VALIDATION_REJECTED', 'reasonCode', 'COMMAND_INVALID', 'retryable', false, 'refreshRequired', false);
  END IF;
  IF idem->>'state' = 'MISMATCH' THEN
    RETURN jsonb_build_object('success', false, 'code', 'IDEMPOTENCY_MISMATCH', 'retryable', false, 'refreshRequired', false);
  END IF;
  IF idem->>'state' = 'REPLAY' THEN
    RETURN (idem->'response') || jsonb_build_object('disposition', 'REPLAYED');
  END IF;
  payload_hash = idem->>'payloadHash';

  IF NOT erp.rental_parent_is_mutable(target_rental.status, target_rental.canonical_parent_status) THEN
    RETURN jsonb_build_object('success', false, 'code', 'PARENT_READ_ONLY', 'retryable', false, 'refreshRequired', false);
  END IF;
  IF target_line.row_version <> coalesce((command->>'expectedVersion')::bigint, target_line.row_version) THEN
    RETURN jsonb_build_object('success', false, 'code', 'CONFLICT', 'reasonCode', 'VERSION_MISMATCH', 'currentVersion', target_line.row_version, 'retryable', false, 'refreshRequired', true);
  END IF;
  IF coalesce(target_line.canonical_line_status::text, target_line.status::text) = 'Returned' THEN
    IF target_line.actual_return_date IS DISTINCT FROM return_business_date THEN
      RETURN jsonb_build_object('success', false, 'code', 'CONFLICT', 'reasonCode', 'RETURN_DATE_CONFLICT', 'retryable', false, 'refreshRequired', true, 'currentVersion', target_line.row_version);
    END IF;
    response = jsonb_build_object('success', true, 'disposition', 'ALREADY_COMPLETED', 'serverOccurredAt', now_at, 'refresh', jsonb_build_array(target_rental.id, target_line.id, target_line.equipment_id, target_line.assignment_id), 'value', jsonb_build_object('rentalId', target_rental.id, 'rentalLineId', target_line.id, 'status', target_line.status, 'version', target_line.row_version, 'actualReturnDate', target_line.actual_return_date));
    RETURN erp.finish_operational_command(command, 'RETURN_RENTAL_LINE', 'RENTAL_LINE', target_line.id, tenant, auth.uid()::text, payload_hash, response, target_line.row_version);
  END IF;
  IF coalesce(target_line.canonical_line_status::text, target_line.status::text) <> 'Active' THEN
    RETURN jsonb_build_object('success', false, 'code', 'INVALID_TRANSITION', 'reasonCode', 'INVALID_LINE_TRANSITION', 'message', 'Only an Active Rental Equipment Line can be returned.', 'retryable', false, 'refreshRequired', false);
  END IF;
  IF EXISTS (
    SELECT 1 FROM erp.deurs deur
    WHERE deur.rental_equipment_line_id = target_line.id
      AND deur.status IN ('Draft', 'In Progress', 'Submitted', 'Pending Acknowledgement', 'Rejected')
  ) THEN
    RETURN jsonb_build_object('success', false, 'code', 'INVALID_TRANSITION', 'reasonCode', 'OPEN_DEUR_WORK', 'retryable', false, 'refreshRequired', false);
  END IF;
  SELECT id INTO available_status
  FROM erp.equipment_statuses
  WHERE lower(code) = 'available'
  ORDER BY id
  LIMIT 1;
  IF available_status IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'PERSISTENCE_FAILURE', 'reasonCode', 'AVAILABLE_EQUIPMENT_STATUS_MISSING', 'retryable', false, 'refreshRequired', true);
  END IF;

  UPDATE erp.rental_equipment_lines
  SET status = 'Returned', canonical_line_status = 'Returned', actual_return_date = return_business_date
  WHERE id = target_line.id
  RETURNING * INTO target_line;
  UPDATE erp.equipment
  SET status_id = available_status, project_id = NULL, operator_id = NULL
  WHERE id = target_line.equipment_id AND company_id = tenant;
  UPDATE erp.assignments
  SET status = 'Completed', returned_date = return_business_date
  WHERE id = target_line.assignment_id AND company_id = tenant AND status = 'Active';
  INSERT INTO erp.audit_log(id, company_id, aggregate_type, aggregate_id, action, actor_id, occurred_at, correlation_id, new_values)
  VALUES(extensions.gen_random_uuid()::text, tenant, 'RentalEquipmentLine', target_line.id, 'RETURN_RENTAL_LINE', auth.uid()::text, now_at, command->>'commandId', jsonb_build_object('rentalId', target_rental.id, 'status', 'Returned', 'version', target_line.row_version, 'actualReturnDate', target_line.actual_return_date));
  response = jsonb_build_object('success', true, 'disposition', 'ACCEPTED', 'serverOccurredAt', now_at, 'refresh', jsonb_build_array(target_rental.id, target_line.id, target_line.equipment_id, target_line.assignment_id), 'value', jsonb_build_object('rentalId', target_rental.id, 'rentalLineId', target_line.id, 'status', target_line.status, 'version', target_line.row_version, 'actualReturnDate', target_line.actual_return_date));
  RETURN erp.finish_operational_command(command, 'RETURN_RENTAL_LINE', 'RENTAL_LINE', target_line.id, tenant, auth.uid()::text, payload_hash, response, target_line.row_version);
END;
$$;

ALTER FUNCTION erp.command_return_rental_line(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.command_return_rental_line(jsonb) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION erp.command_return_rental_line(jsonb) TO authenticated;

COMMIT;
