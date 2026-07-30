BEGIN;
SET search_path TO erp, public;

CREATE FUNCTION command_create_reserved_rental(command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=erp,auth AS $$
DECLARE
  tenant text; actor text; idem jsonb; payload_hash text; response jsonb;
  customer customers; project projects; line jsonb; now_at timestamptz=clock_timestamp();
  requested_count integer; valid_count integer;
BEGIN
  tenant=(SELECT company_id FROM users WHERE id=auth.uid() AND status='active');
  actor=auth.uid()::text;
  IF tenant IS NULL THEN RETURN jsonb_build_object('success',false,'code','UNAUTHENTICATED','message','Authentication is required.','retryable',false,'refreshRequired',false); END IF;
  IF NOT current_user_has_permission('rental.manage') THEN RETURN jsonb_build_object('success',false,'code','FORBIDDEN','message','Rental management permission is required.','retryable',false,'refreshRequired',false); END IF;
  IF nullif(command->>'rentalId','') IS NULL OR nullif(command->>'rentalNumber','') IS NULL OR
     nullif(command->>'customerId','') IS NULL OR nullif(command->>'projectId','') IS NULL OR
     nullif(command->>'dateOut','') IS NULL OR coalesce(jsonb_typeof(command->'lines'),'null')<>'array' OR
     coalesce(jsonb_array_length(command->'lines'),0)=0 OR command->>'rentalType' NOT IN('Bare Rental','Operated Rental') THEN
    RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED','message','Required Rental details are incomplete.','retryable',false,'refreshRequired',false);
  END IF;
  IF command ? 'companyId' THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED','message','Company scope is derived from authentication.','retryable',false,'refreshRequired',false); END IF;
  IF command ? 'expectedReturn' AND nullif(command->>'expectedReturn','') IS NOT NULL AND (command->>'expectedReturn')::date < (command->>'dateOut')::date THEN
    RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED','message','Expected return cannot precede date out.','retryable',false,'refreshRequired',false);
  END IF;

  idem=begin_operational_command(command,'CREATE_RESERVED_RENTAL','RENTAL',command->>'rentalId',tenant,actor);
  IF idem->>'state'='INVALID' THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED','message','An idempotency key is required.','retryable',false,'refreshRequired',false); END IF;
  IF idem->>'state'='MISMATCH' THEN RETURN jsonb_build_object('success',false,'code','IDEMPOTENCY_MISMATCH','message','Idempotency key payload mismatch.','retryable',false,'refreshRequired',false); END IF;
  IF idem->>'state'='REPLAY' THEN RETURN (idem->'response')||jsonb_build_object('disposition','REPLAYED'); END IF;
  payload_hash=idem->>'payloadHash';

  SELECT * INTO customer FROM customers WHERE id=command->>'customerId' AND company_id=tenant AND active AND deleted_at IS NULL;
  SELECT * INTO project FROM projects WHERE id=command->>'projectId' AND company_id=tenant AND active AND deleted_at IS NULL;
  IF customer.id IS NULL OR project.id IS NULL THEN RETURN jsonb_build_object('success',false,'code','NOT_FOUND','message','A required Rental relationship is unavailable.','retryable',false,'refreshRequired',false); END IF;
  IF project.customer_id IS DISTINCT FROM customer.id THEN RETURN jsonb_build_object('success',false,'code','MISSING_RELATIONSHIP','message','Project and Customer relationship is invalid.','retryable',false,'refreshRequired',false); END IF;
  IF EXISTS(SELECT 1 FROM rentals WHERE company_id=tenant AND (id=command->>'rentalId' OR lower(rental_number)=lower(command->>'rentalNumber'))) THEN
    RETURN jsonb_build_object('success',false,'code','RENTAL_CONFLICT','message','Rental identity is already in use.','retryable',false,'refreshRequired',false);
  END IF;
  SELECT count(*),count(DISTINCT item->>'equipmentId') INTO requested_count,valid_count FROM jsonb_array_elements(command->'lines') item;
  IF requested_count<>valid_count OR EXISTS(SELECT 1 FROM jsonb_array_elements(command->'lines') item WHERE
      nullif(item->>'id','') IS NULL OR nullif(item->>'equipmentId','') IS NULL OR nullif(item->>'assignmentId','') IS NULL OR nullif(item->>'operatorId','') IS NULL) THEN
    RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED','message','Rental equipment lines are incomplete or duplicated.','retryable',false,'refreshRequired',false);
  END IF;

  PERFORM e.id FROM equipment e JOIN jsonb_array_elements(command->'lines') item ON item->>'equipmentId'=e.id
    WHERE e.company_id=tenant ORDER BY e.id FOR UPDATE;
  SELECT count(*) INTO valid_count
  FROM jsonb_array_elements(command->'lines') item
  JOIN equipment e ON e.id=item->>'equipmentId' AND e.company_id=tenant AND e.active AND e.deleted_at IS NULL
  JOIN operators o ON o.id=item->>'operatorId' AND o.company_id=tenant AND o.status='Active' AND o.deleted_at IS NULL
  JOIN assignments a ON a.id=item->>'assignmentId' AND a.company_id=tenant AND a.status='Active' AND a.deleted_at IS NULL
    AND a.equipment_id=e.id AND a.operator_id=o.id AND a.project_id=project.id;
  IF valid_count<>requested_count THEN RETURN jsonb_build_object('success',false,'code','MISSING_RELATIONSHIP','message','A Rental line relationship is unavailable or invalid.','retryable',false,'refreshRequired',false); END IF;
  IF EXISTS(
    SELECT 1 FROM jsonb_array_elements(command->'lines') item
    JOIN rental_equipment_lines existing_line ON existing_line.equipment_id=item->>'equipmentId' AND existing_line.deleted_at IS NULL
    JOIN rentals existing_rental ON existing_rental.id=existing_line.rental_id AND existing_rental.company_id=tenant
      AND existing_rental.status IN('Draft','Assigned','Reserved','Released','Active')
  ) THEN RETURN jsonb_build_object('success',false,'code','EQUIPMENT_UNAVAILABLE','message','Equipment is unavailable for this Rental.','retryable',false,'refreshRequired',false); END IF;

  INSERT INTO rentals(id,rental_number,customer_id,project_id,customer_snapshot,project_snapshot,date_out,expected_return,
    rental_type,status,reserved_at,created_by,updated_by,company_id,legacy_payload)
  VALUES(command->>'rentalId',trim(command->>'rentalNumber'),customer.id,project.id,customer.name,project.name,
    (command->>'dateOut')::date,nullif(command->>'expectedReturn','')::date,command->>'rentalType','Reserved',now_at,actor,actor,tenant,
    jsonb_build_object('approvalStatus','Approved'));
  FOR line IN SELECT value FROM jsonb_array_elements(command->'lines') LOOP
    INSERT INTO rental_equipment_lines(id,rental_id,equipment_id,assignment_id,operator_id,status,commercial_snapshot_required,created_by,updated_by,company_id)
    VALUES(line->>'id',command->>'rentalId',line->>'equipmentId',line->>'assignmentId',line->>'operatorId','Reserved',true,actor,actor,tenant);
  END LOOP;
  UPDATE equipment e SET status_id=coalesce((SELECT id FROM equipment_statuses WHERE lower(code)='assigned' LIMIT 1),e.status_id),
    project_id=project.id,operator_id=(SELECT item->>'operatorId' FROM jsonb_array_elements(command->'lines') item WHERE item->>'equipmentId'=e.id),updated_by=actor
  WHERE e.company_id=tenant AND e.id IN(SELECT item->>'equipmentId' FROM jsonb_array_elements(command->'lines') item);
  INSERT INTO audit_log(id,aggregate_type,aggregate_id,action,actor_id,occurred_at,correlation_id,new_values,metadata,company_id)
  VALUES(extensions.gen_random_uuid()::text,'Rental',command->>'rentalId','RENTAL_RESERVED',actor,now_at,command->>'commandId',
    jsonb_build_object('status','Reserved','lineCount',requested_count),jsonb_build_object('source','command_create_reserved_rental'),tenant);
  response=jsonb_build_object('success',true,'disposition','ACCEPTED','serverOccurredAt',now_at,'refresh',jsonb_build_array(command->>'rentalId'),
    'value',jsonb_build_object('rentalId',command->>'rentalId','rentalNumber',trim(command->>'rentalNumber'),'status','Reserved','version',1));
  RETURN finish_operational_command(command,'CREATE_RESERVED_RENTAL','RENTAL',command->>'rentalId',tenant,actor,payload_hash,response,1);
EXCEPTION WHEN unique_violation THEN
  RETURN jsonb_build_object('success',false,'code','RENTAL_CONFLICT','message','Rental or equipment identity conflicts with an active record.','retryable',false,'refreshRequired',true);
WHEN OTHERS THEN
  RETURN jsonb_build_object('success',false,'code','PERSISTENCE_FAILURE','message','Rental creation could not be completed.','retryable',false,'refreshRequired',true);
END $$;

CREATE FUNCTION execute_rental_lifecycle_transition(command jsonb, command_type text, required_status rental_status, next_status rental_status, required_permission text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,auth AS $$
DECLARE tenant text; actor text; rental rentals; line rental_equipment_lines; idem jsonb; payload_hash text; response jsonb; now_at timestamptz=clock_timestamp();
BEGIN
  tenant=(SELECT company_id FROM users WHERE id=auth.uid() AND status='active'); actor=auth.uid()::text;
  IF tenant IS NULL THEN RETURN jsonb_build_object('success',false,'code','UNAUTHENTICATED','message','Authentication is required.','retryable',false,'refreshRequired',false); END IF;
  IF NOT current_user_has_permission(required_permission) THEN RETURN jsonb_build_object('success',false,'code','FORBIDDEN','message','Rental lifecycle permission is required.','retryable',false,'refreshRequired',false); END IF;
  SELECT * INTO rental FROM rentals WHERE id=command->>'rentalId' AND company_id=tenant FOR UPDATE;
  IF rental.id IS NULL THEN RETURN jsonb_build_object('success',false,'code','NOT_FOUND','message','Rental is unavailable.','retryable',false,'refreshRequired',false); END IF;
  idem=begin_operational_command(command,command_type,'RENTAL',rental.id,tenant,actor);
  IF idem->>'state'='INVALID' THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED','message','An idempotency key is required.','retryable',false,'refreshRequired',false); END IF;
  IF idem->>'state'='MISMATCH' THEN RETURN jsonb_build_object('success',false,'code','IDEMPOTENCY_MISMATCH','message','Idempotency key payload mismatch.','retryable',false,'refreshRequired',false); END IF;
  IF idem->>'state'='REPLAY' THEN RETURN (idem->'response')||jsonb_build_object('disposition','REPLAYED'); END IF; payload_hash=idem->>'payloadHash';
  IF rental.row_version<>coalesce((command->>'expectedVersion')::bigint,rental.row_version) THEN RETURN jsonb_build_object('success',false,'code','CONFLICT','message','Rental version is stale.','retryable',false,'refreshRequired',true,'currentVersion',rental.row_version); END IF;
  IF rental.status<>required_status THEN RETURN jsonb_build_object('success',false,'code',CASE WHEN next_status='Cancelled' THEN 'CANCELLATION_NOT_ALLOWED' ELSE 'INVALID_TRANSITION' END,'message','Rental lifecycle transition is not allowed.','retryable',false,'refreshRequired',false); END IF;
  PERFORM e.id FROM equipment e JOIN rental_equipment_lines l ON l.equipment_id=e.id WHERE l.rental_id=rental.id AND l.company_id=tenant ORDER BY e.id FOR UPDATE;
  IF next_status IN('Released','Active') AND EXISTS(
    SELECT 1 FROM rental_equipment_lines l LEFT JOIN assignments a ON a.id=l.assignment_id AND a.company_id=tenant
    LEFT JOIN operators o ON o.id=l.operator_id AND o.company_id=tenant
    WHERE l.rental_id=rental.id AND (a.id IS NULL OR a.status<>'Active' OR a.equipment_id<>l.equipment_id OR a.operator_id<>l.operator_id OR o.status<>'Active')
  ) THEN RETURN jsonb_build_object('success',false,'code','MISSING_RELATIONSHIP','message','Active assignment and operator evidence is required.','retryable',false,'refreshRequired',false); END IF;
  IF next_status='Released' AND coalesce(rental.legacy_payload->>'approvalStatus','')<>'Approved' THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED','message','Manager approval is required before release.','retryable',false,'refreshRequired',false); END IF;
  IF next_status='Cancelled' AND (EXISTS(SELECT 1 FROM deurs WHERE rental_id=rental.id) OR EXISTS(SELECT 1 FROM billing_statements WHERE rental_id=rental.id AND deleted_at IS NULL)) THEN
    RETURN jsonb_build_object('success',false,'code','CANCELLATION_NOT_ALLOWED','message','Operational or billing evidence prevents cancellation.','retryable',false,'refreshRequired',false);
  END IF;
  UPDATE rentals SET status=next_status,
    released_at=CASE WHEN next_status='Released' THEN now_at ELSE released_at END,
    activated_at=CASE WHEN next_status='Active' THEN now_at ELSE activated_at END,
    cancelled_at=CASE WHEN next_status='Cancelled' THEN now_at ELSE cancelled_at END,
    rented_by=CASE WHEN next_status='Released' THEN coalesce((SELECT display_name FROM users WHERE id=auth.uid()),'') ELSE rented_by END,updated_by=actor
  WHERE id=rental.id RETURNING * INTO rental;
  UPDATE rental_equipment_lines SET status=next_status,updated_by=actor WHERE rental_id=rental.id AND company_id=tenant;
  IF next_status='Released' THEN
    UPDATE equipment e SET status_id=coalesce((SELECT id FROM equipment_statuses WHERE lower(code)='rented' LIMIT 1),e.status_id),updated_by=actor
    WHERE e.id IN(SELECT equipment_id FROM rental_equipment_lines WHERE rental_id=rental.id);
  ELSIF next_status='Cancelled' THEN
    FOR line IN SELECT * FROM rental_equipment_lines WHERE rental_id=rental.id ORDER BY equipment_id LOOP
      UPDATE equipment e SET
        status_id=coalesce((SELECT id FROM equipment_statuses WHERE lower(code)=CASE WHEN EXISTS(SELECT 1 FROM assignments a WHERE a.id=line.assignment_id AND a.status='Active') THEN 'assigned' ELSE 'available' END LIMIT 1),e.status_id),
        project_id=CASE WHEN EXISTS(SELECT 1 FROM assignments a WHERE a.id=line.assignment_id AND a.status='Active') THEN (SELECT project_id FROM assignments WHERE id=line.assignment_id) ELSE NULL END,
        operator_id=CASE WHEN EXISTS(SELECT 1 FROM assignments a WHERE a.id=line.assignment_id AND a.status='Active') THEN line.operator_id ELSE NULL END,updated_by=actor
      WHERE e.id=line.equipment_id AND NOT EXISTS(
        SELECT 1 FROM rental_equipment_lines other_line JOIN rentals other_rental ON other_rental.id=other_line.rental_id
        WHERE other_line.equipment_id=e.id AND other_rental.id<>rental.id AND other_rental.status IN('Draft','Assigned','Reserved','Released','Active')
      );
    END LOOP;
  END IF;
  INSERT INTO audit_log(id,aggregate_type,aggregate_id,action,actor_id,occurred_at,correlation_id,previous_values,new_values,metadata,company_id)
  VALUES(extensions.gen_random_uuid()::text,'Rental',rental.id,command_type,actor,now_at,command->>'commandId',
    jsonb_build_object('status',required_status),jsonb_build_object('status',next_status,'version',rental.row_version),jsonb_build_object('source','rental_lifecycle_command'),tenant);
  response=jsonb_build_object('success',true,'disposition','ACCEPTED','serverOccurredAt',now_at,'refresh',jsonb_build_array(rental.id),
    'value',jsonb_build_object('rentalId',rental.id,'rentalNumber',rental.rental_number,'status',rental.status,'version',rental.row_version));
  RETURN finish_operational_command(command,command_type,'RENTAL',rental.id,tenant,actor,payload_hash,response,rental.row_version);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success',false,'code','PERSISTENCE_FAILURE','message','Rental transition could not be completed.','retryable',false,'refreshRequired',true);
END $$;

CREATE FUNCTION command_release_rental(command jsonb) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=erp,auth AS
$$ SELECT execute_rental_lifecycle_transition(command,'RELEASE_RENTAL','Reserved','Released','rental.release') $$;
CREATE FUNCTION command_activate_rental(command jsonb) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=erp,auth AS
$$ SELECT execute_rental_lifecycle_transition(command,'ACTIVATE_RENTAL','Released','Active','rental.manage') $$;
CREATE FUNCTION command_cancel_rental(command jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,auth AS $$
DECLARE state rental_status;
BEGIN
  SELECT status INTO state FROM rentals WHERE id=command->>'rentalId' AND company_id=(SELECT company_id FROM users WHERE id=auth.uid() AND status='active');
  IF state NOT IN('Draft','Assigned','Reserved') THEN RETURN jsonb_build_object('success',false,'code','CANCELLATION_NOT_ALLOWED','message','Rental cancellation is not allowed.','retryable',false,'refreshRequired',false); END IF;
  RETURN execute_rental_lifecycle_transition(command,'CANCEL_RENTAL',state,'Cancelled','rental.manage');
END $$;

REVOKE ALL ON FUNCTION execute_rental_lifecycle_transition(jsonb,text,rental_status,rental_status,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION command_create_reserved_rental(jsonb),command_release_rental(jsonb),command_activate_rental(jsonb),command_cancel_rental(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION command_create_reserved_rental(jsonb),command_release_rental(jsonb),command_activate_rental(jsonb),command_cancel_rental(jsonb) TO authenticated;

COMMIT;
