BEGIN;

CREATE OR REPLACE FUNCTION erp.command_start_deur_shift(command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,public,auth AS $$
DECLARE scope jsonb; idem jsonb; now_at timestamptz=clock_timestamp(); new_deur deurs; response jsonb; payload_hash text; line rental_equipment_lines; snap jsonb; expected_fingerprint text; selected_shift text; effective_work_date date;
BEGIN
  scope=validate_deur_command_scope(command,'deur.create'); IF scope->>'code'<>'OK' THEN RETURN jsonb_build_object('success',false,'code',scope->>'code'); END IF;
  SELECT * INTO line FROM rental_equipment_lines WHERE id=command->>'rentalLineId' FOR UPDATE;
  snap=nullif(line.operational_metadata->'deurExpectationSnapshot','null'::jsonb);
  IF snap IS NULL THEN RETURN jsonb_build_object('success',false,'code','DEUR_EXPECTATION_REQUIRED'); END IF;
  expected_fingerprint=current_deur_expectation_fingerprint(line.id);
  IF snap->>'sourceFingerprint' IS DISTINCT FROM expected_fingerprint THEN RETURN jsonb_build_object('success',false,'code','SNAPSHOT_STALE'); END IF;
  selected_shift=nullif(command->'draft'->>'shift','');
  IF snap#>>'{policy,frequency}'='PER_SHIFT' AND (selected_shift IS NULL OR NOT ((snap#>'{policy,expectedShiftCodes}') ? (CASE selected_shift WHEN 'Day' THEN 'DAY' WHEN 'Night' THEN 'NIGHT' ELSE '' END))) THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;
  effective_work_date=CASE WHEN snap#>>'{policy,frequency}'='PER_WORKDAY' THEN timezone(coalesce(nullif(snap#>>'{policy,timezone}',''),'UTC'),now_at)::date ELSE (snap->>'workDate')::date END;
  idem=begin_deur_command(command,'START_SHIFT'); IF idem->>'state'='MISMATCH' THEN RETURN jsonb_build_object('success',false,'code','IDEMPOTENCY_MISMATCH'); END IF;
  IF idem->>'state'='REPLAY' THEN RETURN (idem->'response')||jsonb_build_object('disposition','REPLAYED'); END IF; payload_hash=idem->>'payloadHash';
  INSERT INTO deurs(id,deur_number,rental_id,rental_equipment_line_id,assignment_id,equipment_id,operator_id,project_id,customer_id,commercial_snapshot_id,commercial_snapshot_required,creation_source,work_date,shift,status,evidence_mode,billing_method_snapshot,opening_meter,operational_metadata,operational_remarks,created_at,created_by,updated_at,updated_by,row_version)
  SELECT command->'draft'->>'id',next_deur_number(),snap->>'rentalId',snap->>'rentalEquipmentLineId',snap->>'assignmentId',snap->>'equipmentId',snap->>'operatorId',snap->>'projectId',snap->>'customerId',cs.id,true,'OPERATOR_DIGITAL',effective_work_date,selected_shift,'In Progress',
    CASE snap->>'billingMethod' WHEN 'Per Kilometer' THEN 'ODOMETER_TRIP' WHEN 'Per Cubic Meter' THEN 'QUANTITY' WHEN 'One Lot' THEN 'COMPLETION' WHEN 'Per Lot' THEN 'COMPLETION' ELSE 'TIME_TIMELINE' END,
    (snap->>'billingMethod')::billing_method,CASE WHEN snap->>'meterRequirement' IN ('hourMeter','odometer','both') THEN nullif(command->'draft'->>'openingMeter','')::numeric END,
    (snap->'operationalMetadata')||jsonb_build_object('workDescription',snap->'workDescription'),coalesce(nullif(command->'draft'->>'operationalRemarks',''),snap->>'operationalRemarks'),now_at,auth.uid()::text,now_at,auth.uid()::text,1
  FROM commercial_snapshots cs WHERE cs.rental_equipment_line_id=line.id AND cs.rental_id=line.rental_id RETURNING * INTO new_deur;
  IF new_deur.id IS NULL THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;
  INSERT INTO deur_events(id,deur_id,activity_type,action,occurred_at,sequence,source,actor_id,server_accepted_at,client_created_at,command_id,idempotency_key,device_id,is_open)
  VALUES(extensions.gen_random_uuid()::text,new_deur.id,'shift','start',now_at,1,'server',auth.uid()::text,now_at,nullif(command->>'clientCreatedAt','')::timestamptz,command->>'commandId',command->>'idempotencyKey',command->>'deviceId',true),(extensions.gen_random_uuid()::text,new_deur.id,'operation','start',now_at,2,'server',auth.uid()::text,now_at,nullif(command->>'clientCreatedAt','')::timestamptz,command->>'commandId',command->>'idempotencyKey',command->>'deviceId',true);
  INSERT INTO audit_log(id,aggregate_type,aggregate_id,action,actor_id,occurred_at,correlation_id,new_values) VALUES(extensions.gen_random_uuid()::text,'DEUR',new_deur.id,'START_SHIFT',auth.uid()::text,now_at,command->>'commandId',to_jsonb(new_deur));
  response=jsonb_build_object('success',true,'disposition','ACCEPTED','record',to_jsonb(new_deur),'version',1,'serverOccurredAt',now_at);
  RETURN finish_deur_command(command,'START_SHIFT',new_deur.id,payload_hash,response);
EXCEPTION WHEN unique_violation THEN RETURN jsonb_build_object('success',false,'code','DUPLICATE_ACTIVE_DEUR');
END $$;

ALTER FUNCTION erp.command_start_deur_shift(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.command_start_deur_shift(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION erp.command_start_deur_shift(jsonb) TO authenticated;

COMMENT ON FUNCTION erp.command_start_deur_shift(jsonb) IS
  'Starts exactly one Operator-owned Digital DEUR; PER_WORKDAY work dates derive from the server timestamp in the frozen policy timezone.';

COMMIT;
