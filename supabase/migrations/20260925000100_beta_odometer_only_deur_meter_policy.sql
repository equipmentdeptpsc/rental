BEGIN;

SET LOCAL search_path=erp,auth,extensions,pg_catalog;

-- Beta policy: physical odometer readings remain operator evidence.  Hour-meter
-- columns and legacy BOTH snapshots stay intact; activity events remain the
-- source for derived operating time.
CREATE OR REPLACE FUNCTION erp.command_start_deur_shift(command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,auth,extensions,pg_catalog AS $$
DECLARE
  scope jsonb; idem jsonb; now_at timestamptz:=erp.deur_operational_clock(); new_deur erp.deurs%ROWTYPE;
  response jsonb; payload_hash text; line erp.rental_equipment_lines%ROWTYPE; snap jsonb; policy text;
  selected_shift text; effective_date date; opening_hour numeric; opening_odo numeric;
BEGIN
  scope:=erp.validate_deur_command_scope(command,'deur.create');
  IF scope->>'code'<>'OK' THEN RETURN jsonb_build_object('success',false,'code',scope->>'code'); END IF;
  SELECT * INTO line FROM erp.rental_equipment_lines WHERE id=command->>'rentalLineId' AND company_id=erp.current_company_id() FOR UPDATE;
  snap:=nullif(line.operational_metadata->'deurExpectationSnapshot','null'::jsonb);
  policy:=snap->>'meterRequirement';
  IF line.id IS NULL OR snap IS NULL OR policy NOT IN ('none','hourMeter','odometer','both') THEN RETURN jsonb_build_object('success',false,'code','DEUR_EXPECTATION_REQUIRED'); END IF;
  BEGIN opening_hour:=nullif(trim(command->'draft'->>'openingHourMeter'),'')::numeric; opening_odo:=nullif(trim(command->'draft'->>'openingOdometer'),'')::numeric;
  EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END;
  IF (opening_hour IS NOT NULL AND opening_hour<0) OR (opening_odo IS NOT NULL AND opening_odo<0) THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;
  -- Odometer is required for operational odometer/BOTH snapshots.  Optional
  -- hour evidence is accepted only for legacy compatibility, never required.
  IF ((policy IN ('odometer','both')) AND opening_odo IS NULL)
     OR (policy='odometer' AND opening_hour IS NOT NULL)
     OR (policy='hourMeter' AND opening_odo IS NOT NULL)
     OR (policy='none' AND (opening_hour IS NOT NULL OR opening_odo IS NOT NULL))
  THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;
  idem:=erp.begin_deur_command(command,'START_SHIFT');
  IF idem->>'state'='MISMATCH' THEN RETURN jsonb_build_object('success',false,'code','IDEMPOTENCY_MISMATCH'); END IF;
  IF idem->>'state'='REPLAY' THEN RETURN (idem->'response')||jsonb_build_object('disposition','REPLAYED'); END IF;
  payload_hash:=idem->>'payloadHash'; selected_shift:=nullif(command->'draft'->>'shift','');
  effective_date:=erp.resolve_uat_limited_pilot_work_date(line.id,(snap->>'workDate')::date);
  INSERT INTO erp.deurs(id,deur_number,rental_id,rental_equipment_line_id,assignment_id,equipment_id,operator_id,project_id,customer_id,commercial_snapshot_id,commercial_snapshot_required,creation_source,work_date,shift,status,evidence_mode,billing_method_snapshot,opening_meter,opening_hour_meter,opening_odometer,operational_metadata,operational_remarks,created_at,created_by,updated_at,updated_by,row_version,company_id)
  SELECT command->'draft'->>'id',erp.next_deur_number(),snap->>'rentalId',line.id,snap->>'assignmentId',snap->>'equipmentId',snap->>'operatorId',snap->>'projectId',snap->>'customerId',cs.id,true,'OPERATOR_DIGITAL',effective_date,selected_shift,'In Progress',
    CASE snap->>'billingMethod' WHEN 'Per Kilometer' THEN 'ODOMETER_TRIP' WHEN 'Per Cubic Meter' THEN 'QUANTITY' WHEN 'One Lot' THEN 'COMPLETION' WHEN 'Per Lot' THEN 'COMPLETION' ELSE 'TIME_TIMELINE' END,
    (snap->>'billingMethod')::erp.billing_method,CASE policy WHEN 'hourMeter' THEN opening_hour WHEN 'odometer' THEN opening_odo END,
    CASE WHEN policy IN ('hourMeter','both') THEN opening_hour END,CASE WHEN policy IN ('odometer','both') THEN opening_odo END,
    (snap->'operationalMetadata')||jsonb_build_object('workDescription',snap->'workDescription'),coalesce(nullif(command->'draft'->>'operationalRemarks',''),snap->>'operationalRemarks'),now_at,auth.uid()::text,now_at,auth.uid()::text,1,erp.current_company_id()
  FROM erp.commercial_snapshots cs WHERE cs.rental_equipment_line_id=line.id AND cs.rental_id=line.rental_id RETURNING * INTO new_deur;
  IF new_deur.id IS NULL THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;
  INSERT INTO erp.deur_events(id,deur_id,activity_type,action,occurred_at,sequence,source,actor_id,server_accepted_at,client_created_at,command_id,idempotency_key,device_id,is_open,company_id)
  VALUES(extensions.gen_random_uuid()::text,new_deur.id,'shift','start',now_at,1,'server',auth.uid()::text,now_at,nullif(command->>'clientCreatedAt','')::timestamptz,command->>'commandId',command->>'idempotencyKey',command->>'deviceId',true,new_deur.company_id),(extensions.gen_random_uuid()::text,new_deur.id,'operation','start',now_at,2,'server',auth.uid()::text,now_at,nullif(command->>'clientCreatedAt','')::timestamptz,command->>'commandId',command->>'idempotencyKey',command->>'deviceId',true,new_deur.company_id);
  response:=jsonb_build_object('success',true,'disposition','ACCEPTED','record',to_jsonb(new_deur)||erp.canonical_deur_meter_evidence(policy,new_deur.opening_hour_meter,new_deur.closing_hour_meter,new_deur.opening_odometer,new_deur.closing_odometer,new_deur.opening_meter,new_deur.closing_meter),'version',new_deur.row_version,'serverOccurredAt',now_at);
  RETURN erp.finish_deur_command(command,'START_SHIFT',new_deur.id,payload_hash,response);
EXCEPTION WHEN unique_violation THEN RETURN jsonb_build_object('success',false,'code','DUPLICATE_ACTIVE_DEUR');
END $$;

CREATE OR REPLACE FUNCTION erp.command_complete_deur_shift(command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,auth,extensions,pg_catalog AS $$
DECLARE
  tenant text:=erp.current_company_id(); scope jsonb; idem jsonb; now_at timestamptz:=erp.deur_operational_clock(); current_deur erp.deurs%ROWTYPE; response jsonb; payload_hash text; next_sequence integer; open_activity text; policy text; closing_hour numeric; closing_odo numeric; latest_odo numeric;
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
  UPDATE erp.deur_events SET is_open=false WHERE deur_id=current_deur.id AND is_open;
  SELECT coalesce(max(sequence),0)+1 INTO next_sequence FROM erp.deur_events WHERE deur_id=current_deur.id;
  IF open_activity IS NOT NULL THEN INSERT INTO erp.deur_events(id,deur_id,activity_type,action,occurred_at,sequence,source,actor_id,server_accepted_at,client_created_at,command_id,idempotency_key,device_id,is_open,company_id) VALUES(extensions.gen_random_uuid()::text,current_deur.id,open_activity,'end',now_at,next_sequence,'server',auth.uid()::text,now_at,nullif(command->>'clientCreatedAt','')::timestamptz,command->>'commandId',command->>'idempotencyKey',command->>'deviceId',false,tenant); next_sequence:=next_sequence+1; END IF;
  INSERT INTO erp.deur_events(id,deur_id,activity_type,action,occurred_at,sequence,source,actor_id,server_accepted_at,client_created_at,command_id,idempotency_key,device_id,is_open,company_id) VALUES(extensions.gen_random_uuid()::text,current_deur.id,'shift','end',now_at,next_sequence,'server',auth.uid()::text,now_at,nullif(command->>'clientCreatedAt','')::timestamptz,command->>'commandId',command->>'idempotencyKey',command->>'deviceId',false,tenant);
  UPDATE erp.deurs SET closing_hour_meter=CASE WHEN closing_hour IS NOT NULL THEN closing_hour ELSE closing_hour_meter END,closing_odometer=CASE WHEN policy IN ('odometer','both') THEN closing_odo ELSE NULL END,closing_meter=CASE WHEN policy='hourMeter' THEN closing_hour WHEN policy='odometer' THEN closing_odo ELSE NULL END,updated_at=now_at,updated_by=auth.uid()::text WHERE id=current_deur.id RETURNING * INTO current_deur;
  response:=jsonb_build_object('success',true,'disposition','ACCEPTED','record',to_jsonb(current_deur)||erp.canonical_deur_meter_evidence(policy,current_deur.opening_hour_meter,current_deur.closing_hour_meter,current_deur.opening_odometer,current_deur.closing_odometer,current_deur.opening_meter,current_deur.closing_meter),'version',current_deur.row_version,'serverOccurredAt',now_at);
  RETURN erp.finish_deur_command(command,'COMPLETE_SHIFT',current_deur.id,payload_hash,response);
END $$;

CREATE OR REPLACE FUNCTION erp.command_submit_deur(command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,auth,extensions,pg_catalog AS $$
DECLARE scope jsonb; idem jsonb; now_at timestamptz:=clock_timestamp(); current_deur erp.deurs%ROWTYPE; response jsonb; payload_hash text; corrected_complete boolean:=false; policy text;
BEGIN
  scope:=erp.validate_deur_custody_command_scope(command,'deur.create'); IF scope->>'code'<>'OK' THEN RETURN jsonb_build_object('success',false,'code',scope->>'code'); END IF;
  idem:=erp.begin_deur_command(command,'SUBMIT_DEUR'); IF idem->>'state'='MISMATCH' THEN RETURN jsonb_build_object('success',false,'code','IDEMPOTENCY_MISMATCH'); END IF; IF idem->>'state'='REPLAY' THEN RETURN (idem->'response')||jsonb_build_object('disposition','REPLAYED'); END IF; payload_hash:=idem->>'payloadHash';
  SELECT * INTO current_deur FROM erp.deurs WHERE id=command->>'deurId' AND company_id=erp.current_company_id() FOR UPDATE;
  IF current_deur.id IS NULL THEN RETURN jsonb_build_object('success',false,'code','NOT_FOUND'); END IF;
  IF erp.current_deur_authorized_operator(current_deur.id)<>command->>'operatorId' THEN RETURN jsonb_build_object('success',false,'code','OWNERSHIP_MISMATCH'); END IF;
  IF current_deur.row_version<>(command->>'expectedVersion')::bigint THEN RETURN jsonb_build_object('success',false,'code','CONFLICT','aggregateId',current_deur.id,'expectedVersion',(command->>'expectedVersion')::bigint,'currentVersion',current_deur.row_version,'refreshRequired',true); END IF;
  SELECT line.operational_metadata#>>'{deurExpectationSnapshot,meterRequirement}' INTO policy FROM erp.rental_equipment_lines line WHERE line.id=current_deur.rental_equipment_line_id AND line.company_id=current_deur.company_id;
  IF policy IN ('odometer','both') AND (current_deur.opening_odometer IS NULL OR current_deur.closing_odometer IS NULL) THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;
  corrected_complete:=current_deur.status='Draft' AND current_deur.previous_revision_id IS NOT NULL AND EXISTS(SELECT 1 FROM erp.deur_events event_record WHERE event_record.deur_id=current_deur.id AND event_record.source='correction' AND event_record.activity_type='shift' AND event_record.action='end') AND NOT EXISTS(SELECT 1 FROM erp.deur_events event_record WHERE event_record.source<>'correction');
  IF (current_deur.status<>'In Progress' AND NOT corrected_complete) OR EXISTS(SELECT 1 FROM erp.deur_events event_record WHERE deur_id=current_deur.id AND is_open) OR NOT EXISTS(SELECT 1 FROM erp.deur_events event_record WHERE deur_id=current_deur.id AND activity_type='shift' AND action='end') THEN RETURN jsonb_build_object('success',false,'code','INVALID_TRANSITION'); END IF;
  UPDATE erp.deurs SET status='Submitted',submitted_at=now_at,submitted_by=auth.uid()::text,updated_at=now_at,updated_by=auth.uid()::text WHERE id=current_deur.id RETURNING * INTO current_deur;
  response:=jsonb_build_object('success',true,'disposition','ACCEPTED','record',to_jsonb(current_deur)||erp.canonical_deur_meter_evidence(policy,current_deur.opening_hour_meter,current_deur.closing_hour_meter,current_deur.opening_odometer,current_deur.closing_odometer,current_deur.opening_meter,current_deur.closing_meter),'version',current_deur.row_version,'serverOccurredAt',now_at);
  RETURN erp.finish_deur_command(command,'SUBMIT_DEUR',current_deur.id,payload_hash,response);
END $$;

ALTER FUNCTION erp.command_start_deur_shift(jsonb) OWNER TO postgres;
ALTER FUNCTION erp.command_complete_deur_shift(jsonb) OWNER TO postgres;
ALTER FUNCTION erp.command_submit_deur(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.command_start_deur_shift(jsonb),erp.command_complete_deur_shift(jsonb),erp.command_submit_deur(jsonb) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION erp.command_start_deur_shift(jsonb),erp.command_complete_deur_shift(jsonb),erp.command_submit_deur(jsonb) TO authenticated;

COMMENT ON FUNCTION erp.command_complete_deur_shift(jsonb) IS 'Beta: odometer is physical evidence; operating hours derive from DEUR activity events. Legacy hour-meter values are optional compatibility evidence.';

COMMIT;
