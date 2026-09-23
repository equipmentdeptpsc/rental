BEGIN;

SET LOCAL search_path = erp, auth, extensions, pg_catalog;

-- A source Assignment is intentionally optional when a line is first added.
-- Draft-only equipment onboarding may therefore be unstaffed; the existing
-- Reserve/Release gates still require the canonical Assignment and Operator
-- relationship before the line can become operational.
ALTER TABLE erp.rental_equipment_lines
  ALTER COLUMN operator_id DROP NOT NULL;

-- This pre-D3 coarse uniqueness rule rejects every concurrent/pending Rental
-- for an equipment item, including non-overlapping intervals.  D3's locked
-- interval assertion is now the authoritative cross-Rental guard.  The D5B1A
-- non-deleted (rental_id, equipment_id) index remains the same-Rental guard.
DROP INDEX IF EXISTS erp.uq_rental_lines_company_non_final_equipment;

CREATE OR REPLACE FUNCTION erp.command_add_rental_equipment(command jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = erp, auth, extensions, pg_catalog
AS $$
DECLARE
  tenant text = erp.current_company_id();
  actor text = auth.uid()::text;
  target_rental erp.rentals%ROWTYPE;
  equipment_row erp.equipment%ROWTYPE;
  source_assignment erp.assignments%ROWTYPE;
  target_line erp.rental_equipment_lines%ROWTYPE;
  candidate_start date;
  candidate_end date;
  exact_source_assignment_id text;
  idem jsonb;
  payload_hash text;
  response jsonb;
  now_at timestamptz = clock_timestamp();
BEGIN
  IF tenant IS NULL OR NOT erp.current_user_has_permission('rental.update') THEN
    RETURN jsonb_build_object('success', false, 'code', 'FORBIDDEN', 'message', 'Adding Rental equipment is not authorized.', 'retryable', false, 'refreshRequired', false);
  END IF;
  IF jsonb_typeof(command) IS DISTINCT FROM 'object'
    OR EXISTS (SELECT 1 FROM jsonb_object_keys(command) key WHERE key NOT IN ('commandId', 'idempotencyKey', 'rentalId', 'equipmentId', 'proposedEffectiveStartDate', 'sourceAssignmentId'))
    OR command ?| ARRAY['companyId', 'company_id', 'tenantId', 'tenant_id', 'actor', 'actorId', 'userId', 'parentStatus', 'status', 'projectId', 'customerId', 'rentalNumber', 'dateOut', 'expectedReturn', 'lineStatus', 'billingStatus']
    OR nullif(btrim(command->>'commandId'), '') IS NULL
    OR nullif(btrim(command->>'idempotencyKey'), '') IS NULL
    OR nullif(btrim(command->>'rentalId'), '') IS NULL
    OR nullif(btrim(command->>'equipmentId'), '') IS NULL
    OR nullif(btrim(command->>'proposedEffectiveStartDate'), '') IS NULL
    OR (command ? 'sourceAssignmentId' AND command->'sourceAssignmentId' <> 'null'::jsonb AND nullif(btrim(command->>'sourceAssignmentId'), '') IS NULL) THEN
    RETURN jsonb_build_object('success', false, 'code', 'VALIDATION_REJECTED', 'message', 'Add Rental equipment payload is invalid.', 'retryable', false, 'refreshRequired', false);
  END IF;
  BEGIN
    candidate_start = (command->>'proposedEffectiveStartDate')::date;
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'code', 'INVALID_EFFECTIVE_START', 'message', 'A valid effective start date is required.', 'retryable', false, 'refreshRequired', false);
  END;

  SELECT * INTO target_rental
  FROM erp.rentals
  WHERE id = command->>'rentalId' AND company_id = tenant
  FOR UPDATE;
  IF target_rental.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'NOT_FOUND', 'message', 'Rental was not found.', 'retryable', false, 'refreshRequired', false);
  END IF;
  IF target_rental.status IN ('Cancelled', 'Closed', 'Returned')
    OR target_rental.canonical_parent_status IN ('Cancelled', 'Closed') THEN
    RETURN jsonb_build_object('success', false, 'code', 'PARENT_READ_ONLY', 'message', 'Cancelled, Closed, and legacy Returned Rentals are read-only.', 'retryable', false, 'refreshRequired', false);
  END IF;
  IF coalesce(target_rental.canonical_parent_status::text, target_rental.status::text) NOT IN ('Draft', 'Reserved', 'Released', 'Active') THEN
    RETURN jsonb_build_object('success', false, 'code', 'PARENT_STATE_NOT_ELIGIBLE', 'message', 'This Rental is not eligible for additional equipment.', 'retryable', false, 'refreshRequired', false);
  END IF;
  IF candidate_start < target_rental.date_out
    OR (target_rental.expected_return IS NOT NULL AND candidate_start > target_rental.expected_return) THEN
    RETURN jsonb_build_object('success', false, 'code', 'INVALID_EFFECTIVE_START', 'message', 'Effective start must fall within the Rental engagement interval.', 'retryable', false, 'refreshRequired', false);
  END IF;
  candidate_end = target_rental.expected_return;

  idem = erp.begin_operational_command(command, 'ADD_RENTAL_EQUIPMENT', 'RENTAL', target_rental.id, tenant, actor);
  IF idem->>'state' = 'INVALID' THEN RETURN jsonb_build_object('success', false, 'code', 'VALIDATION_REJECTED', 'message', 'An idempotency key is required.', 'retryable', false, 'refreshRequired', false); END IF;
  IF idem->>'state' = 'MISMATCH' THEN RETURN jsonb_build_object('success', false, 'code', 'IDEMPOTENCY_MISMATCH', 'message', 'Idempotency key payload mismatch.', 'retryable', false, 'refreshRequired', false); END IF;
  IF idem->>'state' = 'REPLAY' THEN RETURN (idem->'response') || jsonb_build_object('disposition', 'REPLAYED'); END IF;
  payload_hash = idem->>'payloadHash';

  SELECT * INTO equipment_row
  FROM erp.equipment
  WHERE id = command->>'equipmentId' AND company_id = tenant AND active AND deleted_at IS NULL
  FOR UPDATE;
  IF equipment_row.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'NOT_FOUND', 'message', 'Eligible Equipment was not found.', 'retryable', false, 'refreshRequired', false);
  END IF;
  IF EXISTS (
    SELECT 1
    FROM erp.rental_equipment_lines line
    WHERE line.rental_id = target_rental.id
      AND line.company_id = tenant
      AND line.equipment_id = equipment_row.id
      AND line.deleted_at IS NULL
  ) THEN
    RETURN jsonb_build_object('success', false, 'code', 'DUPLICATE_EQUIPMENT_LINE', 'message', 'Equipment already exists on this Rental.', 'retryable', false, 'refreshRequired', false);
  END IF;

  IF nullif(btrim(command->>'sourceAssignmentId'), '') IS NOT NULL THEN
    SELECT * INTO source_assignment
    FROM erp.assignments
    WHERE id = command->>'sourceAssignmentId' AND company_id = tenant
    FOR UPDATE;
    IF source_assignment.id IS NULL
      OR source_assignment.deleted_at IS NOT NULL
      OR source_assignment.status <> 'Active'
      OR source_assignment.equipment_id <> equipment_row.id
      OR source_assignment.project_id <> target_rental.project_id
      OR NOT EXISTS (
        SELECT 1 FROM erp.operators operator_row
        WHERE operator_row.id = source_assignment.operator_id
          AND operator_row.company_id = tenant
          AND operator_row.status = 'Active'
          AND operator_row.deleted_at IS NULL
      ) THEN
      RETURN jsonb_build_object('success', false, 'code', 'MISSING_RELATIONSHIP', 'message', 'Source Assignment is not a valid Rental relationship.', 'retryable', false, 'refreshRequired', false);
    END IF;
    IF source_assignment.assigned_date = candidate_start
      AND source_assignment.expected_return IS NOT DISTINCT FROM candidate_end THEN
      exact_source_assignment_id = source_assignment.id;
    END IF;
  END IF;

  -- D3 remains the write authority.  D4 availability reads are deliberately
  -- not consulted here; their advisory result can become stale before insert.
  PERFORM erp.assert_equipment_interval_available(
    tenant,
    equipment_row.id,
    candidate_start,
    candidate_end,
    NULL,
    exact_source_assignment_id
  );

  INSERT INTO erp.rental_equipment_lines(
    id, rental_id, equipment_id, assignment_id, operator_id, status,
    canonical_line_status, effective_start_date, commercial_snapshot_required,
    created_by, updated_by, company_id
  ) VALUES (
    extensions.gen_random_uuid()::text,
    target_rental.id,
    equipment_row.id,
    source_assignment.id,
    source_assignment.operator_id,
    'Draft',
    'Draft',
    candidate_start,
    false,
    actor,
    actor,
    tenant
  ) RETURNING * INTO target_line;

  INSERT INTO erp.audit_log(
    id, company_id, aggregate_type, aggregate_id, action, actor_id,
    occurred_at, correlation_id, new_values, metadata
  ) VALUES (
    extensions.gen_random_uuid()::text,
    tenant,
    'RentalEquipmentLine',
    target_line.id,
    'ADD_RENTAL_EQUIPMENT',
    actor,
    now_at,
    command->>'commandId',
    jsonb_build_object(
      'rentalId', target_rental.id,
      'equipmentId', target_line.equipment_id,
      'sourceAssignmentId', target_line.assignment_id,
      'status', target_line.status,
      'canonicalLineStatus', target_line.canonical_line_status,
      'effectiveStartDate', target_line.effective_start_date,
      'effectiveEndDate', candidate_end,
      'version', target_line.row_version
    ),
    jsonb_build_object('source', 'command_add_rental_equipment')
  );
  response = jsonb_build_object(
    'success', true,
    'disposition', 'ACCEPTED',
    'serverOccurredAt', now_at,
    'refresh', jsonb_build_array(target_rental.id, target_line.id, target_line.equipment_id, target_line.assignment_id),
    'value', jsonb_build_object(
      'rentalId', target_rental.id,
      'rentalNumber', target_rental.rental_number,
      'rentalLineId', target_line.id,
      'equipmentId', target_line.equipment_id,
      'lineStatus', target_line.status,
      'canonicalLineStatus', target_line.canonical_line_status,
      'effectiveStartDate', target_line.effective_start_date,
      'effectiveEndDate', candidate_end,
      'sourceAssignmentId', target_line.assignment_id,
      'version', target_line.row_version
    )
  );
  RETURN erp.finish_operational_command(command, 'ADD_RENTAL_EQUIPMENT', 'RENTAL', target_rental.id, tenant, actor, payload_hash, response, target_line.row_version);
EXCEPTION WHEN SQLSTATE 'P0001' THEN
  RETURN jsonb_build_object('success', false, 'code', 'EQUIPMENT_INTERVAL_CONFLICT', 'message', 'Equipment conflicts with an existing commitment interval.', 'retryable', false, 'refreshRequired', true);
WHEN unique_violation THEN
  RETURN jsonb_build_object('success', false, 'code', 'DUPLICATE_EQUIPMENT_LINE', 'message', 'Equipment already exists on this Rental.', 'retryable', false, 'refreshRequired', true);
WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'code', 'PERSISTENCE_FAILURE', 'message', 'Rental equipment could not be added.', 'retryable', false, 'refreshRequired', true);
END;
$$;

ALTER FUNCTION erp.command_add_rental_equipment(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.command_add_rental_equipment(jsonb) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION erp.command_add_rental_equipment(jsonb) TO authenticated;

COMMENT ON FUNCTION erp.command_add_rental_equipment(jsonb) IS
  'D5B3 canonical single-line Rental onboarding. Uses D3 interval enforcement; new lines remain Draft without commercial, DEUR, or billing evidence.';

COMMIT;
