BEGIN;
SET LOCAL search_path=erp,auth,extensions,pg_catalog;

CREATE OR REPLACE FUNCTION erp.command_cancel_assignment(command jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=erp,auth,extensions,pg_catalog
AS $$
DECLARE
  tenant text = erp.current_company_id();
  actor text = auth.uid()::text;
  now_at timestamptz = clock_timestamp();
  target erp.assignments%ROWTYPE;
  available_status text;
  idem jsonb;
  payload_hash text;
  response jsonb;
  linked_rental erp.rentals%ROWTYPE;
  linked_rental_ids text[] = ARRAY[]::text[];
  linked_rental_id text;
  linked_rental_version bigint;
  rental_cancel_result jsonb;
BEGIN
  IF auth.uid() IS NULL OR tenant IS NULL OR NOT EXISTS (
    SELECT 1 FROM erp.users AS u JOIN erp.companies AS c ON c.id = u.company_id
    WHERE u.id = auth.uid() AND u.status = 'active' AND u.company_id = tenant AND c.active
  ) THEN
    RETURN jsonb_build_object('success', false, 'code', 'UNAUTHENTICATED', 'message', 'Authentication is required.', 'retryable', false, 'refreshRequired', false);
  END IF;
  IF NOT erp.current_user_has_permission('assignment.close') THEN
    RETURN jsonb_build_object('success', false, 'code', 'FORBIDDEN', 'message', 'Assignment cancellation is not authorized.', 'retryable', false, 'refreshRequired', false);
  END IF;
  IF command ?| ARRAY['companyId', 'company_id', 'tenantId', 'tenant_id', 'actor', 'actorId', 'actor_id', 'userId', 'user_id', 'status', 'returnedDate', 'returned_date']
    OR nullif(btrim(command->>'commandId'), '') IS NULL
    OR nullif(btrim(command->>'idempotencyKey'), '') IS NULL
    OR nullif(btrim(command->>'assignmentId'), '') IS NULL
    OR command->>'assignmentId' <> btrim(command->>'assignmentId')
    OR command->>'assignmentId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    OR command->>'expectedVersion' !~ '^[0-9]+$'
  THEN
    RETURN jsonb_build_object('success', false, 'code', 'VALIDATION_REJECTED', 'message', 'Assignment cancellation command is invalid.', 'retryable', false, 'refreshRequired', false);
  END IF;

  SELECT * INTO target FROM erp.assignments
  WHERE id = command->>'assignmentId' AND company_id = tenant AND deleted_at IS NULL
  FOR UPDATE;
  IF target.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'NOT_FOUND', 'message', 'Assignment was not found.', 'retryable', false, 'refreshRequired', false);
  END IF;

  idem = erp.begin_operational_command(command, 'CANCEL_ASSIGNMENT', 'ASSIGNMENT', target.id, tenant, actor);
  IF idem->>'state' = 'INVALID' THEN
    RETURN jsonb_build_object('success', false, 'code', 'VALIDATION_REJECTED', 'message', 'Assignment cancellation command is invalid.', 'retryable', false, 'refreshRequired', false);
  ELSIF idem->>'state' = 'MISMATCH' THEN
    RETURN jsonb_build_object('success', false, 'code', 'IDEMPOTENCY_MISMATCH', 'message', 'Idempotency key payload mismatch.', 'retryable', false, 'refreshRequired', false);
  ELSIF idem->>'state' = 'REPLAY' THEN
    RETURN (idem->'response') || jsonb_build_object('disposition', 'REPLAYED');
  END IF;
  payload_hash = idem->>'payloadHash';

  IF target.row_version <> (command->>'expectedVersion')::bigint THEN
    RETURN jsonb_build_object('success', false, 'code', 'CONFLICT', 'message', 'Assignment version is stale.', 'retryable', false, 'refreshRequired', true, 'currentVersion', target.row_version);
  END IF;
  IF target.status = 'Cancelled' THEN
    response = jsonb_build_object('success', true, 'disposition', 'ALREADY_COMPLETED', 'serverOccurredAt', now_at,
      'refresh', jsonb_build_array(target.id, target.equipment_id, target.operator_id),
      'value', jsonb_build_object('id', target.id, 'equipmentId', target.equipment_id, 'operatorId', target.operator_id, 'status', target.status, 'rowVersion', target.row_version));
    RETURN erp.finish_operational_command(command, 'CANCEL_ASSIGNMENT', 'ASSIGNMENT', target.id, tenant, actor, payload_hash, response, target.row_version);
  END IF;
  IF target.status <> 'Active' THEN
    RETURN jsonb_build_object('success', false, 'code', 'INVALID_TRANSITION', 'message', 'Only an Active Assignment can be cancelled.', 'retryable', false, 'refreshRequired', true);
  END IF;
  -- Lock every related parent and its lines before classifying the lifecycle.
  -- A direct RPC call must not bypass the same preparation-only rule as the UI.
  FOR linked_rental IN
    SELECT rental.* FROM erp.rentals AS rental
    WHERE rental.company_id = tenant
      AND (rental.assignment_id = target.id OR EXISTS (
        SELECT 1 FROM erp.rental_equipment_lines AS line
        WHERE line.rental_id = rental.id AND line.company_id = tenant
          AND line.assignment_id = target.id AND line.deleted_at IS NULL))
    ORDER BY rental.id FOR UPDATE OF rental
  LOOP
    PERFORM 1 FROM erp.rental_equipment_lines AS line
    WHERE line.rental_id = linked_rental.id AND line.company_id = tenant
      AND line.deleted_at IS NULL FOR UPDATE;
    IF linked_rental.approval_status = 'Approved'
      OR linked_rental.reserved_at IS NOT NULL OR linked_rental.released_at IS NOT NULL
      OR linked_rental.activated_at IS NOT NULL OR linked_rental.returned_at IS NOT NULL
      OR linked_rental.closed_at IS NOT NULL
      OR EXISTS (SELECT 1 FROM erp.deurs AS deur WHERE deur.company_id = tenant
        AND (deur.rental_id = linked_rental.id OR deur.assignment_id = target.id))
      OR EXISTS (SELECT 1 FROM erp.rental_contracts AS contract
        WHERE contract.rental_id = linked_rental.id AND contract.status NOT IN ('Draft', 'Cancelled'))
    THEN
      RETURN jsonb_build_object('success', false, 'code', 'RENTAL_CONFLICT', 'message',
        'This assignment is already part of an approved or active rental and can no longer be cancelled from the preparation workflow.',
        'retryable', false, 'refreshRequired', true);
    END IF;
    IF linked_rental.status = 'Cancelled'
      AND coalesce(linked_rental.canonical_parent_status::text, linked_rental.status::text) = 'Cancelled'
      AND NOT EXISTS (SELECT 1 FROM erp.rental_equipment_lines AS line
        WHERE line.rental_id = linked_rental.id AND line.company_id = tenant AND line.deleted_at IS NULL
          AND coalesce(line.canonical_line_status::text, line.status::text) <> 'Cancelled')
    THEN
      CONTINUE;
    END IF;
    IF linked_rental.status <> 'Draft'
      OR coalesce(linked_rental.canonical_parent_status::text, linked_rental.status::text) <> 'Draft'
      OR EXISTS (SELECT 1 FROM erp.rental_equipment_lines AS line
        WHERE line.rental_id = linked_rental.id AND line.company_id = tenant AND line.deleted_at IS NULL
          AND (line.status <> 'Draft' OR coalesce(line.canonical_line_status::text, line.status::text) <> 'Draft'))
    THEN
      RETURN jsonb_build_object('success', false, 'code', 'RENTAL_CONFLICT', 'message',
        'This assignment is already part of an approved or active rental and can no longer be cancelled from the preparation workflow.',
        'retryable', false, 'refreshRequired', true);
    END IF;
    linked_rental_ids = array_append(linked_rental_ids, linked_rental.id);
  END LOOP;

  IF cardinality(linked_rental_ids) > 0 AND NOT erp.current_user_has_permission('rental.update') THEN
    RETURN jsonb_build_object('success', false, 'code', 'FORBIDDEN', 'message',
      'Rental cancellation is not authorized.', 'retryable', false, 'refreshRequired', false);
  END IF;

  SELECT id INTO available_status FROM erp.equipment_statuses
  WHERE lower(code) = 'available' AND active AND deleted_at IS NULL
  ORDER BY sort_order, id LIMIT 1;
  IF available_status IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'PERSISTENCE_FAILURE', 'message', 'Available Equipment status is unavailable.', 'retryable', false, 'refreshRequired', true);
  END IF;

  -- Nested cancellation uses the existing parent/line lifecycle and audit path.
  -- Any failure raises an exception, rolling back every Rental and Assignment write.
  FOREACH linked_rental_id IN ARRAY linked_rental_ids LOOP
    SELECT row_version INTO linked_rental_version FROM erp.rentals
    WHERE id = linked_rental_id AND company_id = tenant;
    rental_cancel_result = erp.command_cancel_rental(jsonb_build_object(
      'commandId', command->>'commandId',
      'idempotencyKey', (command->>'idempotencyKey') || ':draft-rental:' || linked_rental_id,
      'rentalId', linked_rental_id,
      'expectedVersion', linked_rental_version));
    IF coalesce((rental_cancel_result->>'success')::boolean, false) IS NOT TRUE THEN
      RAISE EXCEPTION 'Linked Draft Rental cancellation failed' USING ERRCODE = 'P0001';
    END IF;
    UPDATE erp.rental_contracts SET status = 'Cancelled', updated_by = actor
    WHERE rental_id = linked_rental_id AND status = 'Draft';
  END LOOP;

  UPDATE erp.assignments SET status = 'Cancelled', updated_by = actor
  WHERE id = target.id AND company_id = tenant
  RETURNING * INTO target;
  UPDATE erp.equipment SET status_id = available_status, project_id = NULL, operator_id = NULL, updated_by = actor
  WHERE id = target.equipment_id AND company_id = tenant;

  INSERT INTO erp.audit_log(id, company_id, aggregate_type, aggregate_id, action, actor_id, occurred_at, correlation_id, previous_values, new_values)
  VALUES (gen_random_uuid()::text, tenant, 'Assignment', target.id, 'ASSIGNMENT_CANCELLED', actor, now_at, command->>'commandId',
    jsonb_build_object('status', 'Active'), jsonb_build_object('status', 'Cancelled', 'equipmentId', target.equipment_id, 'operatorId', target.operator_id));
  response = jsonb_build_object('success', true, 'disposition', 'ACCEPTED', 'serverOccurredAt', now_at,
    'refresh', jsonb_build_array(target.id, target.equipment_id, target.operator_id),
    'value', jsonb_build_object('id', target.id, 'equipmentId', target.equipment_id, 'operatorId', target.operator_id, 'status', target.status, 'rowVersion', target.row_version));
  RETURN erp.finish_operational_command(command, 'CANCEL_ASSIGNMENT', 'ASSIGNMENT', target.id, tenant, actor, payload_hash, response, target.row_version);
END $$;

ALTER FUNCTION erp.command_cancel_assignment(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.command_cancel_assignment(jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION erp.command_cancel_assignment(jsonb) TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON erp.assignments FROM PUBLIC, anon, authenticated;

COMMIT;
