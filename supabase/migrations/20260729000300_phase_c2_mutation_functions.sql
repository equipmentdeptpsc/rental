BEGIN;
SET search_path TO erp, public;

CREATE OR REPLACE FUNCTION command_record_meter_checkpoint(command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,public,auth AS $$
DECLARE tenant text=current_company_id(); target deurs; checkpoint deur_meter_checkpoints; now_at timestamptz=clock_timestamp(); previous numeric; idem jsonb; payload_hash text; response jsonb;
BEGIN
  IF tenant IS NULL OR NOT current_user_has_permission('deur.create') THEN RETURN jsonb_build_object('success',false,'code','FORBIDDEN'); END IF;
  SELECT * INTO target FROM deurs WHERE id=command->>'deurId' AND company_id=tenant FOR UPDATE;
  IF target.id IS NULL OR target.rental_equipment_line_id<>command->>'rentalLineId' OR target.equipment_id<>command->>'equipmentId' THEN RETURN jsonb_build_object('success',false,'code','TENANT_MISMATCH'); END IF;
  idem=begin_operational_command(command,'RECORD_METER_CHECKPOINT','DEUR',target.id,tenant,auth.uid()::text);
  IF idem->>'state'='MISMATCH' THEN RETURN jsonb_build_object('success',false,'code','IDEMPOTENCY_MISMATCH','message','Idempotency key payload mismatch.','retryable',false,'refreshRequired',false); END IF;
  IF idem->>'state'='REPLAY' THEN RETURN (idem->'response')||jsonb_build_object('disposition','REPLAYED'); END IF; payload_hash=idem->>'payloadHash';
  IF target.status NOT IN('Draft','In Progress') THEN RETURN jsonb_build_object('success',false,'code','INVALID_TRANSITION'); END IF;
  IF (command->>'reading')::numeric<0 THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;
  SELECT reading INTO previous FROM deur_meter_checkpoints WHERE deur_id=target.id ORDER BY server_accepted_at DESC LIMIT 1;
  IF previous IS NOT NULL AND (command->>'reading')::numeric<previous THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED','message','Meter rollback is not allowed.'); END IF;
  INSERT INTO deur_meter_checkpoints(company_id,deur_id,rental_equipment_line_id,equipment_id,operator_id,kind,reading,client_occurred_at,location,created_by)
  VALUES(tenant,target.id,target.rental_equipment_line_id,target.equipment_id,target.operator_id,command->>'kind',(command->>'reading')::numeric,
    nullif(command->>'clientOccurredAt','')::timestamptz,command->'location',auth.uid()) RETURNING * INTO checkpoint;
  UPDATE deurs SET opening_meter=CASE WHEN checkpoint.kind='opening' THEN checkpoint.reading ELSE opening_meter END,
    closing_meter=CASE WHEN checkpoint.kind='closing' THEN checkpoint.reading ELSE closing_meter END WHERE id=target.id RETURNING * INTO target;
  response=jsonb_build_object('success',true,'disposition','ACCEPTED','serverOccurredAt',now_at,'refresh',jsonb_build_array(target.id),
    'value',jsonb_build_object('checkpointId',checkpoint.id,'deurId',target.id,'version',target.row_version));
  RETURN finish_operational_command(command,'RECORD_METER_CHECKPOINT','DEUR',target.id,tenant,auth.uid()::text,payload_hash,response,target.row_version);
END $$;

CREATE OR REPLACE FUNCTION command_create_deur_correction(command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,public,auth AS $$
DECLARE tenant text=current_company_id(); source deurs; revision deurs; next_revision integer; now_at timestamptz=clock_timestamp(); idem jsonb; payload_hash text; response jsonb;
BEGIN
  IF tenant IS NULL OR NOT current_user_has_permission('deur.correct') THEN RETURN jsonb_build_object('success',false,'code','FORBIDDEN'); END IF;
  SELECT * INTO source FROM deurs WHERE id=command->>'sourceRevisionId' AND company_id=tenant FOR UPDATE;
  IF source.id IS NULL THEN RETURN jsonb_build_object('success',false,'code','NOT_FOUND'); END IF;
  idem=begin_operational_command(command,'CREATE_DEUR_CORRECTION','DEUR',source.id,tenant,auth.uid()::text);
  IF idem->>'state'='MISMATCH' THEN RETURN jsonb_build_object('success',false,'code','IDEMPOTENCY_MISMATCH','message','Idempotency key payload mismatch.','retryable',false,'refreshRequired',false); END IF;
  IF idem->>'state'='REPLAY' THEN RETURN (idem->'response')||jsonb_build_object('disposition','REPLAYED'); END IF; payload_hash=idem->>'payloadHash';
  IF source.row_version<>coalesce((command->>'expectedVersion')::bigint,source.row_version) THEN RETURN jsonb_build_object('success',false,'code','CONFLICT','currentVersion',source.row_version,'refreshRequired',true); END IF;
  IF source.billing_locked OR source.superseded_by_revision_id IS NOT NULL THEN RETURN jsonb_build_object('success',false,'code','INVALID_TRANSITION'); END IF;
  SELECT coalesce(max(revision_number),1)+1 INTO next_revision FROM deurs WHERE company_id=tenant AND revision_chain_id=coalesce(source.revision_chain_id,source.id);
  revision=source; revision.id=gen_random_uuid()::text; revision.deur_number=NULL; revision.status='Draft'; revision.revision_chain_id=coalesce(source.revision_chain_id,source.id);
  revision.original_deur_id=coalesce(source.original_deur_id,source.id); revision.previous_revision_id=source.id; revision.revision_number=next_revision;
  revision.correction_reason_code=command->>'reasonCode'; revision.correction_reason_details=command->>'reasonDetails'; revision.corrected_by_user_id=auth.uid()::text;
  revision.corrected_at=now_at; revision.created_at=now_at; revision.updated_at=now_at; revision.row_version=1;
  revision.submitted_at=NULL; revision.acknowledged_at=NULL; revision.rejected_at=NULL; revision.billing_locked=false;
  INSERT INTO deurs SELECT revision.*;
  UPDATE deurs SET superseded_by_revision_id=revision.id,superseded_at=now_at WHERE id=source.id;
  UPDATE customer_review_requests SET status='Revoked',revoked_at=now_at WHERE revision_id=source.id AND status='Pending';
  response=jsonb_build_object('success',true,'disposition','ACCEPTED','serverOccurredAt',now_at,'refresh',jsonb_build_array(source.id,revision.id),
    'value',jsonb_build_object('deurId',source.id,'sourceRevisionId',source.id,'revisionId',revision.id,'revisionNumber',next_revision,'version',1));
  RETURN finish_operational_command(command,'CREATE_DEUR_CORRECTION','DEUR',source.id,tenant,auth.uid()::text,payload_hash,response,1);
END $$;

CREATE OR REPLACE FUNCTION command_return_rental_line(command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,public,auth AS $$
DECLARE tenant text=current_company_id(); rental rentals; line rental_equipment_lines; now_at timestamptz=clock_timestamp(); idem jsonb; payload_hash text; response jsonb;
BEGIN
  IF tenant IS NULL OR NOT current_user_has_permission('rental.return') THEN RETURN jsonb_build_object('success',false,'code','FORBIDDEN'); END IF;
  SELECT * INTO rental FROM rentals WHERE id=command->>'rentalId' AND company_id=tenant FOR UPDATE;
  SELECT * INTO line FROM rental_equipment_lines WHERE id=command->>'rentalLineId' AND rental_id=rental.id AND company_id=tenant FOR UPDATE;
  IF line.id IS NULL OR line.equipment_id<>command->>'equipmentId' OR line.assignment_id IS DISTINCT FROM command->>'assignmentId' THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;
  idem=begin_operational_command(command,'RETURN_RENTAL_LINE','RENTAL_LINE',line.id,tenant,auth.uid()::text);
  IF idem->>'state'='MISMATCH' THEN RETURN jsonb_build_object('success',false,'code','IDEMPOTENCY_MISMATCH','message','Idempotency key payload mismatch.','retryable',false,'refreshRequired',false); END IF;
  IF idem->>'state'='REPLAY' THEN RETURN (idem->'response')||jsonb_build_object('disposition','REPLAYED'); END IF; payload_hash=idem->>'payloadHash';
  IF line.row_version<>coalesce((command->>'expectedVersion')::bigint,line.row_version) THEN RETURN jsonb_build_object('success',false,'code','CONFLICT','currentVersion',line.row_version,'refreshRequired',true); END IF;
  IF EXISTS(SELECT 1 FROM deurs WHERE rental_equipment_line_id=line.id AND status IN('Draft','In Progress','Submitted','Pending Acknowledgement','Rejected')) THEN RETURN jsonb_build_object('success',false,'code','INVALID_TRANSITION'); END IF;
  UPDATE rental_equipment_lines SET status='Returned' WHERE id=line.id RETURNING * INTO line;
  UPDATE equipment SET status_id='available',project_id=NULL,operator_id=NULL WHERE id=line.equipment_id AND company_id=tenant;
  UPDATE assignments SET status='Completed',returned_date=current_date WHERE id=line.assignment_id AND company_id=tenant AND status='Active';
  IF NOT EXISTS(SELECT 1 FROM rental_equipment_lines WHERE rental_id=rental.id AND status NOT IN('Returned','Closed','Cancelled')) THEN UPDATE rentals SET status='Returned',returned_at=now_at WHERE id=rental.id; END IF;
  response=jsonb_build_object('success',true,'disposition','ACCEPTED','serverOccurredAt',now_at,'refresh',jsonb_build_array(rental.id,line.id,line.equipment_id,line.assignment_id),
    'value',jsonb_build_object('rentalId',rental.id,'rentalLineId',line.id,'status',line.status,'version',line.row_version));
  RETURN finish_operational_command(command,'RETURN_RENTAL_LINE','RENTAL_LINE',line.id,tenant,auth.uid()::text,payload_hash,response,line.row_version);
END $$;

CREATE OR REPLACE FUNCTION command_return_all_rental_lines(command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,public,auth AS $$
DECLARE tenant text=current_company_id(); line rental_equipment_lines; outcomes jsonb='[]'::jsonb; result jsonb; idem jsonb; payload_hash text; response jsonb;
BEGIN
  IF tenant IS NULL OR NOT current_user_has_permission('rental.return') THEN RETURN jsonb_build_object('success',false,'code','FORBIDDEN'); END IF;
  PERFORM 1 FROM rentals WHERE id=command->>'rentalId' AND company_id=tenant FOR UPDATE;
  PERFORM 1 FROM rental_equipment_lines WHERE rental_id=command->>'rentalId' AND company_id=tenant FOR UPDATE;
  idem=begin_operational_command(command,'RETURN_ALL_RENTAL_LINES','RENTAL',command->>'rentalId',tenant,auth.uid()::text);
  IF idem->>'state'='MISMATCH' THEN RETURN jsonb_build_object('success',false,'code','IDEMPOTENCY_MISMATCH','message','Idempotency key payload mismatch.','retryable',false,'refreshRequired',false); END IF;
  IF idem->>'state'='REPLAY' THEN RETURN (idem->'response')||jsonb_build_object('disposition','REPLAYED'); END IF; payload_hash=idem->>'payloadHash';
  IF EXISTS(SELECT 1 FROM deurs WHERE rental_id=command->>'rentalId' AND company_id=tenant AND status IN('Draft','In Progress','Submitted','Pending Acknowledgement','Rejected')) THEN RETURN jsonb_build_object('success',false,'code','INVALID_TRANSITION'); END IF;
  FOR line IN SELECT * FROM rental_equipment_lines WHERE rental_id=command->>'rentalId' AND company_id=tenant LOOP
    IF line.status NOT IN('Returned','Closed','Cancelled') THEN
      SELECT command_return_rental_line(command||jsonb_build_object(
        'commandId',(command->>'commandId')||':'||line.id,
        'idempotencyKey',(command->>'idempotencyKey')||':line:'||line.id,
        'rentalLineId',line.id,'equipmentId',line.equipment_id,
        'assignmentId',line.assignment_id,'expectedVersion',line.row_version
      )) INTO result;
      IF NOT coalesce((result->>'success')::boolean,false) THEN RAISE EXCEPTION 'Atomic return blocked'; END IF;
    END IF;
    outcomes=outcomes||jsonb_build_array(jsonb_build_object('rentalId',line.rental_id,'rentalLineId',line.id,'status','Returned','version',line.row_version+1));
  END LOOP;
  response=jsonb_build_object('success',true,'disposition','ACCEPTED','serverOccurredAt',clock_timestamp(),'refresh',jsonb_build_array(command->>'rentalId'),
    'value',jsonb_build_object('rentalId',command->>'rentalId','lines',outcomes,'version',1));
  RETURN finish_operational_command(command,'RETURN_ALL_RENTAL_LINES','RENTAL',command->>'rentalId',tenant,auth.uid()::text,payload_hash,response,1);
END $$;

CREATE OR REPLACE FUNCTION command_close_rental(command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,public,auth AS $$
DECLARE tenant text=current_company_id(); rental rentals; readiness jsonb; now_at timestamptz=clock_timestamp(); idem jsonb; payload_hash text; response jsonb;
BEGIN
  IF tenant IS NULL OR NOT current_user_has_permission('rental.manage') THEN RETURN jsonb_build_object('success',false,'code','FORBIDDEN'); END IF;
  SELECT * INTO rental FROM rentals WHERE id=command->>'rentalId' AND company_id=tenant FOR UPDATE;
  IF rental.id IS NULL THEN RETURN jsonb_build_object('success',false,'code','NOT_FOUND'); END IF;
  idem=begin_operational_command(command,'CLOSE_RENTAL','RENTAL',rental.id,tenant,auth.uid()::text);
  IF idem->>'state'='MISMATCH' THEN RETURN jsonb_build_object('success',false,'code','IDEMPOTENCY_MISMATCH','message','Idempotency key payload mismatch.','retryable',false,'refreshRequired',false); END IF;
  IF idem->>'state'='REPLAY' THEN RETURN (idem->'response')||jsonb_build_object('disposition','REPLAYED'); END IF; payload_hash=idem->>'payloadHash';
  IF rental.row_version<>coalesce((command->>'expectedVersion')::bigint,rental.row_version) THEN RETURN jsonb_build_object('success',false,'code','CONFLICT','currentVersion',rental.row_version,'refreshRequired',true); END IF;
  readiness=get_rental_closure_readiness(command);
  IF NOT coalesce((readiness->'value'->>'ready')::boolean,false) THEN RETURN jsonb_build_object('success',false,'code','INVALID_TRANSITION','message','Rental is not ready to close.'); END IF;
  UPDATE rentals SET status='Closed',closed_at=now_at WHERE id=rental.id RETURNING * INTO rental;
  UPDATE rental_equipment_lines SET status='Closed' WHERE rental_id=rental.id AND status='Returned';
  INSERT INTO audit_log(id,company_id,aggregate_type,aggregate_id,action,actor_id,occurred_at,correlation_id,new_values)
  VALUES(gen_random_uuid()::text,tenant,'RENTAL',rental.id,'CLOSE',auth.uid()::text,now_at,command->>'commandId',jsonb_build_object('status','Closed'));
  response=jsonb_build_object('success',true,'disposition','ACCEPTED','serverOccurredAt',now_at,'refresh',jsonb_build_array(rental.id),
    'value',jsonb_build_object('rentalId',rental.id,'status','Closed','version',rental.row_version,'closedAt',rental.closed_at));
  RETURN finish_operational_command(command,'CLOSE_RENTAL','RENTAL',rental.id,tenant,auth.uid()::text,payload_hash,response,rental.row_version);
END $$;

REVOKE ALL ON FUNCTION command_record_meter_checkpoint(jsonb),command_create_deur_correction(jsonb),command_return_rental_line(jsonb),command_return_all_rental_lines(jsonb),command_close_rental(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION command_record_meter_checkpoint(jsonb),command_create_deur_correction(jsonb),command_return_rental_line(jsonb),command_return_all_rental_lines(jsonb),command_close_rental(jsonb) TO authenticated;
COMMIT;
