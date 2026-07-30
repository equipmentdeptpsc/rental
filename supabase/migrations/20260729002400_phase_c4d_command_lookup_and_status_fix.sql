BEGIN;
SET search_path TO erp, auth, pg_catalog;

CREATE OR REPLACE FUNCTION command_transition_deur_activity(command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,auth AS $$
DECLARE
  tenant text=current_company_id(); scope jsonb; idem jsonb; now_at timestamptz=deur_operational_clock();
  current_deur deurs%ROWTYPE; response jsonb; payload_hash text;
  next_activity text; next_sequence integer; open_activity text;
BEGIN
  scope=validate_deur_command_scope(command,'deur.create');
  IF scope->>'code'<>'OK' THEN RETURN jsonb_build_object('success',false,'code',scope->>'code'); END IF;
  idem=begin_deur_command(command,'ACTIVITY_TRANSITION');
  IF idem->>'state'='MISMATCH' THEN RETURN jsonb_build_object('success',false,'code','IDEMPOTENCY_MISMATCH'); END IF;
  IF idem->>'state'='REPLAY' THEN RETURN (idem->'response')||jsonb_build_object('disposition','REPLAYED'); END IF;
  payload_hash=idem->>'payloadHash';
  SELECT d.* INTO current_deur FROM erp.deurs AS d
    WHERE d.id=(command->>'deurId') AND d.company_id=tenant FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success',false,'code','NOT_FOUND'); END IF;
  IF current_deur.rental_equipment_line_id<>command->>'rentalLineId'
     OR current_deur.operator_id<>command->>'operatorId'
  THEN RETURN jsonb_build_object('success',false,'code','OWNERSHIP_MISMATCH'); END IF;
  IF current_deur.row_version<>(command->>'expectedVersion')::bigint THEN
    RETURN jsonb_build_object('success',false,'code','CONFLICT','aggregateId',current_deur.id,
      'expectedVersion',(command->>'expectedVersion')::bigint,'currentVersion',current_deur.row_version,'refreshRequired',true);
  END IF;
  IF current_deur.status<>'In Progress' THEN RETURN jsonb_build_object('success',false,'code','INVALID_TRANSITION'); END IF;
  SELECT ev.activity_type INTO open_activity FROM erp.deur_events AS ev
    WHERE ev.deur_id=current_deur.id AND ev.is_open AND ev.activity_type<>'shift' FOR UPDATE;
  next_activity=CASE command->>'action'
    WHEN 'START_OPERATION' THEN 'operation' WHEN 'RESUME_OPERATION' THEN 'operation'
    WHEN 'START_IDLE' THEN 'idle' WHEN 'START_STANDBY' THEN 'standby'
    WHEN 'START_MEAL_BREAK' THEN 'mealBreak' WHEN 'START_BREAKDOWN' THEN 'breakdown'
    WHEN 'END_ACTIVITY' THEN NULL ELSE 'INVALID' END;
  IF next_activity='INVALID' OR next_activity IS NOT DISTINCT FROM open_activity THEN
    RETURN jsonb_build_object('success',false,'code','INVALID_TRANSITION');
  END IF;
  UPDATE erp.deur_events AS ev SET is_open=false
    WHERE ev.deur_id=current_deur.id AND ev.is_open AND ev.activity_type<>'shift';
  SELECT coalesce(max(ev.sequence),0)+1 INTO next_sequence FROM erp.deur_events AS ev WHERE ev.deur_id=current_deur.id;
  IF open_activity IS NOT NULL THEN
    INSERT INTO erp.deur_events(id,deur_id,activity_type,action,occurred_at,sequence,source,actor_id,server_accepted_at,client_created_at,command_id,idempotency_key,device_id,is_open)
    VALUES(extensions.gen_random_uuid()::text,current_deur.id,open_activity,'end',now_at,next_sequence,'server',auth.uid()::text,now_at,
      nullif(command->>'clientCreatedAt','')::timestamptz,command->>'commandId',command->>'idempotencyKey',command->>'deviceId',false);
    next_sequence=next_sequence+1;
  END IF;
  IF next_activity IS NOT NULL THEN
    INSERT INTO erp.deur_events(id,deur_id,activity_type,action,occurred_at,sequence,source,actor_id,server_accepted_at,client_created_at,command_id,idempotency_key,device_id,is_open)
    VALUES(extensions.gen_random_uuid()::text,current_deur.id,next_activity,'start',now_at,next_sequence,'server',auth.uid()::text,now_at,
      nullif(command->>'clientCreatedAt','')::timestamptz,command->>'commandId',command->>'idempotencyKey',command->>'deviceId',true);
  END IF;
  UPDATE erp.deurs AS d SET updated_at=now_at,updated_by=auth.uid()::text
    WHERE d.id=current_deur.id RETURNING d.* INTO current_deur;
  INSERT INTO erp.audit_log(id,aggregate_type,aggregate_id,action,actor_id,occurred_at,correlation_id,new_values,company_id)
  VALUES(extensions.gen_random_uuid()::text,'DEUR',current_deur.id,'ACTIVITY_TRANSITION',auth.uid()::text,now_at,
    command->>'commandId',jsonb_build_object('action',command->>'action'),tenant);
  response=jsonb_build_object('success',true,'disposition','ACCEPTED','record',to_jsonb(current_deur),
    'version',current_deur.row_version,'serverOccurredAt',now_at);
  RETURN finish_deur_command(command,'ACTIVITY_TRANSITION',current_deur.id,payload_hash,response);
END $$;

CREATE OR REPLACE FUNCTION command_complete_deur_shift(command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,auth AS $$
DECLARE
  tenant text=current_company_id(); scope jsonb; idem jsonb; now_at timestamptz=deur_operational_clock();
  current_deur deurs%ROWTYPE; response jsonb; payload_hash text; next_sequence integer; open_activity text;
BEGIN
  scope=validate_deur_command_scope(command,'deur.create');
  IF scope->>'code'<>'OK' THEN RETURN jsonb_build_object('success',false,'code',scope->>'code'); END IF;
  idem=begin_deur_command(command,'COMPLETE_SHIFT');
  IF idem->>'state'='MISMATCH' THEN RETURN jsonb_build_object('success',false,'code','IDEMPOTENCY_MISMATCH'); END IF;
  IF idem->>'state'='REPLAY' THEN RETURN (idem->'response')||jsonb_build_object('disposition','REPLAYED'); END IF;
  payload_hash=idem->>'payloadHash';
  SELECT d.* INTO current_deur FROM erp.deurs AS d
    WHERE d.id=(command->>'deurId') AND d.company_id=tenant FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success',false,'code','NOT_FOUND'); END IF;
  IF current_deur.operator_id<>command->>'operatorId' THEN RETURN jsonb_build_object('success',false,'code','OWNERSHIP_MISMATCH'); END IF;
  IF current_deur.row_version<>(command->>'expectedVersion')::bigint THEN
    RETURN jsonb_build_object('success',false,'code','CONFLICT','aggregateId',current_deur.id,
      'expectedVersion',(command->>'expectedVersion')::bigint,'currentVersion',current_deur.row_version,'refreshRequired',true);
  END IF;
  IF current_deur.status<>'In Progress' THEN RETURN jsonb_build_object('success',false,'code','INVALID_TRANSITION'); END IF;
  IF command->>'meterRequirement' IN ('hourMeter','odometer') AND nullif(command->>'closingMeter','') IS NULL THEN
    RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED');
  END IF;
  SELECT ev.activity_type INTO open_activity FROM erp.deur_events AS ev
    WHERE ev.deur_id=current_deur.id AND ev.is_open AND ev.activity_type<>'shift' FOR UPDATE;
  UPDATE erp.deur_events AS ev SET is_open=false WHERE ev.deur_id=current_deur.id AND ev.is_open;
  SELECT coalesce(max(ev.sequence),0)+1 INTO next_sequence FROM erp.deur_events AS ev WHERE ev.deur_id=current_deur.id;
  IF open_activity IS NOT NULL THEN
    INSERT INTO erp.deur_events(id,deur_id,activity_type,action,occurred_at,sequence,source,actor_id,server_accepted_at,client_created_at,command_id,idempotency_key,device_id,is_open)
    VALUES(extensions.gen_random_uuid()::text,current_deur.id,open_activity,'end',now_at,next_sequence,'server',auth.uid()::text,now_at,
      nullif(command->>'clientCreatedAt','')::timestamptz,command->>'commandId',command->>'idempotencyKey',command->>'deviceId',false);
    next_sequence=next_sequence+1;
  END IF;
  INSERT INTO erp.deur_events(id,deur_id,activity_type,action,occurred_at,sequence,source,actor_id,server_accepted_at,client_created_at,command_id,idempotency_key,device_id,is_open)
  VALUES(extensions.gen_random_uuid()::text,current_deur.id,'shift','end',now_at,next_sequence,'server',auth.uid()::text,now_at,
    nullif(command->>'clientCreatedAt','')::timestamptz,command->>'commandId',command->>'idempotencyKey',command->>'deviceId',false);
  UPDATE erp.deurs AS d SET closing_meter=coalesce(nullif(command->>'closingMeter','')::numeric,d.closing_meter),
    updated_at=now_at,updated_by=auth.uid()::text WHERE d.id=current_deur.id RETURNING d.* INTO current_deur;
  INSERT INTO erp.audit_log(id,aggregate_type,aggregate_id,action,actor_id,occurred_at,correlation_id,new_values,company_id)
  VALUES(extensions.gen_random_uuid()::text,'DEUR',current_deur.id,'COMPLETE_SHIFT',auth.uid()::text,now_at,
    command->>'commandId',to_jsonb(current_deur),tenant);
  response=jsonb_build_object('success',true,'disposition','ACCEPTED','record',to_jsonb(current_deur),
    'version',current_deur.row_version,'serverOccurredAt',now_at);
  RETURN finish_deur_command(command,'COMPLETE_SHIFT',current_deur.id,payload_hash,response);
END $$;

CREATE OR REPLACE FUNCTION command_return_rental_line(command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,auth AS $$
DECLARE
  tenant text=current_company_id(); rental rentals%ROWTYPE; line rental_equipment_lines%ROWTYPE;
  available_status text; now_at timestamptz=clock_timestamp(); idem jsonb; payload_hash text; response jsonb;
BEGIN
  IF tenant IS NULL OR NOT current_user_has_permission('rental.return') THEN RETURN jsonb_build_object('success',false,'code','FORBIDDEN'); END IF;
  SELECT r.* INTO rental FROM erp.rentals AS r WHERE r.id=command->>'rentalId' AND r.company_id=tenant FOR UPDATE;
  SELECT l.* INTO line FROM erp.rental_equipment_lines AS l
    WHERE l.id=command->>'rentalLineId' AND l.rental_id=rental.id AND l.company_id=tenant FOR UPDATE;
  IF line.id IS NULL OR line.equipment_id<>command->>'equipmentId'
     OR line.assignment_id IS DISTINCT FROM command->>'assignmentId'
  THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;
  idem=begin_operational_command(command,'RETURN_RENTAL_LINE','RENTAL_LINE',line.id,tenant,auth.uid()::text);
  IF idem->>'state'='MISMATCH' THEN RETURN jsonb_build_object('success',false,'code','IDEMPOTENCY_MISMATCH'); END IF;
  IF idem->>'state'='REPLAY' THEN RETURN (idem->'response')||jsonb_build_object('disposition','REPLAYED'); END IF;
  payload_hash=idem->>'payloadHash';
  IF line.row_version<>coalesce((command->>'expectedVersion')::bigint,line.row_version) THEN
    RETURN jsonb_build_object('success',false,'code','CONFLICT','currentVersion',line.row_version,'refreshRequired',true);
  END IF;
  IF EXISTS(SELECT 1 FROM erp.deurs AS d WHERE d.rental_equipment_line_id=line.id
    AND d.status IN('Draft','In Progress','Submitted','Pending Acknowledgement','Rejected'))
  THEN RETURN jsonb_build_object('success',false,'code','INVALID_TRANSITION'); END IF;
  SELECT es.id INTO available_status FROM erp.equipment_statuses AS es WHERE lower(es.code)='available' ORDER BY es.id LIMIT 1;
  IF available_status IS NULL THEN RETURN jsonb_build_object('success',false,'code','PERSISTENCE_FAILURE'); END IF;
  UPDATE erp.rental_equipment_lines AS l SET status='Returned' WHERE l.id=line.id RETURNING l.* INTO line;
  UPDATE erp.equipment AS e SET status_id=available_status,project_id=NULL,operator_id=NULL
    WHERE e.id=line.equipment_id AND e.company_id=tenant;
  UPDATE erp.assignments AS a SET status='Completed',returned_date=current_date
    WHERE a.id=line.assignment_id AND a.company_id=tenant AND a.status='Active';
  IF NOT EXISTS(SELECT 1 FROM erp.rental_equipment_lines AS l
    WHERE l.rental_id=rental.id AND l.status NOT IN('Returned','Closed','Cancelled'))
  THEN UPDATE erp.rentals AS r SET status='Returned',returned_at=now_at WHERE r.id=rental.id; END IF;
  response=jsonb_build_object('success',true,'disposition','ACCEPTED','serverOccurredAt',now_at,
    'refresh',jsonb_build_array(rental.id,line.id,line.equipment_id,line.assignment_id),
    'value',jsonb_build_object('rentalId',rental.id,'rentalLineId',line.id,'status',line.status,'version',line.row_version));
  RETURN finish_operational_command(command,'RETURN_RENTAL_LINE','RENTAL_LINE',line.id,tenant,auth.uid()::text,payload_hash,response,line.row_version);
END $$;

REVOKE ALL ON FUNCTION command_transition_deur_activity(jsonb),command_complete_deur_shift(jsonb),command_return_rental_line(jsonb)
  FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION command_transition_deur_activity(jsonb),command_complete_deur_shift(jsonb),command_return_rental_line(jsonb)
  TO authenticated;

COMMIT;
