BEGIN;
SET LOCAL search_path=erp,auth,extensions,pg_catalog;
-- MANUAL_WEB is a business-continuity transcription surface.  Command and
-- audit order remain immutable encoding evidence; physical occurrence time is
-- the sole source of operational ordering for manual evidence.
CREATE OR REPLACE FUNCTION erp.validate_manual_deur_physical_timeline(target erp.deurs)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=erp,auth,extensions,pg_catalog AS $$
DECLARE
  item record; open_activity text; shift_ended boolean:=false; previous_reading numeric;
  policy text; closing_reading numeric; shift_end_count integer;
BEGIN
  IF target.creation_source<>'MANUAL_WEB' THEN RETURN 'MANUAL_DEUR_REQUIRED'; END IF;

  -- Activity rows are interpreted by physical occurrence, never append order.
  FOR item IN
    SELECT e.activity_type,e.action,e.occurred_at,e.sequence
    FROM erp.deur_events e
    WHERE e.deur_id=target.id
      AND NOT erp.is_manual_deur_encoding_bootstrap_event(target,e)
    ORDER BY e.occurred_at,
      CASE WHEN e.action='start' THEN 0 WHEN e.activity_type='shift' THEN 2 ELSE 1 END,
      e.sequence
  LOOP
    IF item.activity_type='shift' AND item.action='end' THEN
      IF shift_ended OR open_activity IS NOT NULL THEN RETURN 'PHYSICAL_ACTIVITY_INCOMPLETE'; END IF;
      shift_ended:=true;
    ELSIF item.action='start' THEN
      IF shift_ended OR open_activity IS NOT NULL THEN RETURN 'PHYSICAL_ACTIVITY_OVERLAP'; END IF;
      open_activity:=item.activity_type;
    ELSIF item.action='end' THEN
      IF open_activity IS NULL OR open_activity<>item.activity_type THEN RETURN 'PHYSICAL_ACTIVITY_MISMATCH'; END IF;
      open_activity:=NULL;
    END IF;
  END LOOP;
  IF open_activity IS NOT NULL THEN RETURN 'PHYSICAL_ACTIVITY_INCOMPLETE'; END IF;
  SELECT count(*) INTO shift_end_count FROM erp.deur_events e
    WHERE e.deur_id=target.id AND e.activity_type='shift' AND e.action='end'
      AND NOT erp.is_manual_deur_encoding_bootstrap_event(target,e);
  IF shift_end_count<>1 OR NOT shift_ended THEN RETURN 'PHYSICAL_SHIFT_END_REQUIRED'; END IF;

  -- Meter evidence is likewise compared in physical timestamp order.  The
  -- stable id tie-breaker preserves determinism without rewriting history.
  FOR item IN
    SELECT reading FROM (
      SELECT c.id::text AS id,c.client_occurred_at,c.reading
      FROM erp.deur_meter_checkpoints c
      WHERE c.deur_id=target.id AND c.kind='checkpoint' AND c.meter_dimension='odometer'
      UNION ALL
      SELECT r.id,r.client_occurred_at,r.odometer
      FROM erp.deur_refuels r WHERE r.deur_id=target.id
    ) physical_meter
    ORDER BY client_occurred_at,id
  LOOP
    IF item.reading<0 OR (previous_reading IS NOT NULL AND item.reading<previous_reading) THEN
      RETURN 'PHYSICAL_METER_ROLLBACK';
    END IF;
    previous_reading:=item.reading;
  END LOOP;
  SELECT operational_metadata#>>'{deurExpectationSnapshot,meterRequirement}' INTO policy
    FROM erp.rental_equipment_lines WHERE id=target.rental_equipment_line_id AND company_id=target.company_id;
  closing_reading:=target.closing_odometer;
  IF policy IN ('odometer','both') AND closing_reading IS NULL THEN RETURN 'PHYSICAL_CLOSING_METER_REQUIRED'; END IF;
  IF closing_reading IS NOT NULL AND (closing_reading<0 OR (previous_reading IS NOT NULL AND closing_reading<previous_reading)) THEN
    RETURN 'PHYSICAL_METER_ROLLBACK';
  END IF;
  RETURN NULL;
END $$;
CREATE OR REPLACE FUNCTION erp.command_record_manual_deur_activity(command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,auth,extensions,pg_catalog AS $$
DECLARE
  tenant text:=erp.current_company_id(); scope jsonb; idem jsonb; payload_hash text;
  now_at timestamptz:=erp.deur_operational_clock(); target erp.deurs%ROWTYPE;
  activity text; event_action text; next_sequence integer; client_at timestamptz; response jsonb; chronology_code text;
BEGIN
  IF erp.reject_manual_transcription_authority(command,ARRAY['commandId','idempotencyKey','deurId','expectedVersion','action','activityType','clientOccurredAt','clientCreatedAt','deviceId'])
    OR nullif(btrim(command->>'commandId'),'') IS NULL OR nullif(btrim(command->>'idempotencyKey'),'') IS NULL
    OR nullif(btrim(command->>'expectedVersion'),'') IS NULL THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;
  scope:=erp.validate_manual_deur_transcription_scope(command); IF scope->>'code'<>'OK' THEN RETURN jsonb_build_object('success',false,'code',scope->>'code'); END IF;
  idem:=erp.begin_deur_command(command,'MANUAL_ACTIVITY_TRANSCRIPTION');
  IF idem->>'state'='MISMATCH' THEN RETURN jsonb_build_object('success',false,'code','IDEMPOTENCY_MISMATCH'); END IF;
  IF idem->>'state'='REPLAY' THEN RETURN (idem->'response')||jsonb_build_object('disposition','REPLAYED'); END IF;
  payload_hash:=idem->>'payloadHash';
  SELECT * INTO target FROM erp.deurs WHERE id=command->>'deurId' AND company_id=tenant FOR UPDATE;
  IF target.creation_source<>'MANUAL_WEB' THEN RETURN jsonb_build_object('success',false,'code','MANUAL_DEUR_REQUIRED'); END IF;
  IF target.row_version<>(command->>'expectedVersion')::bigint THEN RETURN jsonb_build_object('success',false,'code','CONFLICT','currentVersion',target.row_version,'refreshRequired',true); END IF;
  IF target.status<>'In Progress' THEN RETURN jsonb_build_object('success',false,'code','INVALID_TRANSITION'); END IF;
  BEGIN client_at:=nullif(command->>'clientOccurredAt','')::timestamptz; EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END;
  chronology_code:=erp.validate_manual_deur_physical_occurrence(target,client_at,now_at); IF chronology_code IS NOT NULL THEN RETURN jsonb_build_object('success',false,'code',chronology_code); END IF;
  activity:=CASE command->>'action'
    WHEN 'START_OPERATION' THEN 'operation' WHEN 'RESUME_OPERATION' THEN 'operation'
    WHEN 'START_IDLE' THEN 'idle' WHEN 'START_STANDBY' THEN 'standby'
    WHEN 'START_MEAL_BREAK' THEN 'mealBreak' WHEN 'START_BREAKDOWN' THEN 'breakdown'
    WHEN 'END_ACTIVITY' THEN nullif(command->>'activityType','') ELSE NULL END;
  event_action:=CASE WHEN command->>'action'='END_ACTIVITY' THEN 'end' ELSE 'start' END;
  IF activity NOT IN ('operation','idle','standby','mealBreak','breakdown') THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED','message','A physical activity type is required.'); END IF;
  SELECT coalesce(max(sequence),0)+1 INTO next_sequence FROM erp.deur_events WHERE deur_id=target.id;
  INSERT INTO erp.deur_events(id,deur_id,activity_type,action,occurred_at,sequence,source,actor_id,server_accepted_at,client_created_at,command_id,idempotency_key,device_id,is_open,company_id)
  VALUES(extensions.gen_random_uuid()::text,target.id,activity,event_action,client_at,next_sequence,'manual-web',auth.uid()::text,now_at,client_at,command->>'commandId',command->>'idempotencyKey',command->>'deviceId',false,tenant);
  UPDATE erp.deurs SET updated_at=now_at,updated_by=auth.uid()::text WHERE id=target.id RETURNING * INTO target;
  INSERT INTO erp.audit_log(id,company_id,aggregate_type,aggregate_id,action,actor_id,occurred_at,correlation_id,new_values)
  VALUES(extensions.gen_random_uuid()::text,tenant,'DEUR',target.id,'ACTIVITY_TRANSCRIPTION',auth.uid()::text,now_at,command->>'commandId',jsonb_build_object('manualWeb',true,'encoderUserId',auth.uid()::text,'operatorId',target.operator_id,'action',command->>'action','activityType',activity,'clientOccurredAt',client_at));
  response:=jsonb_build_object('success',true,'disposition','ACCEPTED','record',to_jsonb(target),'version',target.row_version,'serverOccurredAt',now_at);
  RETURN erp.finish_deur_command(command,'MANUAL_ACTIVITY_TRANSCRIPTION',target.id,payload_hash,response);
END $$;
-- The command stores append-only encoding sequence_no.  The read model exposes
-- a physical sequence and physical delta without mutating earlier evidence.
CREATE OR REPLACE FUNCTION erp.command_record_manual_deur_travel_checkpoint(command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,auth,extensions,pg_catalog AS $$
DECLARE tenant text:=erp.current_company_id(); scope jsonb; idem jsonb; payload_hash text; now_at timestamptz:=erp.deur_operational_clock(); target erp.deurs%ROWTYPE; line erp.rental_equipment_lines%ROWTYPE; checkpoint erp.deur_meter_checkpoints%ROWTYPE; odometer numeric; next_sequence integer; latitude numeric; longitude numeric; client_at timestamptz; location jsonb; response jsonb; chronology_code text;
BEGIN
  IF erp.reject_manual_transcription_authority(command,ARRAY['commandId','idempotencyKey','deurId','expectedVersion','odometer','locationName','latitude','longitude','clientOccurredAt']) OR nullif(btrim(command->>'commandId'),'') IS NULL OR nullif(btrim(command->>'idempotencyKey'),'') IS NULL OR nullif(btrim(command->>'expectedVersion'),'') IS NULL OR nullif(btrim(command->>'odometer'),'') IS NULL THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;
  scope:=erp.validate_manual_deur_transcription_scope(command); IF scope->>'code'<>'OK' THEN RETURN jsonb_build_object('success',false,'code',scope->>'code'); END IF; idem:=erp.begin_deur_command(command,'MANUAL_RECORD_DEUR_TRAVEL_CHECKPOINT'); IF idem->>'state'='MISMATCH' THEN RETURN jsonb_build_object('success',false,'code','IDEMPOTENCY_MISMATCH'); END IF; IF idem->>'state'='REPLAY' THEN RETURN (idem->'response')||jsonb_build_object('disposition','REPLAYED'); END IF; payload_hash:=idem->>'payloadHash';
  SELECT * INTO target FROM erp.deurs WHERE id=command->>'deurId' AND company_id=tenant FOR UPDATE; SELECT * INTO line FROM erp.rental_equipment_lines WHERE id=target.rental_equipment_line_id AND company_id=tenant;
  BEGIN odometer:=(command->>'odometer')::numeric; latitude:=nullif(command->>'latitude','')::numeric; longitude:=nullif(command->>'longitude','')::numeric; client_at:=nullif(command->>'clientOccurredAt','')::timestamptz; EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END;
  chronology_code:=erp.validate_manual_deur_physical_occurrence(target,client_at,now_at); IF chronology_code IS NOT NULL THEN RETURN jsonb_build_object('success',false,'code',chronology_code); END IF;
  IF target.creation_source<>'MANUAL_WEB' OR target.row_version<>(command->>'expectedVersion')::bigint OR target.status<>'In Progress' OR odometer<0 OR line.operational_metadata#>>'{deurExpectationSnapshot,meterRequirement}' NOT IN ('odometer','both') OR (latitude IS NULL)<>(longitude IS NULL) OR (latitude IS NOT NULL AND (latitude<-90 OR latitude>90 OR longitude<-180 OR longitude>180)) OR (nullif(btrim(command->>'locationName'),'') IS NOT NULL AND (length(btrim(command->>'locationName'))>200 OR command->>'locationName'~'[[:cntrl:]]')) THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;
  SELECT coalesce(max(sequence_no),0)+1 INTO next_sequence FROM erp.deur_meter_checkpoints WHERE deur_id=target.id AND kind='checkpoint' AND meter_dimension='odometer'; location:=CASE WHEN latitude IS NULL THEN NULL ELSE jsonb_build_object('latitude',latitude,'longitude',longitude) END;
  INSERT INTO erp.deur_meter_checkpoints(company_id,deur_id,rental_equipment_line_id,equipment_id,operator_id,kind,reading,client_occurred_at,location,created_by,sequence_no,meter_dimension,location_name,custodian_operator_id) VALUES(tenant,target.id,target.rental_equipment_line_id,target.equipment_id,target.operator_id,'checkpoint',odometer,client_at,location,auth.uid(),next_sequence,'odometer',nullif(btrim(command->>'locationName'),''),target.operator_id) RETURNING * INTO checkpoint;
  UPDATE erp.deurs SET updated_at=now_at,updated_by=auth.uid()::text WHERE id=target.id RETURNING * INTO target; INSERT INTO erp.audit_log(id,company_id,aggregate_type,aggregate_id,action,actor_id,occurred_at,correlation_id,new_values) VALUES(extensions.gen_random_uuid()::text,tenant,'DEUR',target.id,'RECORD_DEUR_TRAVEL_CHECKPOINT',auth.uid()::text,now_at,command->>'commandId',jsonb_build_object('manualWeb',true,'encoderUserId',auth.uid()::text,'operatorId',target.operator_id,'checkpointId',checkpoint.id,'encodingSequence',checkpoint.sequence_no,'odometer',checkpoint.reading,'clientOccurredAt',client_at)); response:=jsonb_build_object('success',true,'disposition','ACCEPTED','record',to_jsonb(target),'version',target.row_version,'serverOccurredAt',now_at,'value',jsonb_build_object('checkpointId',checkpoint.id,'encodingSequence',checkpoint.sequence_no,'odometer',checkpoint.reading)); RETURN erp.finish_deur_command(command,'MANUAL_RECORD_DEUR_TRAVEL_CHECKPOINT',target.id,payload_hash,response);
END $$;
CREATE OR REPLACE FUNCTION erp.command_record_manual_deur_refuel(command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,auth,extensions,pg_catalog AS $$
DECLARE tenant text:=erp.current_company_id(); scope jsonb; idem jsonb; payload_hash text; now_at timestamptz:=erp.deur_operational_clock(); target erp.deurs%ROWTYPE; line erp.rental_equipment_lines%ROWTYPE; created erp.deur_refuels%ROWTYPE; odometer numeric; liters numeric; client_at timestamptz; response jsonb; chronology_code text;
BEGIN
  IF erp.reject_manual_transcription_authority(command,ARRAY['commandId','idempotencyKey','deurId','expectedVersion','odometer','liters','locationName','clientOccurredAt']) OR nullif(btrim(command->>'commandId'),'') IS NULL OR nullif(btrim(command->>'idempotencyKey'),'') IS NULL OR nullif(btrim(command->>'expectedVersion'),'') IS NULL OR nullif(btrim(command->>'odometer'),'') IS NULL OR nullif(btrim(command->>'liters'),'') IS NULL THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;
  scope:=erp.validate_manual_deur_transcription_scope(command); IF scope->>'code'<>'OK' THEN RETURN jsonb_build_object('success',false,'code',scope->>'code'); END IF; idem:=erp.begin_deur_command(command,'MANUAL_RECORD_DEUR_REFUEL'); IF idem->>'state'='MISMATCH' THEN RETURN jsonb_build_object('success',false,'code','IDEMPOTENCY_MISMATCH'); END IF; IF idem->>'state'='REPLAY' THEN RETURN (idem->'response')||jsonb_build_object('disposition','REPLAYED'); END IF; payload_hash:=idem->>'payloadHash'; SELECT * INTO target FROM erp.deurs WHERE id=command->>'deurId' AND company_id=tenant FOR UPDATE; SELECT * INTO line FROM erp.rental_equipment_lines WHERE id=target.rental_equipment_line_id AND company_id=tenant;
  BEGIN odometer:=(command->>'odometer')::numeric; liters:=(command->>'liters')::numeric; client_at:=nullif(command->>'clientOccurredAt','')::timestamptz; EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END; chronology_code:=erp.validate_manual_deur_physical_occurrence(target,client_at,now_at); IF chronology_code IS NOT NULL THEN RETURN jsonb_build_object('success',false,'code',chronology_code); END IF;
  IF target.creation_source<>'MANUAL_WEB' OR target.row_version<>(command->>'expectedVersion')::bigint OR target.status<>'In Progress' OR odometer<0 OR liters<=0 OR line.operational_metadata#>>'{deurExpectationSnapshot,meterRequirement}' NOT IN ('odometer','both') OR (nullif(btrim(command->>'locationName'),'') IS NOT NULL AND (length(btrim(command->>'locationName'))>200 OR command->>'locationName'~'[[:cntrl:]]')) THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;
  INSERT INTO erp.deur_refuels(company_id,equipment_id,rental_id,rental_equipment_line_id,assignment_id,deur_id,custodian_operator_id,odometer,liters,location_name,client_occurred_at,server_accepted_at,created_by,command_id,idempotency_key) VALUES(tenant,target.equipment_id,target.rental_id,target.rental_equipment_line_id,target.assignment_id,target.id,target.operator_id,odometer,liters,nullif(btrim(command->>'locationName'),''),client_at,now_at,auth.uid(),command->>'commandId',command->>'idempotencyKey') RETURNING * INTO created;
  UPDATE erp.deurs SET updated_at=now_at,updated_by=auth.uid()::text WHERE id=target.id RETURNING * INTO target; INSERT INTO erp.audit_log(id,company_id,aggregate_type,aggregate_id,action,actor_id,occurred_at,correlation_id,new_values) VALUES(extensions.gen_random_uuid()::text,tenant,'DEUR',target.id,'RECORD_DEUR_REFUEL',auth.uid()::text,now_at,command->>'commandId',jsonb_build_object('manualWeb',true,'encoderUserId',auth.uid()::text,'operatorId',target.operator_id,'refuelId',created.id,'odometer',created.odometer,'liters',created.liters,'clientOccurredAt',client_at)); response:=jsonb_build_object('success',true,'disposition','ACCEPTED','record',to_jsonb(target),'version',target.row_version,'serverOccurredAt',now_at,'value',jsonb_build_object('refuelId',created.id,'odometer',created.odometer,'liters',created.liters)); RETURN erp.finish_deur_command(command,'MANUAL_RECORD_DEUR_REFUEL',target.id,payload_hash,response);
END $$;
CREATE OR REPLACE FUNCTION erp.command_complete_manual_deur_shift(command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,auth,extensions,pg_catalog AS $$
DECLARE tenant text:=erp.current_company_id(); scope jsonb; idem jsonb; payload_hash text; now_at timestamptz:=erp.deur_operational_clock(); target erp.deurs%ROWTYPE; policy text; closing_hour numeric; closing_odo numeric; next_sequence integer; client_at timestamptz; response jsonb; chronology_code text;
BEGIN
  IF erp.reject_manual_transcription_authority(command,ARRAY['commandId','idempotencyKey','deurId','expectedVersion','closingHourMeter','closingOdometer','clientOccurredAt','clientCreatedAt','deviceId']) OR nullif(btrim(command->>'commandId'),'') IS NULL OR nullif(btrim(command->>'idempotencyKey'),'') IS NULL OR nullif(btrim(command->>'expectedVersion'),'') IS NULL THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF; scope:=erp.validate_manual_deur_transcription_scope(command); IF scope->>'code'<>'OK' THEN RETURN jsonb_build_object('success',false,'code',scope->>'code'); END IF; idem:=erp.begin_deur_command(command,'MANUAL_COMPLETE_SHIFT'); IF idem->>'state'='MISMATCH' THEN RETURN jsonb_build_object('success',false,'code','IDEMPOTENCY_MISMATCH'); END IF; IF idem->>'state'='REPLAY' THEN RETURN (idem->'response')||jsonb_build_object('disposition','REPLAYED'); END IF; payload_hash:=idem->>'payloadHash'; SELECT * INTO target FROM erp.deurs WHERE id=command->>'deurId' AND company_id=tenant FOR UPDATE;
  IF target.creation_source<>'MANUAL_WEB' OR target.row_version<>(command->>'expectedVersion')::bigint OR target.status<>'In Progress' THEN RETURN jsonb_build_object('success',false,'code','INVALID_TRANSITION'); END IF; SELECT operational_metadata#>>'{deurExpectationSnapshot,meterRequirement}' INTO policy FROM erp.rental_equipment_lines WHERE id=target.rental_equipment_line_id AND company_id=tenant; BEGIN closing_hour:=nullif(trim(command->>'closingHourMeter'),'')::numeric; closing_odo:=nullif(trim(command->>'closingOdometer'),'')::numeric; client_at:=nullif(command->>'clientOccurredAt','')::timestamptz; EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END; chronology_code:=erp.validate_manual_deur_physical_occurrence(target,client_at,now_at); IF chronology_code IS NOT NULL THEN RETURN jsonb_build_object('success',false,'code',chronology_code); END IF;
  IF (closing_hour IS NOT NULL AND (closing_hour<0 OR (target.opening_hour_meter IS NOT NULL AND closing_hour<target.opening_hour_meter))) OR (closing_odo IS NOT NULL AND (closing_odo<0 OR (target.opening_odometer IS NOT NULL AND closing_odo<target.opening_odometer))) OR ((policy IN ('odometer','both')) AND closing_odo IS NULL) OR (policy='odometer' AND closing_hour IS NOT NULL) OR (policy='hourMeter' AND closing_odo IS NOT NULL) OR (policy='none' AND (closing_hour IS NOT NULL OR closing_odo IS NOT NULL)) THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;
  IF EXISTS(SELECT 1 FROM erp.deur_events e WHERE e.deur_id=target.id AND e.activity_type='shift' AND e.action='end' AND NOT erp.is_manual_deur_encoding_bootstrap_event(target,e)) THEN RETURN jsonb_build_object('success',false,'code','INVALID_TRANSITION'); END IF;
  SELECT coalesce(max(sequence),0)+1 INTO next_sequence FROM erp.deur_events WHERE deur_id=target.id;
  INSERT INTO erp.deur_events(id,deur_id,activity_type,action,occurred_at,sequence,source,actor_id,server_accepted_at,client_created_at,command_id,idempotency_key,device_id,is_open,company_id) VALUES(extensions.gen_random_uuid()::text,target.id,'shift','end',client_at,next_sequence,'manual-web',auth.uid()::text,now_at,client_at,command->>'commandId',command->>'idempotencyKey',command->>'deviceId',false,tenant);
  UPDATE erp.deurs SET closing_hour_meter=coalesce(closing_hour,closing_hour_meter),closing_odometer=CASE WHEN policy IN ('odometer','both') THEN closing_odo ELSE NULL END,closing_meter=CASE WHEN policy='hourMeter' THEN closing_hour WHEN policy='odometer' THEN closing_odo ELSE NULL END,updated_at=now_at,updated_by=auth.uid()::text WHERE id=target.id RETURNING * INTO target;
  INSERT INTO erp.audit_log(id,company_id,aggregate_type,aggregate_id,action,actor_id,occurred_at,correlation_id,new_values) VALUES(extensions.gen_random_uuid()::text,tenant,'DEUR',target.id,'COMPLETE_SHIFT',auth.uid()::text,now_at,command->>'commandId',jsonb_build_object('manualWeb',true,'encoderUserId',auth.uid()::text,'operatorId',target.operator_id,'clientOccurredAt',client_at)); response:=jsonb_build_object('success',true,'disposition','ACCEPTED','record',to_jsonb(target)||erp.canonical_deur_meter_evidence(policy,target.opening_hour_meter,target.closing_hour_meter,target.opening_odometer,target.closing_odometer,target.opening_meter,target.closing_meter),'version',target.row_version,'serverOccurredAt',now_at); RETURN erp.finish_deur_command(command,'MANUAL_COMPLETE_SHIFT',target.id,payload_hash,response);
END $$;
CREATE OR REPLACE FUNCTION erp.command_submit_manual_deur(command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,auth,extensions,pg_catalog AS $$
DECLARE tenant text:=erp.current_company_id(); scope jsonb; idem jsonb; payload_hash text; now_at timestamptz:=erp.deur_operational_clock(); target erp.deurs%ROWTYPE; policy text; timeline_code text; response jsonb;
BEGIN
  IF erp.reject_manual_transcription_authority(command,ARRAY['commandId','idempotencyKey','deurId','expectedVersion']) OR nullif(btrim(command->>'commandId'),'') IS NULL OR nullif(btrim(command->>'idempotencyKey'),'') IS NULL OR nullif(btrim(command->>'expectedVersion'),'') IS NULL THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF; scope:=erp.validate_manual_deur_transcription_scope(command); IF scope->>'code'<>'OK' THEN RETURN jsonb_build_object('success',false,'code',scope->>'code'); END IF; idem:=erp.begin_deur_command(command,'MANUAL_SUBMIT_DEUR'); IF idem->>'state'='MISMATCH' THEN RETURN jsonb_build_object('success',false,'code','IDEMPOTENCY_MISMATCH'); END IF; IF idem->>'state'='REPLAY' THEN RETURN (idem->'response')||jsonb_build_object('disposition','REPLAYED'); END IF; payload_hash:=idem->>'payloadHash'; SELECT * INTO target FROM erp.deurs WHERE id=command->>'deurId' AND company_id=tenant FOR UPDATE;
  IF target.creation_source<>'MANUAL_WEB' OR target.row_version<>(command->>'expectedVersion')::bigint OR target.status<>'In Progress' THEN RETURN jsonb_build_object('success',false,'code','INVALID_TRANSITION'); END IF;
  timeline_code:=erp.validate_manual_deur_physical_timeline(target); IF timeline_code IS NOT NULL THEN RETURN jsonb_build_object('success',false,'code',timeline_code); END IF;
  SELECT operational_metadata#>>'{deurExpectationSnapshot,meterRequirement}' INTO policy FROM erp.rental_equipment_lines WHERE id=target.rental_equipment_line_id AND company_id=tenant;
  UPDATE erp.deurs SET status='Submitted',submitted_at=now_at,submitted_by=auth.uid()::text,updated_at=now_at,updated_by=auth.uid()::text WHERE id=target.id RETURNING * INTO target; INSERT INTO erp.audit_log(id,company_id,aggregate_type,aggregate_id,action,actor_id,occurred_at,correlation_id,new_values) VALUES(extensions.gen_random_uuid()::text,tenant,'DEUR',target.id,'SUBMIT_DEUR',auth.uid()::text,now_at,command->>'commandId',jsonb_build_object('manualWeb',true,'encoderUserId',auth.uid()::text,'operatorId',target.operator_id)); response:=jsonb_build_object('success',true,'disposition','ACCEPTED','record',to_jsonb(target)||erp.canonical_deur_meter_evidence(policy,target.opening_hour_meter,target.closing_hour_meter,target.opening_odometer,target.closing_odometer,target.opening_meter,target.closing_meter),'version',target.row_version,'serverOccurredAt',now_at); RETURN erp.finish_deur_command(command,'MANUAL_SUBMIT_DEUR',target.id,payload_hash,response);
END $$;
CREATE OR REPLACE FUNCTION erp.read_deur_travel_checkpoint_history(target_deur_id text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=erp,auth,extensions,pg_catalog AS $$
DECLARE tenant text:=erp.current_company_id(); actor erp.users%ROWTYPE; target erp.deurs%ROWTYPE; checkpoints jsonb;
BEGIN
  IF tenant IS NULL OR auth.uid() IS NULL THEN RETURN jsonb_build_object('success',false,'code','UNAUTHENTICATED'); END IF;
  SELECT * INTO actor FROM erp.users WHERE id=auth.uid()::text AND company_id=tenant AND status='active';
  SELECT * INTO target FROM erp.deurs WHERE id=target_deur_id AND company_id=tenant;
  IF target.id IS NULL THEN RETURN jsonb_build_object('success',false,'code','NOT_FOUND'); END IF;
  IF actor.operator_id IS NOT NULL AND erp.current_deur_authorized_operator(target.id) IS DISTINCT FROM actor.operator_id THEN RETURN jsonb_build_object('success',false,'code','OWNERSHIP_MISMATCH'); END IF;
  IF actor.operator_id IS NULL AND NOT (erp.current_user_has_permission('deur.read') OR erp.current_user_has_permission('deur.review') OR erp.current_user_has_permission('deur.acknowledge')) THEN RETURN jsonb_build_object('success',false,'code','FORBIDDEN'); END IF;
  SELECT coalesce(jsonb_agg(history.payload ORDER BY history.physical_sequence),'[]'::jsonb) INTO checkpoints FROM (
    SELECT row_number() over (ORDER BY checkpoint.client_occurred_at,checkpoint.id)::integer physical_sequence,
      jsonb_build_object('checkpointId',checkpoint.id,'sequence',row_number() over (ORDER BY checkpoint.client_occurred_at,checkpoint.id),'encodingSequence',checkpoint.sequence_no,'displayLabel','Point '||row_number() over (ORDER BY checkpoint.client_occurred_at,checkpoint.id),'odometer',checkpoint.reading,'clientOccurredAt',checkpoint.client_occurred_at,'serverAcceptedAt',checkpoint.server_accepted_at,'locationName',checkpoint.location_name,'latitude',checkpoint.location->>'latitude','longitude',checkpoint.location->>'longitude','distanceFromPrevious',checkpoint.reading-coalesce(lag(checkpoint.reading) over (ORDER BY checkpoint.client_occurred_at,checkpoint.id),coalesce(target.opening_odometer,target.opening_meter)),'custodianOperatorId',checkpoint.custodian_operator_id,'source','TRAVEL_ODOMETER') payload
    FROM erp.deur_meter_checkpoints checkpoint WHERE checkpoint.deur_id=target.id AND checkpoint.kind='checkpoint' AND checkpoint.meter_dimension='odometer'
  ) history;
  RETURN jsonb_build_object('success',true,'deurId',target.id,'checkpoints',checkpoints);
END $$;
ALTER FUNCTION erp.validate_manual_deur_physical_timeline(erp.deurs) OWNER TO postgres;
ALTER FUNCTION erp.command_record_manual_deur_activity(jsonb) OWNER TO postgres;
ALTER FUNCTION erp.command_record_manual_deur_travel_checkpoint(jsonb) OWNER TO postgres;
ALTER FUNCTION erp.command_record_manual_deur_refuel(jsonb) OWNER TO postgres;
ALTER FUNCTION erp.command_complete_manual_deur_shift(jsonb) OWNER TO postgres;
ALTER FUNCTION erp.command_submit_manual_deur(jsonb) OWNER TO postgres;
ALTER FUNCTION erp.read_deur_travel_checkpoint_history(text) OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.validate_manual_deur_physical_timeline(erp.deurs) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION erp.command_record_manual_deur_activity(jsonb),erp.command_record_manual_deur_travel_checkpoint(jsonb),erp.command_record_manual_deur_refuel(jsonb),erp.command_complete_manual_deur_shift(jsonb),erp.command_submit_manual_deur(jsonb),erp.read_deur_travel_checkpoint_history(text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION erp.command_record_manual_deur_activity(jsonb),erp.command_record_manual_deur_travel_checkpoint(jsonb),erp.command_record_manual_deur_refuel(jsonb),erp.command_complete_manual_deur_shift(jsonb),erp.command_submit_manual_deur(jsonb),erp.read_deur_travel_checkpoint_history(text) TO authenticated;
COMMENT ON FUNCTION erp.validate_manual_deur_physical_timeline(erp.deurs) IS 'MANUAL_WEB final validation reconstructs physical chronology from occurrence timestamps while preserving append-only encoding and audit history.';
COMMENT ON FUNCTION erp.command_complete_manual_deur_shift(jsonb) IS 'MANUAL_WEB end shift is physical evidence and does not require mobile live activity state.';
COMMIT;
