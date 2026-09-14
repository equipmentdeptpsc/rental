BEGIN;

SET LOCAL search_path = erp, auth, extensions, pg_catalog;

-- D5B1C deliberately leaves the parent Rental untouched.  Parent status is an
-- engagement-level indicator; a line transition is an operational change to
-- one piece of equipment and must never infer sibling or parent progress.
CREATE OR REPLACE FUNCTION erp.rental_line_release_readiness(
  target_rental_id text,
  target_line_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = erp, auth, extensions, pg_catalog
AS $$
DECLARE
  tenant text = erp.current_company_id();
  target_rental erp.rentals%ROWTYPE;
  target_line erp.rental_equipment_lines%ROWTYPE;
  reasons text[] = ARRAY[]::text[];
BEGIN
  SELECT * INTO target_rental
  FROM erp.rentals
  WHERE id = target_rental_id AND company_id = tenant;
  SELECT * INTO target_line
  FROM erp.rental_equipment_lines
  WHERE id = target_line_id AND rental_id = target_rental_id AND company_id = tenant AND deleted_at IS NULL;

  IF tenant IS NULL OR target_rental.id IS NULL OR target_line.id IS NULL THEN
    RETURN jsonb_build_object('eligible', false, 'reasonCodes', jsonb_build_array('NOT_FOUND'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM erp.assignments assignment_row
    WHERE assignment_row.id = target_line.assignment_id
      AND assignment_row.company_id = tenant
      AND assignment_row.status = 'Active'
      AND assignment_row.equipment_id = target_line.equipment_id
      AND assignment_row.operator_id = target_line.operator_id
      AND assignment_row.project_id = target_rental.project_id
  ) THEN reasons := array_append(reasons, 'assignment'); END IF;
  IF NOT EXISTS (
    SELECT 1 FROM erp.operators operator_row
    WHERE operator_row.id = target_line.operator_id
      AND operator_row.company_id = tenant
      AND operator_row.status = 'Active'
      AND operator_row.deleted_at IS NULL
  ) THEN reasons := array_append(reasons, 'operator'); END IF;
  IF NOT EXISTS (
    SELECT 1 FROM erp.equipment equipment_row
    WHERE equipment_row.id = target_line.equipment_id
      AND equipment_row.company_id = tenant
      AND equipment_row.active
      AND equipment_row.deleted_at IS NULL
  ) THEN reasons := array_append(reasons, 'equipment'); END IF;
  IF NOT EXISTS (
    SELECT 1 FROM erp.projects project_row
    WHERE project_row.id = target_rental.project_id
      AND project_row.company_id = tenant
      AND project_row.status = 'Active'
      AND project_row.deleted_at IS NULL
  ) THEN reasons := array_append(reasons, 'project'); END IF;
  IF NOT (target_line.operational_metadata ? 'draftPreparation') THEN
    reasons := array_append(reasons, 'draftPreparation');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM erp.rental_contracts contract_row
    WHERE contract_row.rental_equipment_line_id = target_line.id
      AND contract_row.rental_id = target_rental.id
      AND contract_row.status = 'Active'
  ) THEN reasons := array_append(reasons, 'billingTerms'); END IF;

  RETURN jsonb_build_object(
    'eligible', cardinality(reasons) = 0,
    'rentalId', target_rental.id,
    'rentalLineId', target_line.id,
    'reasonCodes', to_jsonb(reasons)
  );
END;
$$;

CREATE OR REPLACE FUNCTION erp.command_reserve_rental_line(command jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = erp, auth, extensions, pg_catalog
AS $$
DECLARE
  tenant text = erp.current_company_id();
  actor text = auth.uid()::text;
  target_rental erp.rentals%ROWTYPE;
  target_line erp.rental_equipment_lines%ROWTYPE;
  idem jsonb;
  payload_hash text;
  response jsonb;
  now_at timestamptz = clock_timestamp();
BEGIN
  IF tenant IS NULL OR NOT erp.current_user_has_permission('rental.update') THEN
    RETURN jsonb_build_object('success', false, 'code', 'FORBIDDEN', 'message', 'Rental line reservation is not authorized.', 'retryable', false, 'refreshRequired', false);
  END IF;
  SELECT * INTO target_rental FROM erp.rentals
  WHERE id = command->>'rentalId' AND company_id = tenant FOR UPDATE;
  IF target_rental.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'NOT_FOUND', 'retryable', false, 'refreshRequired', false);
  END IF;
  SELECT * INTO target_line FROM erp.rental_equipment_lines
  WHERE id = command->>'rentalLineId' AND rental_id = target_rental.id
    AND company_id = tenant AND deleted_at IS NULL FOR UPDATE;
  IF target_line.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'NOT_FOUND', 'message', 'Rental Equipment Line was not found.', 'retryable', false, 'refreshRequired', false);
  END IF;
  idem = erp.begin_operational_command(command, 'RESERVE_RENTAL_LINE', 'RENTAL_LINE', target_line.id, tenant, actor);
  IF idem->>'state' = 'INVALID' THEN RETURN jsonb_build_object('success', false, 'code', 'VALIDATION_REJECTED', 'retryable', false, 'refreshRequired', false); END IF;
  IF idem->>'state' = 'MISMATCH' THEN RETURN jsonb_build_object('success', false, 'code', 'IDEMPOTENCY_MISMATCH', 'retryable', false, 'refreshRequired', false); END IF;
  IF idem->>'state' = 'REPLAY' THEN RETURN (idem->'response') || jsonb_build_object('disposition', 'REPLAYED'); END IF;
  payload_hash = idem->>'payloadHash';
  IF NOT erp.rental_parent_is_mutable(target_rental.status, target_rental.canonical_parent_status) THEN
    RETURN jsonb_build_object('success', false, 'code', 'PARENT_READ_ONLY', 'retryable', false, 'refreshRequired', false);
  END IF;
  IF target_line.row_version <> coalesce((command->>'expectedVersion')::bigint, target_line.row_version) THEN
    RETURN jsonb_build_object('success', false, 'code', 'CONFLICT', 'currentVersion', target_line.row_version, 'retryable', false, 'refreshRequired', true);
  END IF;
  IF coalesce(target_line.canonical_line_status::text, target_line.status::text) <> 'Draft' THEN
    RETURN jsonb_build_object('success', false, 'code', 'INVALID_TRANSITION', 'message', 'Only a Draft Rental Equipment Line can be reserved.', 'retryable', false, 'refreshRequired', false);
  END IF;
  IF NOT (target_line.operational_metadata ? 'draftPreparation')
    OR NOT EXISTS (
      SELECT 1 FROM erp.assignments assignment_row
      JOIN erp.equipment equipment_row ON equipment_row.id = target_line.equipment_id AND equipment_row.company_id = tenant
      JOIN erp.operators operator_row ON operator_row.id = target_line.operator_id AND operator_row.company_id = tenant
      WHERE assignment_row.id = target_line.assignment_id AND assignment_row.company_id = tenant
        AND assignment_row.status = 'Active' AND assignment_row.equipment_id = target_line.equipment_id
        AND assignment_row.operator_id = target_line.operator_id AND assignment_row.project_id = target_rental.project_id
        AND equipment_row.active AND equipment_row.deleted_at IS NULL
        AND operator_row.status = 'Active' AND operator_row.deleted_at IS NULL
    ) OR NOT EXISTS (
      SELECT 1 FROM erp.rental_contracts contract_row
      WHERE contract_row.rental_equipment_line_id = target_line.id
        AND contract_row.rental_id = target_rental.id AND contract_row.status = 'Draft'
    ) THEN
    RETURN jsonb_build_object('success', false, 'code', 'MISSING_RELATIONSHIP', 'message', 'Selected Rental Equipment Line is not ready for reservation.', 'retryable', false, 'refreshRequired', false);
  END IF;

  UPDATE erp.rental_equipment_lines
  SET status = 'Reserved', canonical_line_status = 'Reserved', commercial_snapshot_required = true, updated_by = actor
  WHERE id = target_line.id
  RETURNING * INTO target_line;
  UPDATE erp.rental_contracts
  SET status = 'Active', updated_by = actor
  WHERE rental_equipment_line_id = target_line.id AND rental_id = target_rental.id AND status = 'Draft';
  INSERT INTO erp.audit_log(id, company_id, aggregate_type, aggregate_id, action, actor_id, occurred_at, correlation_id, new_values)
  VALUES(extensions.gen_random_uuid()::text, tenant, 'RentalEquipmentLine', target_line.id, 'RESERVE_RENTAL_LINE', actor, now_at, command->>'commandId',
    jsonb_build_object('rentalId', target_rental.id, 'status', 'Reserved', 'version', target_line.row_version));
  response = jsonb_build_object('success', true, 'disposition', 'ACCEPTED', 'serverOccurredAt', now_at,
    'refresh', jsonb_build_array(target_rental.id, target_line.id, target_line.equipment_id),
    'value', jsonb_build_object('rentalId', target_rental.id, 'rentalLineId', target_line.id, 'status', target_line.status, 'canonicalLineStatus', target_line.canonical_line_status, 'version', target_line.row_version));
  RETURN erp.finish_operational_command(command, 'RESERVE_RENTAL_LINE', 'RENTAL_LINE', target_line.id, tenant, actor, payload_hash, response, target_line.row_version);
END;
$$;

CREATE OR REPLACE FUNCTION erp.command_release_rental_line(command jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = erp, auth, extensions, pg_catalog
AS $$
DECLARE
  tenant text = erp.current_company_id();
  actor text = auth.uid()::text;
  target_rental erp.rentals%ROWTYPE;
  target_line erp.rental_equipment_lines%ROWTYPE;
  contract_row erp.rental_contracts%ROWTYPE;
  prep jsonb;
  metadata jsonb;
  snapshot jsonb;
  readiness jsonb;
  rented_status text;
  idem jsonb;
  payload_hash text;
  response jsonb;
  now_at timestamptz = clock_timestamp();
BEGIN
  IF tenant IS NULL OR NOT erp.current_user_has_permission('rental.release') THEN
    RETURN jsonb_build_object('success', false, 'code', 'FORBIDDEN', 'message', 'Rental line release is not authorized.', 'retryable', false, 'refreshRequired', false);
  END IF;
  SELECT * INTO target_rental FROM erp.rentals WHERE id = command->>'rentalId' AND company_id = tenant FOR UPDATE;
  IF target_rental.id IS NULL THEN RETURN jsonb_build_object('success', false, 'code', 'NOT_FOUND', 'retryable', false, 'refreshRequired', false); END IF;
  SELECT * INTO target_line FROM erp.rental_equipment_lines
  WHERE id = command->>'rentalLineId' AND rental_id = target_rental.id AND company_id = tenant AND deleted_at IS NULL FOR UPDATE;
  IF target_line.id IS NULL THEN RETURN jsonb_build_object('success', false, 'code', 'NOT_FOUND', 'retryable', false, 'refreshRequired', false); END IF;
  idem = erp.begin_operational_command(command, 'RELEASE_RENTAL_LINE', 'RENTAL_LINE', target_line.id, tenant, actor);
  IF idem->>'state' = 'INVALID' THEN RETURN jsonb_build_object('success', false, 'code', 'VALIDATION_REJECTED', 'retryable', false, 'refreshRequired', false); END IF;
  IF idem->>'state' = 'MISMATCH' THEN RETURN jsonb_build_object('success', false, 'code', 'IDEMPOTENCY_MISMATCH', 'retryable', false, 'refreshRequired', false); END IF;
  IF idem->>'state' = 'REPLAY' THEN RETURN (idem->'response') || jsonb_build_object('disposition', 'REPLAYED'); END IF;
  payload_hash = idem->>'payloadHash';
  IF NOT erp.rental_parent_is_mutable(target_rental.status, target_rental.canonical_parent_status) THEN RETURN jsonb_build_object('success', false, 'code', 'PARENT_READ_ONLY', 'retryable', false, 'refreshRequired', false); END IF;
  IF target_line.row_version <> coalesce((command->>'expectedVersion')::bigint, target_line.row_version) THEN RETURN jsonb_build_object('success', false, 'code', 'CONFLICT', 'currentVersion', target_line.row_version, 'retryable', false, 'refreshRequired', true); END IF;
  IF coalesce(target_line.canonical_line_status::text, target_line.status::text) <> 'Reserved' THEN RETURN jsonb_build_object('success', false, 'code', 'INVALID_TRANSITION', 'message', 'Only a Reserved Rental Equipment Line can be released.', 'retryable', false, 'refreshRequired', false); END IF;
  readiness = erp.rental_line_release_readiness(target_rental.id, target_line.id);
  IF NOT coalesce((readiness->>'eligible')::boolean, false) THEN RETURN jsonb_build_object('success', false, 'code', 'RELEASE_NOT_READY', 'readiness', readiness, 'retryable', false, 'refreshRequired', false); END IF;

  -- Capture immutable commercial and DEUR evidence only once, for this line.
  IF NOT EXISTS (SELECT 1 FROM erp.commercial_snapshots snapshot_row WHERE snapshot_row.rental_equipment_line_id = target_line.id) THEN
    SELECT * INTO contract_row FROM erp.rental_contracts
    WHERE rental_equipment_line_id = target_line.id AND rental_id = target_rental.id AND status = 'Active' FOR UPDATE;
    prep = target_line.operational_metadata->'draftPreparation';
    metadata = jsonb_build_object(
      'costCode', (SELECT jsonb_build_object('id', cost_code.id, 'code', cost_code.code, 'name', cost_code.name) FROM erp.cost_codes cost_code WHERE cost_code.id = prep->>'costCodeId'),
      'activityCode', (SELECT jsonb_build_object('id', activity_code.id, 'code', activity_code.code, 'name', activity_code.name) FROM erp.activity_codes activity_code WHERE activity_code.id = prep->>'activityCodeId'),
      'workDescription', (SELECT jsonb_build_object('id', work_description.id, 'code', work_description.code, 'name', work_description.name, 'requiresRemarks', work_description.requires_remarks) FROM erp.work_descriptions work_description WHERE work_description.id = prep->>'workDescriptionId')
    ) || CASE WHEN nullif(btrim(prep->>'operationalRemarks'), '') IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('operationalRemarks', prep->>'operationalRemarks') END;
    snapshot = jsonb_build_object('rentalEquipmentLineId', target_line.id, 'rentalId', target_rental.id, 'equipmentId', target_line.equipment_id,
      'assignmentId', target_line.assignment_id, 'operatorId', target_line.operator_id, 'projectId', target_rental.project_id, 'customerId', target_rental.customer_id,
      'policy', prep->'deurPolicy', 'shiftWindows', coalesce(prep->'shiftWindows', '[]'::jsonb), 'workDescription', metadata->'workDescription',
      'operationalRemarks', metadata->>'operationalRemarks', 'workDateRule', 'RENTAL_DATE_OUT', 'workDate', coalesce(prep->>'workDate', target_rental.date_out::text),
      'meterRequirement', coalesce(prep->>'meterRequirement', 'none'), 'billingMethod', contract_row.billing_method::text,
      'fuelEvidenceRequired', coalesce(contract_row.fuel_charge, 0) > 0, 'operationalMetadata', metadata-'workDescription'-'operationalRemarks',
      'sourceFingerprint', 'PENDING', 'capturedAt', now_at);
    INSERT INTO erp.commercial_snapshots(id, rental_id, rental_equipment_line_id, source_contract_id, billing_method, unit_rate, minimum_billable_hours, overtime_rate, standby_rate, mobilization_fee, demobilization_fee, fuel_charge, operator_included, operator_rate, tax_rate, withholding_tax, contract_amount, currency, captured_at, created_by, snapshot_hash)
    VALUES(extensions.gen_random_uuid()::text, target_rental.id, target_line.id, contract_row.id, contract_row.billing_method, contract_row.unit_rate, contract_row.minimum_billable_hours, contract_row.overtime_rate, contract_row.standby_rate, contract_row.mobilization_fee, contract_row.demobilization_fee, contract_row.fuel_charge, contract_row.operator_included, contract_row.operator_rate, contract_row.tax_rate, contract_row.withholding_tax, contract_row.contract_amount, contract_row.currency, now_at, actor, encode(extensions.digest(to_jsonb(contract_row)::text, 'sha256'), 'hex'));
    UPDATE erp.rental_equipment_lines SET operational_metadata = metadata || jsonb_build_object('deurExpectationSnapshot', snapshot), updated_by = actor WHERE id = target_line.id;
    UPDATE erp.rental_equipment_lines SET operational_metadata = jsonb_set(operational_metadata, '{deurExpectationSnapshot,sourceFingerprint}', to_jsonb(erp.current_deur_expectation_fingerprint(id)), true) WHERE id = target_line.id;
  END IF;
  SELECT status_id INTO rented_status FROM erp.equipment_statuses WHERE lower(code) = 'rented' ORDER BY id LIMIT 1;
  UPDATE erp.rental_equipment_lines
  SET status = 'Released', canonical_line_status = 'Released', effective_start_date = coalesce(effective_start_date, target_rental.date_out), updated_by = actor
  WHERE id = target_line.id RETURNING * INTO target_line;
  UPDATE erp.equipment SET status_id = coalesce(rented_status, status_id), updated_by = actor
  WHERE id = target_line.equipment_id AND company_id = tenant;
  INSERT INTO erp.audit_log(id, company_id, aggregate_type, aggregate_id, action, actor_id, occurred_at, correlation_id, new_values)
  VALUES(extensions.gen_random_uuid()::text, tenant, 'RentalEquipmentLine', target_line.id, 'RELEASE_RENTAL_LINE', actor, now_at, command->>'commandId', jsonb_build_object('rentalId', target_rental.id, 'status', 'Released', 'version', target_line.row_version, 'effectiveStartDate', target_line.effective_start_date));
  response = jsonb_build_object('success', true, 'disposition', 'ACCEPTED', 'serverOccurredAt', now_at, 'refresh', jsonb_build_array(target_rental.id, target_line.id, target_line.equipment_id, target_line.assignment_id), 'value', jsonb_build_object('rentalId', target_rental.id, 'rentalLineId', target_line.id, 'status', target_line.status, 'canonicalLineStatus', target_line.canonical_line_status, 'effectiveStartDate', target_line.effective_start_date, 'version', target_line.row_version));
  RETURN erp.finish_operational_command(command, 'RELEASE_RENTAL_LINE', 'RENTAL_LINE', target_line.id, tenant, actor, payload_hash, response, target_line.row_version);
END;
$$;

CREATE OR REPLACE FUNCTION erp.command_activate_rental_line(command jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = erp, auth, extensions, pg_catalog
AS $$
DECLARE
  tenant text = erp.current_company_id(); actor text = auth.uid()::text;
  target_rental erp.rentals%ROWTYPE; target_line erp.rental_equipment_lines%ROWTYPE;
  readiness jsonb; idem jsonb; payload_hash text; response jsonb; now_at timestamptz = clock_timestamp();
BEGIN
  IF tenant IS NULL OR NOT erp.current_user_has_permission('rental.activate') THEN RETURN jsonb_build_object('success', false, 'code', 'FORBIDDEN', 'retryable', false, 'refreshRequired', false); END IF;
  SELECT * INTO target_rental FROM erp.rentals WHERE id = command->>'rentalId' AND company_id = tenant FOR UPDATE;
  IF target_rental.id IS NULL THEN RETURN jsonb_build_object('success', false, 'code', 'NOT_FOUND', 'retryable', false, 'refreshRequired', false); END IF;
  SELECT * INTO target_line FROM erp.rental_equipment_lines WHERE id = command->>'rentalLineId' AND rental_id = target_rental.id AND company_id = tenant AND deleted_at IS NULL FOR UPDATE;
  IF target_line.id IS NULL THEN RETURN jsonb_build_object('success', false, 'code', 'NOT_FOUND', 'retryable', false, 'refreshRequired', false); END IF;
  idem = erp.begin_operational_command(command, 'ACTIVATE_RENTAL_LINE', 'RENTAL_LINE', target_line.id, tenant, actor);
  IF idem->>'state' = 'INVALID' THEN RETURN jsonb_build_object('success', false, 'code', 'VALIDATION_REJECTED', 'retryable', false, 'refreshRequired', false); END IF;
  IF idem->>'state' = 'MISMATCH' THEN RETURN jsonb_build_object('success', false, 'code', 'IDEMPOTENCY_MISMATCH', 'retryable', false, 'refreshRequired', false); END IF;
  IF idem->>'state' = 'REPLAY' THEN RETURN (idem->'response') || jsonb_build_object('disposition', 'REPLAYED'); END IF;
  payload_hash = idem->>'payloadHash';
  IF NOT erp.rental_parent_is_mutable(target_rental.status, target_rental.canonical_parent_status) THEN RETURN jsonb_build_object('success', false, 'code', 'PARENT_READ_ONLY', 'retryable', false, 'refreshRequired', false); END IF;
  IF target_line.row_version <> coalesce((command->>'expectedVersion')::bigint, target_line.row_version) THEN RETURN jsonb_build_object('success', false, 'code', 'CONFLICT', 'currentVersion', target_line.row_version, 'retryable', false, 'refreshRequired', true); END IF;
  IF coalesce(target_line.canonical_line_status::text, target_line.status::text) <> 'Released' THEN RETURN jsonb_build_object('success', false, 'code', 'INVALID_TRANSITION', 'retryable', false, 'refreshRequired', false); END IF;
  readiness = erp.rental_line_release_readiness(target_rental.id, target_line.id);
  IF NOT coalesce((readiness->>'eligible')::boolean, false)
    OR target_line.effective_start_date IS NULL
    OR NOT EXISTS (SELECT 1 FROM erp.commercial_snapshots snapshot_row WHERE snapshot_row.rental_equipment_line_id = target_line.id)
    OR NOT (target_line.operational_metadata ? 'deurExpectationSnapshot') THEN
    RETURN jsonb_build_object('success', false, 'code', 'ACTIVATION_NOT_READY', 'readiness', readiness, 'retryable', false, 'refreshRequired', false);
  END IF;
  UPDATE erp.rental_equipment_lines SET status = 'Active', canonical_line_status = 'Active', updated_by = actor WHERE id = target_line.id RETURNING * INTO target_line;
  INSERT INTO erp.audit_log(id, company_id, aggregate_type, aggregate_id, action, actor_id, occurred_at, correlation_id, new_values)
  VALUES(extensions.gen_random_uuid()::text, tenant, 'RentalEquipmentLine', target_line.id, 'ACTIVATE_RENTAL_LINE', actor, now_at, command->>'commandId', jsonb_build_object('rentalId', target_rental.id, 'status', 'Active', 'version', target_line.row_version));
  response = jsonb_build_object('success', true, 'disposition', 'ACCEPTED', 'serverOccurredAt', now_at, 'refresh', jsonb_build_array(target_rental.id, target_line.id, target_line.equipment_id, target_line.assignment_id), 'value', jsonb_build_object('rentalId', target_rental.id, 'rentalLineId', target_line.id, 'status', target_line.status, 'canonicalLineStatus', target_line.canonical_line_status, 'version', target_line.row_version));
  RETURN erp.finish_operational_command(command, 'ACTIVATE_RENTAL_LINE', 'RENTAL_LINE', target_line.id, tenant, actor, payload_hash, response, target_line.row_version);
END;
$$;

CREATE OR REPLACE FUNCTION erp.command_cancel_rental_line(command jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = erp, auth, extensions, pg_catalog
AS $$
DECLARE
  tenant text = erp.current_company_id(); actor text = auth.uid()::text;
  target_rental erp.rentals%ROWTYPE; target_line erp.rental_equipment_lines%ROWTYPE;
  equipment_status text; idem jsonb; payload_hash text; response jsonb; now_at timestamptz = clock_timestamp();
BEGIN
  IF tenant IS NULL OR NOT erp.current_user_has_permission('rental.update') THEN RETURN jsonb_build_object('success', false, 'code', 'FORBIDDEN', 'retryable', false, 'refreshRequired', false); END IF;
  SELECT * INTO target_rental FROM erp.rentals WHERE id = command->>'rentalId' AND company_id = tenant FOR UPDATE;
  IF target_rental.id IS NULL THEN RETURN jsonb_build_object('success', false, 'code', 'NOT_FOUND', 'retryable', false, 'refreshRequired', false); END IF;
  SELECT * INTO target_line FROM erp.rental_equipment_lines WHERE id = command->>'rentalLineId' AND rental_id = target_rental.id AND company_id = tenant AND deleted_at IS NULL FOR UPDATE;
  IF target_line.id IS NULL THEN RETURN jsonb_build_object('success', false, 'code', 'NOT_FOUND', 'retryable', false, 'refreshRequired', false); END IF;
  idem = erp.begin_operational_command(command, 'CANCEL_RENTAL_LINE', 'RENTAL_LINE', target_line.id, tenant, actor);
  IF idem->>'state' = 'INVALID' THEN RETURN jsonb_build_object('success', false, 'code', 'VALIDATION_REJECTED', 'retryable', false, 'refreshRequired', false); END IF;
  IF idem->>'state' = 'MISMATCH' THEN RETURN jsonb_build_object('success', false, 'code', 'IDEMPOTENCY_MISMATCH', 'retryable', false, 'refreshRequired', false); END IF;
  IF idem->>'state' = 'REPLAY' THEN RETURN (idem->'response') || jsonb_build_object('disposition', 'REPLAYED'); END IF;
  payload_hash = idem->>'payloadHash';
  IF NOT erp.rental_parent_is_mutable(target_rental.status, target_rental.canonical_parent_status) THEN RETURN jsonb_build_object('success', false, 'code', 'PARENT_READ_ONLY', 'retryable', false, 'refreshRequired', false); END IF;
  IF target_line.row_version <> coalesce((command->>'expectedVersion')::bigint, target_line.row_version) THEN RETURN jsonb_build_object('success', false, 'code', 'CONFLICT', 'currentVersion', target_line.row_version, 'retryable', false, 'refreshRequired', true); END IF;
  IF coalesce(target_line.canonical_line_status::text, target_line.status::text) = 'Active' THEN RETURN jsonb_build_object('success', false, 'code', 'LINE_CANCEL_ACTIVE_REQUIRES_RETURN', 'message', 'Active equipment must use the Return workflow.', 'retryable', false, 'refreshRequired', false); END IF;
  IF coalesce(target_line.canonical_line_status::text, target_line.status::text) IN ('Returned', 'Cancelled', 'Closed') THEN RETURN jsonb_build_object('success', false, 'code', 'LINE_CANCEL_NOT_ALLOWED', 'retryable', false, 'refreshRequired', false); END IF;
  IF coalesce(target_line.canonical_line_status::text, target_line.status::text) NOT IN ('Draft', 'Reserved', 'Released') THEN RETURN jsonb_build_object('success', false, 'code', 'LINE_CANCEL_NOT_ALLOWED', 'retryable', false, 'refreshRequired', false); END IF;
  IF EXISTS (
    SELECT 1 FROM erp.deurs deur
    CROSS JOIN LATERAL erp.calculate_deur_billing_evidence(deur.id, tenant) AS billing_evidence
    WHERE deur.rental_equipment_line_id = target_line.id AND deur.company_id = tenant
      AND coalesce((billing_evidence->>'success')::boolean, false)
  ) THEN RETURN jsonb_build_object('success', false, 'code', 'LINE_CANCEL_BILLABLE_DEUR', 'retryable', false, 'refreshRequired', false); END IF;
  SELECT status_id INTO equipment_status FROM erp.equipment_statuses
  WHERE lower(code) = CASE WHEN EXISTS (SELECT 1 FROM erp.assignments assignment_row WHERE assignment_row.id = target_line.assignment_id AND assignment_row.company_id = tenant AND assignment_row.status = 'Active') THEN 'assigned' ELSE 'available' END
  ORDER BY id LIMIT 1;
  UPDATE erp.rental_equipment_lines SET status = 'Cancelled', canonical_line_status = 'Cancelled', updated_by = actor WHERE id = target_line.id RETURNING * INTO target_line;
  UPDATE erp.equipment equipment_row
  SET status_id = coalesce(equipment_status, equipment_row.status_id),
      project_id = CASE WHEN EXISTS (SELECT 1 FROM erp.assignments assignment_row WHERE assignment_row.id = target_line.assignment_id AND assignment_row.company_id = tenant AND assignment_row.status = 'Active') THEN target_rental.project_id ELSE NULL END,
      operator_id = CASE WHEN EXISTS (SELECT 1 FROM erp.assignments assignment_row WHERE assignment_row.id = target_line.assignment_id AND assignment_row.company_id = tenant AND assignment_row.status = 'Active') THEN target_line.operator_id ELSE NULL END,
      updated_by = actor
  WHERE equipment_row.id = target_line.equipment_id AND equipment_row.company_id = tenant;
  INSERT INTO erp.audit_log(id, company_id, aggregate_type, aggregate_id, action, actor_id, occurred_at, correlation_id, new_values)
  VALUES(extensions.gen_random_uuid()::text, tenant, 'RentalEquipmentLine', target_line.id, 'CANCEL_RENTAL_LINE', actor, now_at, command->>'commandId', jsonb_build_object('rentalId', target_rental.id, 'status', 'Cancelled', 'version', target_line.row_version));
  response = jsonb_build_object('success', true, 'disposition', 'ACCEPTED', 'serverOccurredAt', now_at, 'refresh', jsonb_build_array(target_rental.id, target_line.id, target_line.equipment_id, target_line.assignment_id), 'value', jsonb_build_object('rentalId', target_rental.id, 'rentalLineId', target_line.id, 'status', target_line.status, 'canonicalLineStatus', target_line.canonical_line_status, 'version', target_line.row_version));
  RETURN erp.finish_operational_command(command, 'CANCEL_RENTAL_LINE', 'RENTAL_LINE', target_line.id, tenant, actor, payload_hash, response, target_line.row_version);
END;
$$;

-- D5B1B made Return line-scoped.  D5B1C narrows its source state so it is the
-- canonical operational stop for Active equipment rather than a generic line close.
CREATE OR REPLACE FUNCTION erp.command_return_rental_line(command jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = erp, auth, extensions, pg_catalog
AS $$
DECLARE
  tenant text = erp.current_company_id(); target_rental erp.rentals%ROWTYPE; target_line erp.rental_equipment_lines%ROWTYPE;
  available_status text; now_at timestamptz = clock_timestamp(); idem jsonb; payload_hash text; response jsonb; return_business_date date;
BEGIN
  IF tenant IS NULL OR NOT erp.current_user_has_permission('rental.return') THEN RETURN jsonb_build_object('success', false, 'code', 'FORBIDDEN', 'retryable', false, 'refreshRequired', false); END IF;
  IF command->>'actualReturnDate' IS NULL OR command->>'actualReturnDate' !~ '^\\d{4}-\\d{2}-\\d{2}$' THEN RETURN jsonb_build_object('success', false, 'code', 'VALIDATION_REJECTED', 'retryable', false, 'refreshRequired', false); END IF;
  BEGIN return_business_date = (command->>'actualReturnDate')::date; EXCEPTION WHEN others THEN RETURN jsonb_build_object('success', false, 'code', 'VALIDATION_REJECTED', 'retryable', false, 'refreshRequired', false); END;
  SELECT * INTO target_rental FROM erp.rentals WHERE id = command->>'rentalId' AND company_id = tenant FOR UPDATE;
  IF target_rental.id IS NULL THEN RETURN jsonb_build_object('success', false, 'code', 'NOT_FOUND', 'retryable', false, 'refreshRequired', false); END IF;
  IF return_business_date < target_rental.date_out THEN RETURN jsonb_build_object('success', false, 'code', 'VALIDATION_REJECTED', 'retryable', false, 'refreshRequired', false); END IF;
  SELECT * INTO target_line FROM erp.rental_equipment_lines WHERE id = command->>'rentalLineId' AND rental_id = target_rental.id AND company_id = tenant AND deleted_at IS NULL FOR UPDATE;
  IF target_line.id IS NULL OR target_line.equipment_id <> command->>'equipmentId' OR target_line.assignment_id IS DISTINCT FROM command->>'assignmentId' THEN RETURN jsonb_build_object('success', false, 'code', 'VALIDATION_REJECTED', 'retryable', false, 'refreshRequired', false); END IF;
  idem = erp.begin_operational_command(command, 'RETURN_RENTAL_LINE', 'RENTAL_LINE', target_line.id, tenant, auth.uid()::text);
  IF idem->>'state' = 'INVALID' THEN RETURN jsonb_build_object('success', false, 'code', 'VALIDATION_REJECTED', 'retryable', false, 'refreshRequired', false); END IF;
  IF idem->>'state' = 'MISMATCH' THEN RETURN jsonb_build_object('success', false, 'code', 'IDEMPOTENCY_MISMATCH', 'retryable', false, 'refreshRequired', false); END IF;
  IF idem->>'state' = 'REPLAY' THEN RETURN (idem->'response') || jsonb_build_object('disposition', 'REPLAYED'); END IF;
  payload_hash = idem->>'payloadHash';
  IF NOT erp.rental_parent_is_mutable(target_rental.status, target_rental.canonical_parent_status) THEN RETURN jsonb_build_object('success', false, 'code', 'PARENT_READ_ONLY', 'retryable', false, 'refreshRequired', false); END IF;
  IF target_line.row_version <> coalesce((command->>'expectedVersion')::bigint, target_line.row_version) THEN RETURN jsonb_build_object('success', false, 'code', 'CONFLICT', 'currentVersion', target_line.row_version, 'retryable', false, 'refreshRequired', true); END IF;
  IF coalesce(target_line.canonical_line_status::text, target_line.status::text) = 'Returned' THEN
    IF target_line.actual_return_date IS DISTINCT FROM return_business_date THEN RETURN jsonb_build_object('success', false, 'code', 'CONFLICT', 'retryable', false, 'refreshRequired', true, 'currentVersion', target_line.row_version); END IF;
    response = jsonb_build_object('success', true, 'disposition', 'ALREADY_COMPLETED', 'serverOccurredAt', now_at, 'refresh', jsonb_build_array(target_rental.id, target_line.id, target_line.equipment_id, target_line.assignment_id), 'value', jsonb_build_object('rentalId', target_rental.id, 'rentalLineId', target_line.id, 'status', target_line.status, 'version', target_line.row_version, 'actualReturnDate', target_line.actual_return_date));
    RETURN erp.finish_operational_command(command, 'RETURN_RENTAL_LINE', 'RENTAL_LINE', target_line.id, tenant, auth.uid()::text, payload_hash, response, target_line.row_version);
  END IF;
  IF coalesce(target_line.canonical_line_status::text, target_line.status::text) <> 'Active' THEN RETURN jsonb_build_object('success', false, 'code', 'INVALID_TRANSITION', 'message', 'Only an Active Rental Equipment Line can be returned.', 'retryable', false, 'refreshRequired', false); END IF;
  IF EXISTS (SELECT 1 FROM erp.deurs deur WHERE deur.rental_equipment_line_id = target_line.id AND deur.status IN ('Draft', 'In Progress', 'Submitted', 'Pending Acknowledgement', 'Rejected')) THEN RETURN jsonb_build_object('success', false, 'code', 'INVALID_TRANSITION', 'retryable', false, 'refreshRequired', false); END IF;
  SELECT id INTO available_status FROM erp.equipment_statuses WHERE lower(code) = 'available' ORDER BY id LIMIT 1;
  IF available_status IS NULL THEN RETURN jsonb_build_object('success', false, 'code', 'PERSISTENCE_FAILURE', 'retryable', false, 'refreshRequired', true); END IF;
  UPDATE erp.rental_equipment_lines SET status = 'Returned', canonical_line_status = 'Returned', actual_return_date = return_business_date WHERE id = target_line.id RETURNING * INTO target_line;
  UPDATE erp.equipment SET status_id = available_status, project_id = NULL, operator_id = NULL WHERE id = target_line.equipment_id AND company_id = tenant;
  UPDATE erp.assignments SET status = 'Completed', returned_date = return_business_date WHERE id = target_line.assignment_id AND company_id = tenant AND status = 'Active';
  INSERT INTO erp.audit_log(id, company_id, aggregate_type, aggregate_id, action, actor_id, occurred_at, correlation_id, new_values) VALUES(extensions.gen_random_uuid()::text, tenant, 'RentalEquipmentLine', target_line.id, 'RETURN_RENTAL_LINE', auth.uid()::text, now_at, command->>'commandId', jsonb_build_object('rentalId', target_rental.id, 'status', 'Returned', 'version', target_line.row_version, 'actualReturnDate', target_line.actual_return_date));
  response = jsonb_build_object('success', true, 'disposition', 'ACCEPTED', 'serverOccurredAt', now_at, 'refresh', jsonb_build_array(target_rental.id, target_line.id, target_line.equipment_id, target_line.assignment_id), 'value', jsonb_build_object('rentalId', target_rental.id, 'rentalLineId', target_line.id, 'status', target_line.status, 'version', target_line.row_version, 'actualReturnDate', target_line.actual_return_date));
  RETURN erp.finish_operational_command(command, 'RETURN_RENTAL_LINE', 'RENTAL_LINE', target_line.id, tenant, auth.uid()::text, payload_hash, response, target_line.row_version);
END;
$$;

ALTER FUNCTION erp.rental_line_release_readiness(text, text) OWNER TO postgres;
ALTER FUNCTION erp.command_reserve_rental_line(jsonb) OWNER TO postgres;
ALTER FUNCTION erp.command_release_rental_line(jsonb) OWNER TO postgres;
ALTER FUNCTION erp.command_activate_rental_line(jsonb) OWNER TO postgres;
ALTER FUNCTION erp.command_cancel_rental_line(jsonb) OWNER TO postgres;
ALTER FUNCTION erp.command_return_rental_line(jsonb) OWNER TO postgres;

REVOKE ALL ON FUNCTION erp.rental_line_release_readiness(text, text), erp.command_reserve_rental_line(jsonb), erp.command_release_rental_line(jsonb), erp.command_activate_rental_line(jsonb), erp.command_cancel_rental_line(jsonb), erp.command_return_rental_line(jsonb) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION erp.command_reserve_rental_line(jsonb), erp.command_release_rental_line(jsonb), erp.command_activate_rental_line(jsonb), erp.command_cancel_rental_line(jsonb), erp.command_return_rental_line(jsonb) TO authenticated;

COMMIT;
