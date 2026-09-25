-- R3D-BQ: preserve the field occurrence time for Activity and Complete Shift.
--
-- This is intentionally RPC-local.  It does not alter erp.deur_events, install
-- a trigger, backfill history, or change any other command writer.  The bounded
-- five-minute future allowance is the narrow clock-skew policy for a field
-- device.  There is no server-age cap: an authenticated offline-continuation
-- command may legitimately be replayed up to the continuation window later.

CREATE OR REPLACE FUNCTION erp.command_transition_deur_activity(command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,auth,extensions,pg_catalog AS $$
DECLARE
  tenant text:=erp.current_company_id(); scope jsonb; idem jsonb; now_at timestamptz:=erp.deur_operational_clock();
  current_deur erp.deurs%ROWTYPE; response jsonb; payload_hash text; next_activity text; next_sequence integer; open_activity text;
  client_occurrence_at timestamptz; effective_occurrence_at timestamptz; predecessor_occurrence_at timestamptz;
BEGIN
  scope:=erp.validate_deur_custody_command_scope(command,'deur.create');
  IF scope->>'code'<>'OK' THEN RETURN jsonb_build_object('success',false,'code',scope->>'code'); END IF;
  idem:=erp.begin_deur_command(command,'ACTIVITY_TRANSITION');
  IF idem->>'state'='MISMATCH' THEN RETURN jsonb_build_object('success',false,'code','IDEMPOTENCY_MISMATCH'); END IF;
  IF idem->>'state'='REPLAY' THEN RETURN (idem->'response')||jsonb_build_object('disposition','REPLAYED'); END IF;
  payload_hash:=idem->>'payloadHash';
  SELECT * INTO current_deur FROM erp.deurs AS deur_record WHERE deur_record.id=(command->>'deurId') AND deur_record.company_id=tenant FOR UPDATE;
  IF current_deur.id IS NULL THEN RETURN jsonb_build_object('success',false,'code','NOT_FOUND'); END IF;
  IF current_deur.rental_equipment_line_id<>command->>'rentalLineId' OR erp.current_deur_authorized_operator(current_deur.id)<>command->>'operatorId' THEN RETURN jsonb_build_object('success',false,'code','OWNERSHIP_MISMATCH'); END IF;
  IF current_deur.row_version<>(command->>'expectedVersion')::bigint THEN RETURN jsonb_build_object('success',false,'code','CONFLICT','aggregateId',current_deur.id,'expectedVersion',(command->>'expectedVersion')::bigint,'currentVersion',current_deur.row_version,'refreshRequired',true); END IF;
  IF current_deur.status<>'In Progress' THEN RETURN jsonb_build_object('success',false,'code','INVALID_TRANSITION'); END IF;
  SELECT event_record.activity_type INTO open_activity FROM erp.deur_events AS event_record WHERE event_record.deur_id=current_deur.id AND event_record.is_open AND event_record.activity_type<>'shift' FOR UPDATE;
  next_activity:=CASE command->>'action' WHEN 'START_OPERATION' THEN 'operation' WHEN 'RESUME_OPERATION' THEN 'operation' WHEN 'START_IDLE' THEN 'idle' WHEN 'START_STANDBY' THEN 'standby' WHEN 'START_MEAL_BREAK' THEN 'mealBreak' WHEN 'START_BREAKDOWN' THEN 'breakdown' WHEN 'END_ACTIVITY' THEN NULL ELSE 'INVALID' END;
  IF next_activity='INVALID' OR next_activity IS NOT DISTINCT FROM open_activity THEN RETURN jsonb_build_object('success',false,'code','INVALID_TRANSITION'); END IF;
  IF nullif(command->>'clientOccurredAt','') IS NOT NULL THEN
    BEGIN client_occurrence_at:=nullif(command->>'clientOccurredAt','')::timestamptz;
    EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow THEN RETURN jsonb_build_object('success',false,'code','INVALID_CLIENT_OCCURRENCE_TIME'); END;
    IF client_occurrence_at>now_at+interval '5 minutes' THEN RETURN jsonb_build_object('success',false,'code','CLIENT_OCCURRENCE_IN_FUTURE'); END IF;
    SELECT max(event_record.occurred_at) INTO predecessor_occurrence_at FROM erp.deur_events AS event_record WHERE event_record.deur_id=current_deur.id;
    IF predecessor_occurrence_at IS NOT NULL AND client_occurrence_at<predecessor_occurrence_at THEN RETURN jsonb_build_object('success',false,'code','CLIENT_OCCURRENCE_BEFORE_PREDECESSOR'); END IF;
    effective_occurrence_at:=client_occurrence_at;
  ELSE
    effective_occurrence_at:=now_at;
  END IF;
  UPDATE erp.deur_events AS event_record SET is_open=false WHERE event_record.deur_id=current_deur.id AND event_record.is_open AND event_record.activity_type<>'shift';
  SELECT coalesce(max(event_record.sequence),0)+1 INTO next_sequence FROM erp.deur_events AS event_record WHERE event_record.deur_id=current_deur.id;
  IF open_activity IS NOT NULL THEN INSERT INTO erp.deur_events(id,deur_id,activity_type,action,occurred_at,sequence,source,actor_id,server_accepted_at,client_created_at,command_id,idempotency_key,device_id,is_open,company_id) VALUES(extensions.gen_random_uuid()::text,current_deur.id,open_activity,'end',effective_occurrence_at,next_sequence,'server',auth.uid()::text,now_at,coalesce(client_occurrence_at,nullif(command->>'clientCreatedAt','')::timestamptz),command->>'commandId',command->>'idempotencyKey',command->>'deviceId',false,tenant); next_sequence:=next_sequence+1; END IF;
  IF next_activity IS NOT NULL THEN INSERT INTO erp.deur_events(id,deur_id,activity_type,action,occurred_at,sequence,source,actor_id,server_accepted_at,client_created_at,command_id,idempotency_key,device_id,is_open,company_id) VALUES(extensions.gen_random_uuid()::text,current_deur.id,next_activity,'start',effective_occurrence_at,next_sequence,'server',auth.uid()::text,now_at,coalesce(client_occurrence_at,nullif(command->>'clientCreatedAt','')::timestamptz),command->>'commandId',command->>'idempotencyKey',command->>'deviceId',true,tenant); END IF;
  UPDATE erp.deurs AS deur_record SET updated_at=now_at,updated_by=auth.uid()::text WHERE deur_record.id=current_deur.id RETURNING * INTO current_deur;
  INSERT INTO erp.audit_log(id,aggregate_type,aggregate_id,action,actor_id,occurred_at,correlation_id,new_values,company_id) VALUES(extensions.gen_random_uuid()::text,'DEUR',current_deur.id,'ACTIVITY_TRANSITION',auth.uid()::text,now_at,command->>'commandId',jsonb_build_object('action',command->>'action','currentAuthorizedOperatorId',command->>'operatorId'),tenant);
  response:=jsonb_build_object('success',true,'disposition','ACCEPTED','record',to_jsonb(current_deur),'version',current_deur.row_version,'serverOccurredAt',now_at);
  RETURN erp.finish_deur_command(command,'ACTIVITY_TRANSITION',current_deur.id,payload_hash,response);
END $$;

CREATE OR REPLACE FUNCTION erp.command_complete_deur_shift(command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,auth,extensions,pg_catalog AS $$
DECLARE
  tenant text:=erp.current_company_id(); scope jsonb; idem jsonb; now_at timestamptz:=erp.deur_operational_clock(); current_deur erp.deurs%ROWTYPE; response jsonb; payload_hash text; next_sequence integer; open_activity text; policy text; closing_hour numeric; closing_odo numeric; latest_odo numeric;
  client_occurrence_at timestamptz; effective_occurrence_at timestamptz; predecessor_occurrence_at timestamptz;
BEGIN
  scope:=erp.validate_deur_custody_command_scope(command,'deur.create'); IF scope->>'code'<>'OK' THEN RETURN jsonb_build_object('success',false,'code',scope->>'code'); END IF;
  idem:=erp.begin_deur_command(command,'COMPLETE_SHIFT'); IF idem->>'state'='MISMATCH' THEN RETURN jsonb_build_object('success',false,'code','IDEMPOTENCY_MISMATCH'); END IF; IF idem->>'state'='REPLAY' THEN RETURN (idem->'response')||jsonb_build_object('disposition','REPLAYED'); END IF; payload_hash:=idem->>'payloadHash';
  SELECT * INTO current_deur FROM erp.deurs WHERE id=command->>'deurId' AND company_id=tenant FOR UPDATE;
  IF current_deur.id IS NULL THEN RETURN jsonb_build_object('success',false,'code','NOT_FOUND'); END IF;
  IF erp.current_deur_authorized_operator(current_deur.id)<>command->>'operatorId' THEN RETURN jsonb_build_object('success',false,'code','OWNERSHIP_MISMATCH'); END IF;
  IF current_deur.row_version<>(command->>'expectedVersion')::bigint THEN RETURN jsonb_build_object('success',false,'code','CONFLICT','aggregateId',current_deur.id,'expectedVersion',(command->>'expectedVersion')::bigint,'currentVersion',current_deur.row_version,'refreshRequired',true); END IF;
  IF current_deur.status<>'In Progress' THEN RETURN jsonb_build_object('success',false,'code','INVALID_TRANSITION'); END IF;
  SELECT line.operational_metadata#>>'{deurExpectationSnapshot,meterRequirement}' INTO policy FROM erp.rental_equipment_lines line WHERE line.id=current_deur.rental_equipment_line_id AND line.company_id=tenant;
  IF policy NOT IN ('none','hourMeter','odometer','both') THEN RETURN jsonb_build_object('success',false,'code','METER_POLICY_INVALID'); END IF;
  BEGIN closing_hour:=nullif(trim(command->>'closingHourMeter'),'')::numeric; closing_odo:=nullif(trim(command->>'closingOdometer'),'')::numeric; EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END;
  SELECT max(reading) INTO latest_odo FROM erp.deur_meter_checkpoints WHERE company_id=tenant AND deur_id=current_deur.id AND meter_dimension='odometer';
  latest_odo:=greatest(coalesce(current_deur.opening_odometer,current_deur.opening_meter),coalesce(latest_odo,0));
  IF (closing_hour IS NOT NULL AND (closing_hour<0 OR (current_deur.opening_hour_meter IS NOT NULL AND closing_hour<current_deur.opening_hour_meter))) OR (closing_odo IS NOT NULL AND (closing_odo<0 OR closing_odo<latest_odo)) THEN RETURN jsonb_build_object('success',false,'code','CLOSING_METER_BELOW_OPENING'); END IF;
  IF ((policy IN ('odometer','both')) AND closing_odo IS NULL)
     OR (policy='odometer' AND closing_hour IS NOT NULL)
     OR (policy='hourMeter' AND closing_odo IS NOT NULL)
     OR (policy='none' AND (closing_hour IS NOT NULL OR closing_odo IS NOT NULL))
  THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;
  SELECT activity_type INTO open_activity FROM erp.deur_events WHERE deur_id=current_deur.id AND is_open AND activity_type<>'shift' FOR UPDATE;
  IF nullif(command->>'clientOccurredAt','') IS NOT NULL THEN
    BEGIN client_occurrence_at:=nullif(command->>'clientOccurredAt','')::timestamptz;
    EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow THEN RETURN jsonb_build_object('success',false,'code','INVALID_CLIENT_OCCURRENCE_TIME'); END;
    IF client_occurrence_at>now_at+interval '5 minutes' THEN RETURN jsonb_build_object('success',false,'code','CLIENT_OCCURRENCE_IN_FUTURE'); END IF;
    SELECT max(event_record.occurred_at) INTO predecessor_occurrence_at FROM erp.deur_events AS event_record WHERE event_record.deur_id=current_deur.id;
    IF predecessor_occurrence_at IS NOT NULL AND client_occurrence_at<predecessor_occurrence_at THEN RETURN jsonb_build_object('success',false,'code','CLIENT_OCCURRENCE_BEFORE_PREDECESSOR'); END IF;
    effective_occurrence_at:=client_occurrence_at;
  ELSE
    effective_occurrence_at:=now_at;
  END IF;
  UPDATE erp.deur_events SET is_open=false WHERE deur_id=current_deur.id AND is_open;
  SELECT coalesce(max(sequence),0)+1 INTO next_sequence FROM erp.deur_events WHERE deur_id=current_deur.id;
  IF open_activity IS NOT NULL THEN INSERT INTO erp.deur_events(id,deur_id,activity_type,action,occurred_at,sequence,source,actor_id,server_accepted_at,client_created_at,command_id,idempotency_key,device_id,is_open,company_id) VALUES(extensions.gen_random_uuid()::text,current_deur.id,open_activity,'end',effective_occurrence_at,next_sequence,'server',auth.uid()::text,now_at,coalesce(client_occurrence_at,nullif(command->>'clientCreatedAt','')::timestamptz),command->>'commandId',command->>'idempotencyKey',command->>'deviceId',false,tenant); next_sequence:=next_sequence+1; END IF;
  INSERT INTO erp.deur_events(id,deur_id,activity_type,action,occurred_at,sequence,source,actor_id,server_accepted_at,client_created_at,command_id,idempotency_key,device_id,is_open,company_id) VALUES(extensions.gen_random_uuid()::text,current_deur.id,'shift','end',effective_occurrence_at,next_sequence,'server',auth.uid()::text,now_at,coalesce(client_occurrence_at,nullif(command->>'clientCreatedAt','')::timestamptz),command->>'commandId',command->>'idempotencyKey',command->>'deviceId',false,tenant);
  UPDATE erp.deurs SET closing_hour_meter=CASE WHEN closing_hour IS NOT NULL THEN closing_hour ELSE closing_hour_meter END,closing_odometer=CASE WHEN policy IN ('odometer','both') THEN closing_odo ELSE NULL END,closing_meter=CASE WHEN policy='hourMeter' THEN closing_hour WHEN policy='odometer' THEN closing_odo ELSE NULL END,updated_at=now_at,updated_by=auth.uid()::text WHERE id=current_deur.id RETURNING * INTO current_deur;
  response:=jsonb_build_object('success',true,'disposition','ACCEPTED','record',to_jsonb(current_deur)||erp.canonical_deur_meter_evidence(policy,current_deur.opening_hour_meter,current_deur.closing_hour_meter,current_deur.opening_odometer,current_deur.closing_odometer,current_deur.opening_meter,current_deur.closing_meter),'version',current_deur.row_version,'serverOccurredAt',now_at);
  RETURN erp.finish_deur_command(command,'COMPLETE_SHIFT',current_deur.id,payload_hash,response);
END $$;

ALTER FUNCTION erp.command_transition_deur_activity(jsonb) OWNER TO postgres;
ALTER FUNCTION erp.command_complete_deur_shift(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.command_transition_deur_activity(jsonb),erp.command_complete_deur_shift(jsonb) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION erp.command_transition_deur_activity(jsonb),erp.command_complete_deur_shift(jsonb) TO authenticated;
