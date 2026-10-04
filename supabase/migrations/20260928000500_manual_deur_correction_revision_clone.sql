BEGIN;
SET LOCAL search_path=erp,auth,extensions,pg_catalog;
-- A MANUAL_WEB correction is a new immutable revision.  The original physical
-- transcription and customer decision stay attached to the original DEUR; the
-- replacement receives a separately recorded evidence copy that can be
-- corrected and resubmitted through the normal manual-DEUR command path.
CREATE OR REPLACE FUNCTION erp.command_create_deur_correction(command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,auth,extensions,pg_catalog AS $$
DECLARE
  tenant text:=erp.current_company_id(); source erp.deurs%ROWTYPE; revision erp.deurs%ROWTYPE;
  next_revision integer; now_at timestamptz:=erp.deur_operational_clock(); idem jsonb;
  payload_hash text; response jsonb;
BEGIN
  IF tenant IS NULL OR NOT erp.current_user_has_permission('deur.correct') THEN
    RETURN jsonb_build_object('success',false,'code','FORBIDDEN');
  END IF;
  IF nullif(btrim(command->>'reasonCode'),'') IS NULL OR nullif(btrim(command->>'reasonDetails'),'') IS NULL THEN
    RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED','message','A correction reason is required.');
  END IF;
  SELECT * INTO source FROM erp.deurs WHERE id=command->>'sourceRevisionId' AND company_id=tenant FOR UPDATE;
  IF source.id IS NULL THEN RETURN jsonb_build_object('success',false,'code','NOT_FOUND'); END IF;
  idem:=erp.begin_operational_command(command,'CREATE_DEUR_CORRECTION','DEUR',source.id,tenant,auth.uid()::text);
  IF idem->>'state'='MISMATCH' THEN RETURN jsonb_build_object('success',false,'code','IDEMPOTENCY_MISMATCH','message','Idempotency key payload mismatch.','retryable',false,'refreshRequired',false); END IF;
  IF idem->>'state'='REPLAY' THEN RETURN (idem->'response')||jsonb_build_object('disposition','REPLAYED'); END IF;
  payload_hash:=idem->>'payloadHash';
  IF source.row_version<>(command->>'expectedVersion')::bigint THEN RETURN jsonb_build_object('success',false,'code','CONFLICT','currentVersion',source.row_version,'refreshRequired',true); END IF;
  IF source.billing_locked OR source.superseded_by_revision_id IS NOT NULL THEN RETURN jsonb_build_object('success',false,'code','INVALID_TRANSITION'); END IF;
  SELECT coalesce(max(revision_number),1)+1 INTO next_revision FROM erp.deurs WHERE company_id=tenant AND revision_chain_id=coalesce(source.revision_chain_id,source.id);
  revision:=source; revision.id:=extensions.gen_random_uuid()::text; revision.deur_number:=NULL;
  revision.status:=CASE WHEN source.creation_source='MANUAL_WEB' THEN 'In Progress' ELSE 'Draft' END;
  revision.revision_chain_id:=coalesce(source.revision_chain_id,source.id); revision.original_deur_id:=coalesce(source.original_deur_id,source.id);
  revision.previous_revision_id:=source.id; revision.revision_number:=next_revision;
  revision.correction_reason_code:=btrim(command->>'reasonCode'); revision.correction_reason_details:=btrim(command->>'reasonDetails');
  revision.corrected_by_user_id:=auth.uid()::text; revision.corrected_at:=now_at; revision.created_at:=now_at; revision.updated_at:=now_at; revision.row_version:=1;
  revision.submitted_at:=NULL; revision.submitted_by:=NULL; revision.acknowledged_at:=NULL; revision.acknowledged_by:=NULL; revision.acknowledged_by_user_id:=NULL;
  revision.rejected_at:=NULL; revision.rejected_by:=NULL; revision.rejected_by_user_id:=NULL; revision.rejection_reason:=NULL;
  revision.billing_locked:=false; revision.billing_statement_id:=NULL; revision.bill_id:=NULL; revision.superseded_by_revision_id:=NULL; revision.superseded_at:=NULL;

  UPDATE erp.deurs SET superseded_by_revision_id=revision.id,superseded_at=now_at WHERE id=source.id;
  INSERT INTO erp.deurs SELECT revision.*;

  IF source.creation_source='MANUAL_WEB' THEN
    INSERT INTO erp.deur_events(id,deur_id,activity_type,action,occurred_at,sequence,source,action_group_id,logical_action_id,actor_id,actor_name,created_offline,local_created_at,created_at,server_accepted_at,client_created_at,command_id,idempotency_key,device_id,is_open,company_id)
    SELECT extensions.gen_random_uuid()::text,revision.id,event.activity_type,event.action,
      CASE WHEN erp.is_manual_deur_encoding_bootstrap_event(source,event) THEN revision.created_at ELSE event.occurred_at END,
      event.sequence,event.source,event.action_group_id,event.logical_action_id,event.actor_id,event.actor_name,event.created_offline,event.local_created_at,now_at,
      CASE WHEN erp.is_manual_deur_encoding_bootstrap_event(source,event) THEN revision.created_at ELSE now_at END,
      event.client_created_at,extensions.gen_random_uuid()::text,extensions.gen_random_uuid()::text,event.device_id,
      erp.is_manual_deur_encoding_bootstrap_event(source,event),tenant
    FROM erp.deur_events event WHERE event.deur_id=source.id ORDER BY event.sequence;

    INSERT INTO erp.deur_meter_checkpoints(company_id,deur_id,rental_equipment_line_id,equipment_id,operator_id,kind,reading,client_occurred_at,server_accepted_at,location,created_by,sequence_no,meter_dimension,location_name,custodian_operator_id)
    SELECT tenant,revision.id,checkpoint.rental_equipment_line_id,checkpoint.equipment_id,checkpoint.operator_id,checkpoint.kind,checkpoint.reading,checkpoint.client_occurred_at,now_at,checkpoint.location,checkpoint.created_by,checkpoint.sequence_no,checkpoint.meter_dimension,checkpoint.location_name,checkpoint.custodian_operator_id
    FROM erp.deur_meter_checkpoints checkpoint WHERE checkpoint.deur_id=source.id;

    INSERT INTO erp.deur_refuels(id,company_id,equipment_id,rental_id,rental_equipment_line_id,assignment_id,deur_id,custodian_operator_id,odometer,liters,location_name,client_occurred_at,server_accepted_at,created_by,command_id,idempotency_key,created_at)
    SELECT extensions.gen_random_uuid()::text,tenant,refuel.equipment_id,refuel.rental_id,refuel.rental_equipment_line_id,refuel.assignment_id,revision.id,refuel.custodian_operator_id,refuel.odometer,refuel.liters,refuel.location_name,refuel.client_occurred_at,now_at,refuel.created_by,extensions.gen_random_uuid()::text,extensions.gen_random_uuid()::text,now_at
    FROM erp.deur_refuels refuel WHERE refuel.deur_id=source.id;
  END IF;

  UPDATE erp.customer_review_requests SET status='Revoked',revoked_at=now_at WHERE revision_id=source.id AND status='Pending';
  INSERT INTO erp.audit_log(id,company_id,aggregate_type,aggregate_id,action,actor_id,occurred_at,correlation_id,new_values)
  VALUES(extensions.gen_random_uuid()::text,tenant,'DEUR',revision.id,'DEUR_CORRECTION_REVISION_CREATED',auth.uid()::text,now_at,command->>'commandId',jsonb_build_object('sourceRevisionId',source.id,'revisionNumber',next_revision,'manualEvidenceCopied',source.creation_source='MANUAL_WEB'));
  response:=jsonb_build_object('success',true,'disposition','ACCEPTED','serverOccurredAt',now_at,'refresh',jsonb_build_array(source.id,revision.id),'value',jsonb_build_object('deurId',source.id,'sourceRevisionId',source.id,'revisionId',revision.id,'revisionNumber',next_revision,'version',1));
  RETURN erp.finish_operational_command(command,'CREATE_DEUR_CORRECTION','DEUR',source.id,tenant,auth.uid()::text,payload_hash,response,1);
END $$;
REVOKE ALL ON FUNCTION erp.command_create_deur_correction(jsonb) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION erp.command_create_deur_correction(jsonb) TO authenticated;
COMMIT;
