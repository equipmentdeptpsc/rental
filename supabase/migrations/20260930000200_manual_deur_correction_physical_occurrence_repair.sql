BEGIN;
SET LOCAL search_path=erp,auth,extensions,pg_catalog;

-- Repair one narrowly-defined clone defect: restore the bootstrap shift/start
-- physical occurrence from immutable source history.  This is not a generic
-- event editor and accepts no browser-supplied timestamp.
CREATE OR REPLACE FUNCTION erp.command_repair_manual_deur_correction_physical_occurrence(command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=erp,auth,extensions,pg_catalog AS $$
DECLARE
  tenant text:=erp.current_company_id(); actor text:=auth.uid()::text;
  now_at timestamptz:=erp.deur_operational_clock();
  target erp.deurs%ROWTYPE; source erp.deurs%ROWTYPE;
  target_event erp.deur_events%ROWTYPE; source_event erp.deur_events%ROWTYPE;
  target_event_count integer; source_event_count integer; newer_count integer;
  submit_count integer; review_count integer; billing_count integer;
  idem jsonb; payload_hash text; response jsonb;
BEGIN
  IF tenant IS NULL OR auth.uid() IS NULL OR NOT erp.current_user_has_permission('deur.correct') THEN
    RETURN jsonb_build_object('success',false,'code','FORBIDDEN','message','Correction repair is not authorized.','retryable',false,'refreshRequired',false);
  END IF;
  IF jsonb_typeof(command)<>'object'
     OR nullif(btrim(command->>'commandId'),'') IS NULL
     OR nullif(btrim(command->>'idempotencyKey'),'') IS NULL
     OR nullif(btrim(command->>'deurId'),'') IS NULL
     OR command->>'expectedVersion' !~ '^[0-9]+$'
     OR EXISTS(SELECT 1 FROM jsonb_object_keys(command) key
               WHERE key NOT IN ('commandId','idempotencyKey','deurId','expectedVersion')) THEN
    RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED','message','A valid correction repair command is required.','retryable',false,'refreshRequired',false);
  END IF;

  SELECT * INTO target
  FROM erp.deurs
  WHERE id=command->>'deurId' AND company_id=tenant
  FOR UPDATE;
  IF target.id IS NULL THEN
    RETURN jsonb_build_object('success',false,'code','NOT_FOUND','message','The correction revision was not found.','retryable',false,'refreshRequired',true);
  END IF;

  idem:=erp.begin_operational_command(command,'REPAIR_DEUR_CORRECTION_PHYSICAL_OCCURRENCE','DEUR',target.id,tenant,actor);
  IF idem->>'state'='MISMATCH' THEN
    RETURN jsonb_build_object('success',false,'code','IDEMPOTENCY_MISMATCH','message','Idempotency key payload mismatch.','retryable',false,'refreshRequired',false);
  END IF;
  IF idem->>'state'='REPLAY' THEN
    RETURN (idem->'response')||jsonb_build_object('disposition','REPLAYED');
  END IF;
  payload_hash:=idem->>'payloadHash';

  IF target.row_version<>(command->>'expectedVersion')::bigint THEN
    RETURN jsonb_build_object('success',false,'code','CONFLICT','message','The correction revision changed. Refresh before retrying.','retryable',false,'refreshRequired',true,'currentVersion',target.row_version);
  END IF;
  IF target.creation_source<>'MANUAL_WEB'
     OR target.operational_metadata#>>'{sourceDocument}'<>'PHYSICAL_DEUR' THEN
    RETURN jsonb_build_object('success',false,'code','CORRECTION_REPAIR_SOURCE_MISMATCH','message','Only MANUAL_WEB / PHYSICAL_DEUR corrections can be repaired.','retryable',false,'refreshRequired',false);
  END IF;
  IF target.status<>'In Progress' OR target.previous_revision_id IS NULL THEN
    RETURN jsonb_build_object('success',false,'code','CORRECTION_REPAIR_NOT_ELIGIBLE','message','Only an In Progress correction revision can be repaired.','retryable',false,'refreshRequired',false);
  END IF;

  SELECT * INTO source FROM erp.deurs
  WHERE id=target.previous_revision_id AND company_id=tenant
  FOR SHARE;
  IF source.id IS NULL OR source.status<>'Rejected' THEN
    RETURN jsonb_build_object('success',false,'code','CORRECTION_SOURCE_NOT_REJECTED','message','The historical source DEUR is not a rejected revision.','retryable',false,'refreshRequired',true);
  END IF;

  SELECT count(*) INTO newer_count FROM erp.deurs newer
  WHERE newer.company_id=tenant
    AND newer.revision_chain_id=target.revision_chain_id
    AND newer.revision_number>target.revision_number;
  IF newer_count<>0 THEN
    RETURN jsonb_build_object('success',false,'code','CORRECTION_NEWER_REVISION_EXISTS','message','A newer correction revision already exists.','retryable',false,'refreshRequired',true);
  END IF;

  SELECT count(*) INTO submit_count FROM erp.audit_log
  WHERE company_id=tenant AND aggregate_type='DEUR' AND aggregate_id=target.id AND action='SUBMIT_DEUR';
  IF submit_count<>0 THEN
    RETURN jsonb_build_object('success',false,'code','CORRECTION_ALREADY_SUBMITTED','message','A submitted correction cannot be repaired.','retryable',false,'refreshRequired',true);
  END IF;
  SELECT count(*) INTO review_count FROM erp.customer_review_requests
  WHERE company_id=tenant AND revision_id=target.id;
  IF review_count<>0 THEN
    RETURN jsonb_build_object('success',false,'code','CORRECTION_REVIEW_EXISTS','message','A correction with review history cannot be repaired.','retryable',false,'refreshRequired',true);
  END IF;
  SELECT count(*) INTO billing_count FROM erp.billing_statement_lines line
  WHERE line.company_id=tenant
    AND (line.deur_id=target.id OR line.effective_deur_id=target.id OR line.corrected_from_deur_id=target.id
      OR line.deur_revision_chain_id=target.revision_chain_id);
  IF target.billing_locked OR target.billing_statement_id IS NOT NULL OR target.bill_id IS NOT NULL OR billing_count<>0 THEN
    RETURN jsonb_build_object('success',false,'code','CORRECTION_BILLING_LINE_EXISTS','message','A correction with billing lineage cannot be repaired.','retryable',false,'refreshRequired',true);
  END IF;

  SELECT count(*) INTO target_event_count FROM erp.deur_events event_record
  WHERE event_record.deur_id=target.id
    AND event_record.activity_type='shift' AND event_record.action='start'
    AND event_record.sequence=1 AND event_record.source='manual-web'
    AND event_record.is_open
    AND erp.is_manual_deur_encoding_bootstrap_event(target,event_record);
  IF target_event_count<>1 THEN
    RETURN jsonb_build_object('success',false,'code','CORRECTION_REPAIR_TARGET_EVENT_AMBIGUOUS','message','The correction bootstrap event could not be matched uniquely.','retryable',false,'refreshRequired',true);
  END IF;
  SELECT count(*) INTO source_event_count FROM erp.deur_events event_record
  WHERE event_record.deur_id=source.id
    AND event_record.activity_type='shift' AND event_record.action='start'
    AND event_record.sequence=1 AND event_record.source='manual-web'
    AND event_record.is_open
    AND erp.is_manual_deur_encoding_bootstrap_event(source,event_record);
  IF source_event_count<>1 THEN
    RETURN jsonb_build_object('success',false,'code','CORRECTION_REPAIR_SOURCE_EVENT_AMBIGUOUS','message','The historical bootstrap event could not be matched uniquely.','retryable',false,'refreshRequired',true);
  END IF;

  SELECT * INTO target_event FROM erp.deur_events event_record
  WHERE event_record.deur_id=target.id AND event_record.activity_type='shift'
    AND event_record.action='start' AND event_record.sequence=1
    AND event_record.source='manual-web' AND event_record.is_open
    AND erp.is_manual_deur_encoding_bootstrap_event(target,event_record);
  SELECT * INTO source_event FROM erp.deur_events event_record
  WHERE event_record.deur_id=source.id AND event_record.activity_type='shift'
    AND event_record.action='start' AND event_record.sequence=1
    AND event_record.source='manual-web' AND event_record.is_open
    AND erp.is_manual_deur_encoding_bootstrap_event(source,event_record);
  IF target_event.occurred_at IS NOT DISTINCT FROM source_event.occurred_at THEN
    RETURN jsonb_build_object('success',false,'code','CORRECTION_REPAIR_NOT_NEEDED','message','The correction bootstrap occurrence already matches source history.','retryable',false,'refreshRequired',false);
  END IF;

  UPDATE erp.deur_events
  SET occurred_at=source_event.occurred_at
  WHERE id=target_event.id AND deur_id=target.id;
  UPDATE erp.deurs
  SET updated_at=now_at,updated_by=actor,row_version=row_version+1
  WHERE id=target.id AND company_id=tenant
  RETURNING * INTO target;

  INSERT INTO erp.audit_log(id,company_id,aggregate_type,aggregate_id,action,actor_id,occurred_at,correlation_id,previous_values,new_values)
  VALUES(extensions.gen_random_uuid()::text,tenant,'DEUR',target.id,'DEUR_CORRECTION_PHYSICAL_OCCURRENCE_REPAIRED',actor,now_at,command->>'commandId',
    jsonb_build_object('eventId',target_event.id,'occurredAt',target_event.occurred_at),
    jsonb_build_object('eventId',target_event.id,'sourceEventId',source_event.id,'occurredAt',source_event.occurred_at,'field','occurred_at'));
  response:=jsonb_build_object('success',true,'disposition','ACCEPTED','serverOccurredAt',now_at,'refresh',jsonb_build_array(target.id),
    'value',jsonb_build_object('deurId',target.id,'eventId',target_event.id,'sourceEventId',source_event.id,'restoredOccurredAt',source_event.occurred_at,'version',target.row_version));
  RETURN erp.finish_operational_command(command,'REPAIR_DEUR_CORRECTION_PHYSICAL_OCCURRENCE','DEUR',target.id,tenant,actor,payload_hash,response,target.row_version);
END $$;

REVOKE ALL ON FUNCTION erp.command_repair_manual_deur_correction_physical_occurrence(jsonb) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION erp.command_repair_manual_deur_correction_physical_occurrence(jsonb) TO authenticated;

COMMIT;
