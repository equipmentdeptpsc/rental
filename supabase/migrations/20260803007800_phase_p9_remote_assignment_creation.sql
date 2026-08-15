BEGIN;
SET search_path TO erp, auth, pg_catalog;

CREATE FUNCTION erp.command_create_assignment(command jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = erp, auth, pg_catalog
AS $$
DECLARE
  tenant text;
  actor text;
  now_at timestamptz := pg_catalog.clock_timestamp();
  assigned_on date;
  expected_on date;
  target_equipment erp.equipment;
  target_operator erp.operators;
  target_project erp.projects;
  target_activity erp.activity_codes;
  created_assignment erp.assignments;
  idem jsonb;
  payload_hash text;
  response jsonb;
BEGIN
  tenant := (SELECT company_id FROM erp.users WHERE id = auth.uid() AND status = 'active');
  actor := auth.uid()::text;
  IF tenant IS NULL THEN
    RETURN jsonb_build_object('success',false,'code','UNAUTHENTICATED','message','Authentication is required.','retryable',false,'refreshRequired',false);
  END IF;
  IF NOT erp.current_user_has_permission('assignment.manage') THEN
    RETURN jsonb_build_object('success',false,'code','FORBIDDEN','message','Assignment management permission is required.','retryable',false,'refreshRequired',false);
  END IF;
  IF command ?| ARRAY['companyId','company_id','tenantId','tenant_id','actorId','actor_id','userId','user_id','status','permission'] THEN
    RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED','message','Assignment authority fields are derived from the authenticated session.','retryable',false,'refreshRequired',false);
  END IF;
  IF nullif(pg_catalog.btrim(command->>'assignmentId'),'') IS NULL
     OR pg_catalog.length(command->>'assignmentId') > 200
     OR command->>'assignmentId' <> pg_catalog.btrim(command->>'assignmentId')
     OR nullif(command->>'equipmentId','') IS NULL
     OR nullif(command->>'operatorId','') IS NULL
     OR nullif(command->>'projectId','') IS NULL
     OR nullif(command->>'assignedDate','') IS NULL
     OR nullif(command->>'expectedReturn','') IS NULL
     OR nullif(command->>'commandId','') IS NULL
     OR nullif(command->>'idempotencyKey','') IS NULL THEN
    RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED','message','Required Assignment details are incomplete.','retryable',false,'refreshRequired',false);
  END IF;
  BEGIN
    assigned_on := (command->>'assignedDate')::date;
    expected_on := (command->>'expectedReturn')::date;
  EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
    RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED','message','Assignment dates are invalid.','retryable',false,'refreshRequired',false);
  END;
  IF expected_on < assigned_on THEN
    RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED','message','Expected return cannot precede the assigned date.','retryable',false,'refreshRequired',false);
  END IF;

  idem := erp.begin_operational_command(command,'CREATE_ASSIGNMENT','ASSIGNMENT',command->>'assignmentId',tenant,actor);
  IF idem->>'state' = 'INVALID' THEN
    RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED','message','Command identity is required.','retryable',false,'refreshRequired',false);
  END IF;
  IF idem->>'state' = 'MISMATCH' THEN
    RETURN jsonb_build_object('success',false,'code','IDEMPOTENCY_MISMATCH','message','Idempotency key payload mismatch.','retryable',false,'refreshRequired',false);
  END IF;
  IF idem->>'state' = 'REPLAY' THEN
    RETURN (idem->'response') || jsonb_build_object('disposition','REPLAYED');
  END IF;
  payload_hash := idem->>'payloadHash';

  SELECT e.* INTO target_equipment
  FROM erp.equipment e
  WHERE e.id = command->>'equipmentId' AND e.company_id = tenant
  FOR UPDATE;
  SELECT o.* INTO target_operator
  FROM erp.operators o
  WHERE o.id = command->>'operatorId' AND o.company_id = tenant
  FOR UPDATE;
  SELECT p.* INTO target_project
  FROM erp.projects p
  WHERE p.id = command->>'projectId' AND p.company_id = tenant;

  IF target_equipment.id IS NULL OR NOT target_equipment.active OR target_equipment.deleted_at IS NOT NULL THEN
    RETURN jsonb_build_object('success',false,'code','NOT_FOUND','message','Active Equipment is unavailable for Assignment.','retryable',false,'refreshRequired',false);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM erp.equipment_statuses s
    WHERE s.id = target_equipment.status_id AND pg_catalog.lower(s.code) = 'available' AND s.active AND s.deleted_at IS NULL
  ) THEN
    RETURN jsonb_build_object('success',false,'code','EQUIPMENT_UNAVAILABLE','message','Equipment is not available for Assignment.','retryable',false,'refreshRequired',false);
  END IF;
  IF target_operator.id IS NULL OR target_operator.status <> 'Active' OR target_operator.deleted_at IS NOT NULL THEN
    RETURN jsonb_build_object('success',false,'code','NOT_FOUND','message','Active Operator is unavailable for Assignment.','retryable',false,'refreshRequired',false);
  END IF;
  IF target_project.id IS NULL OR NOT target_project.active OR target_project.deleted_at IS NOT NULL THEN
    RETURN jsonb_build_object('success',false,'code','NOT_FOUND','message','Active Project is unavailable for Assignment.','retryable',false,'refreshRequired',false);
  END IF;
  IF nullif(command->>'activityCodeId','') IS NOT NULL THEN
    SELECT a.* INTO target_activity FROM erp.activity_codes a
    WHERE a.id = command->>'activityCodeId' AND a.active AND a.deleted_at IS NULL;
    IF target_activity.id IS NULL THEN
      RETURN jsonb_build_object('success',false,'code','NOT_FOUND','message','Active Activity Code is unavailable for Assignment.','retryable',false,'refreshRequired',false);
    END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM erp.assignments a WHERE a.company_id=tenant AND a.id=command->>'assignmentId') THEN
    RETURN jsonb_build_object('success',false,'code','CONFLICT','message','Assignment identity is already in use.','retryable',false,'refreshRequired',true);
  END IF;
  IF EXISTS (SELECT 1 FROM erp.assignments a WHERE a.company_id=tenant AND a.equipment_id=target_equipment.id AND a.status='Active' AND a.deleted_at IS NULL) THEN
    RETURN jsonb_build_object('success',false,'code','EQUIPMENT_UNAVAILABLE','message','Equipment already has an active Assignment.','retryable',false,'refreshRequired',true);
  END IF;
  IF EXISTS (SELECT 1 FROM erp.assignments a WHERE a.company_id=tenant AND a.operator_id=target_operator.id AND a.status='Active' AND a.deleted_at IS NULL) THEN
    RETURN jsonb_build_object('success',false,'code','CONFLICT','message','Operator already has an active Assignment.','retryable',false,'refreshRequired',true);
  END IF;

  INSERT INTO erp.assignments(
    id,equipment_id,operator_id,project_id,activity_code_id,assigned_date,expected_return,
    remarks,status,created_by,updated_by,company_id
  ) VALUES (
    command->>'assignmentId',target_equipment.id,target_operator.id,target_project.id,target_activity.id,
    assigned_on,expected_on,coalesce(command->>'remarks',''),'Active',actor,actor,tenant
  ) RETURNING * INTO created_assignment;

  UPDATE erp.equipment e SET
    status_id = (SELECT s.id FROM erp.equipment_statuses s WHERE pg_catalog.lower(s.code)='assigned' AND s.active AND s.deleted_at IS NULL ORDER BY s.sort_order,s.id LIMIT 1),
    project_id = target_project.id,
    operator_id = target_operator.id,
    updated_by = actor
  WHERE e.id = target_equipment.id AND e.company_id = tenant;

  INSERT INTO erp.audit_log(
    id,aggregate_type,aggregate_id,action,actor_id,occurred_at,correlation_id,new_values,metadata,company_id
  ) VALUES (
    extensions.gen_random_uuid()::text,'Assignment',created_assignment.id,'ASSIGNMENT_CREATED',actor,now_at,command->>'commandId',
    jsonb_build_object('equipmentId',created_assignment.equipment_id,'operatorId',created_assignment.operator_id,'projectId',created_assignment.project_id,'status',created_assignment.status),
    jsonb_build_object('source','command_create_assignment'),tenant
  );

  response := jsonb_build_object(
    'success',true,'disposition','ACCEPTED','serverOccurredAt',now_at,
    'refresh',jsonb_build_array(created_assignment.id,created_assignment.equipment_id),
    'value',jsonb_build_object(
      'id',created_assignment.id,'companyId',created_assignment.company_id,
      'equipmentId',created_assignment.equipment_id,'operatorId',created_assignment.operator_id,
      'projectId',created_assignment.project_id,'activityCodeId',created_assignment.activity_code_id,
      'assignedDate',created_assignment.assigned_date,'expectedReturn',created_assignment.expected_return,
      'remarks',created_assignment.remarks,'status',created_assignment.status,
      'createdAt',created_assignment.created_at,'updatedAt',created_assignment.updated_at,
      'rowVersion',created_assignment.row_version
    )
  );
  RETURN erp.finish_operational_command(command,'CREATE_ASSIGNMENT','ASSIGNMENT',created_assignment.id,tenant,actor,payload_hash,response,created_assignment.row_version);
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('success',false,'code','CONFLICT','message','Equipment, Operator, or Assignment identity conflicts with an active Assignment.','retryable',false,'refreshRequired',true);
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success',false,'code','PERSISTENCE_FAILURE','message','Assignment creation could not be completed.','retryable',false,'refreshRequired',true);
END;
$$;

REVOKE ALL ON FUNCTION erp.command_create_assignment(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION erp.command_create_assignment(jsonb) TO authenticated;

COMMIT;
