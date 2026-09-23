BEGIN;

SET LOCAL search_path = erp, auth, extensions, pg_catalog;

-- Keep the parent-cancel contract unchanged while avoiding the PL/pgSQL row
-- variable/table alias collision that caused SQLSTATE 42702 before the cascade.
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
  rental_line_row erp.rental_equipment_lines%ROWTYPE;
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
  IF EXISTS (SELECT 1 FROM erp.rental_equipment_lines AS rental_line WHERE rental_line.rental_id = target.id AND rental_line.company_id = tenant AND rental_line.deleted_at IS NULL AND coalesce(rental_line.canonical_line_status::text, rental_line.status::text) = 'Active') THEN RETURN jsonb_build_object('success', false, 'code', 'PARENT_CANCEL_ACTIVE_EQUIPMENT', 'message', 'Active equipment must leave Active before parent cancellation.', 'retryable', false, 'refreshRequired', false); END IF;
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
  UPDATE erp.rental_equipment_lines AS rental_line
  SET status = 'Cancelled', canonical_line_status = 'Cancelled', updated_by = actor
  WHERE rental_line.rental_id = target.id
    AND rental_line.company_id = tenant
    AND rental_line.deleted_at IS NULL
    AND coalesce(rental_line.canonical_line_status::text, rental_line.status::text) IN ('Draft', 'Assigned', 'Reserved', 'Released');
  UPDATE erp.rentals
  SET status = 'Cancelled', canonical_parent_status = 'Cancelled', cancelled_at = now_at, updated_by = actor
  WHERE id = target.id
  RETURNING * INTO target;

  FOR rental_line_row IN SELECT * FROM erp.rental_equipment_lines AS rental_line WHERE rental_line.rental_id = target.id AND rental_line.company_id = tenant AND rental_line.deleted_at IS NULL ORDER BY rental_line.equipment_id LOOP
    UPDATE erp.equipment equipment_row
    SET status_id = coalesce((SELECT id FROM erp.equipment_statuses WHERE lower(code) = CASE WHEN EXISTS (SELECT 1 FROM erp.assignments assignment_row WHERE assignment_row.id = rental_line_row.assignment_id AND assignment_row.status = 'Active') THEN 'assigned' ELSE 'available' END LIMIT 1), equipment_row.status_id),
        project_id = CASE WHEN EXISTS (SELECT 1 FROM erp.assignments assignment_row WHERE assignment_row.id = rental_line_row.assignment_id AND assignment_row.status = 'Active') THEN (SELECT project_id FROM erp.assignments WHERE id = rental_line_row.assignment_id) ELSE NULL END,
        operator_id = CASE WHEN EXISTS (SELECT 1 FROM erp.assignments assignment_row WHERE assignment_row.id = rental_line_row.assignment_id AND assignment_row.status = 'Active') THEN rental_line_row.operator_id ELSE NULL END,
        updated_by = actor
    WHERE equipment_row.id = rental_line_row.equipment_id
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

COMMIT;
