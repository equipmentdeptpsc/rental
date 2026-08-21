BEGIN;

-- Submitting an Operator's own completed DEUR is part of the create/edit
-- lifecycle. Review authority remains reserved for acknowledgement, rejection,
-- reopening, and correction workflows.
CREATE OR REPLACE FUNCTION erp.command_submit_deur(command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,auth AS $$
DECLARE
  scope jsonb; idem jsonb; now_at timestamptz=clock_timestamp();
  current_deur erp.deurs%ROWTYPE; response jsonb; payload_hash text;
  corrected_complete boolean=false;
BEGIN
  scope=erp.validate_deur_command_scope(command,'deur.create');
  IF scope->>'code'<>'OK' THEN RETURN jsonb_build_object('success',false,'code',scope->>'code'); END IF;
  idem=erp.begin_deur_command(command,'SUBMIT_DEUR');
  IF idem->>'state'='MISMATCH' THEN RETURN jsonb_build_object('success',false,'code','IDEMPOTENCY_MISMATCH'); END IF;
  IF idem->>'state'='REPLAY' THEN RETURN (idem->'response')||jsonb_build_object('disposition','REPLAYED'); END IF;
  payload_hash=idem->>'payloadHash';
  SELECT d.* INTO current_deur FROM erp.deurs AS d
    WHERE d.id=(command->>'deurId') AND d.company_id=erp.current_company_id() FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success',false,'code','NOT_FOUND'); END IF;
  IF current_deur.operator_id<>command->>'operatorId' THEN
    RETURN jsonb_build_object('success',false,'code','OWNERSHIP_MISMATCH');
  END IF;
  IF current_deur.row_version<>(command->>'expectedVersion')::bigint THEN
    RETURN jsonb_build_object('success',false,'code','CONFLICT','aggregateId',current_deur.id,
      'expectedVersion',(command->>'expectedVersion')::bigint,'currentVersion',current_deur.row_version,'refreshRequired',true);
  END IF;
  corrected_complete=current_deur.status='Draft'
    AND current_deur.previous_revision_id IS NOT NULL
    AND EXISTS(
      SELECT 1 FROM erp.deur_events AS ev
      WHERE ev.deur_id=current_deur.id AND ev.source='correction'
        AND ev.activity_type='shift' AND ev.action='end'
    )
    AND NOT EXISTS(
      SELECT 1 FROM erp.deur_events AS ev
      WHERE ev.deur_id=current_deur.id AND ev.source<>'correction'
    );
  IF (current_deur.status<>'In Progress' AND NOT corrected_complete)
     OR EXISTS(SELECT 1 FROM erp.deur_events AS ev WHERE ev.deur_id=current_deur.id AND ev.is_open)
     OR NOT EXISTS(SELECT 1 FROM erp.deur_events AS ev
       WHERE ev.deur_id=current_deur.id AND ev.activity_type='shift' AND ev.action='end')
  THEN RETURN jsonb_build_object('success',false,'code','INVALID_TRANSITION'); END IF;
  UPDATE erp.deurs AS d SET status='Submitted',submitted_at=now_at,submitted_by=auth.uid()::text,
    updated_at=now_at,updated_by=auth.uid()::text
    WHERE d.id=current_deur.id RETURNING d.* INTO current_deur;
  INSERT INTO erp.audit_log(id,aggregate_type,aggregate_id,action,actor_id,occurred_at,correlation_id,new_values,company_id)
  VALUES(extensions.gen_random_uuid()::text,'DEUR',current_deur.id,'SUBMIT_DEUR',auth.uid()::text,now_at,
    command->>'commandId',to_jsonb(current_deur),current_deur.company_id);
  response=jsonb_build_object('success',true,'disposition','ACCEPTED','record',to_jsonb(current_deur),
    'version',current_deur.row_version,'serverOccurredAt',now_at);
  RETURN erp.finish_deur_command(command,'SUBMIT_DEUR',current_deur.id,payload_hash,response);
END $$;

REVOKE ALL ON FUNCTION erp.command_submit_deur(jsonb) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION erp.command_submit_deur(jsonb) TO authenticated;

COMMIT;
