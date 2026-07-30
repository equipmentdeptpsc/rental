BEGIN;
SET search_path TO erp, auth, pg_catalog;

CREATE OR REPLACE FUNCTION command_create_deur_correction(command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,auth AS $$
DECLARE
  tenant text=current_company_id(); source deurs; revision deurs; next_revision integer;
  now_at timestamptz=clock_timestamp(); idem jsonb; payload_hash text; response jsonb;
BEGIN
  IF tenant IS NULL OR NOT current_user_has_permission('deur.correct') THEN
    RETURN jsonb_build_object('success',false,'code','FORBIDDEN');
  END IF;
  IF nullif(btrim(command->>'reasonCode'),'') IS NULL
     OR nullif(btrim(command->>'reasonDetails'),'') IS NULL
  THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED','message','A correction reason is required.'); END IF;
  SELECT * INTO source FROM deurs WHERE id=command->>'sourceRevisionId' AND company_id=tenant FOR UPDATE;
  IF source.id IS NULL THEN RETURN jsonb_build_object('success',false,'code','NOT_FOUND'); END IF;
  idem=begin_operational_command(command,'CREATE_DEUR_CORRECTION','DEUR',source.id,tenant,auth.uid()::text);
  IF idem->>'state'='MISMATCH' THEN
    RETURN jsonb_build_object('success',false,'code','IDEMPOTENCY_MISMATCH','message','Idempotency key payload mismatch.','retryable',false,'refreshRequired',false);
  END IF;
  IF idem->>'state'='REPLAY' THEN RETURN (idem->'response')||jsonb_build_object('disposition','REPLAYED'); END IF;
  payload_hash=idem->>'payloadHash';
  IF source.row_version<>coalesce((command->>'expectedVersion')::bigint,source.row_version) THEN
    RETURN jsonb_build_object('success',false,'code','CONFLICT','currentVersion',source.row_version,'refreshRequired',true);
  END IF;
  IF source.billing_locked OR source.superseded_by_revision_id IS NOT NULL THEN
    RETURN jsonb_build_object('success',false,'code','INVALID_TRANSITION');
  END IF;
  SELECT coalesce(max(revision_number),1)+1 INTO next_revision
    FROM deurs WHERE company_id=tenant AND revision_chain_id=coalesce(source.revision_chain_id,source.id);
  revision=source; revision.id=gen_random_uuid()::text; revision.deur_number=NULL;
  revision.status='Draft'; revision.revision_chain_id=coalesce(source.revision_chain_id,source.id);
  revision.original_deur_id=coalesce(source.original_deur_id,source.id);
  revision.previous_revision_id=source.id; revision.revision_number=next_revision;
  revision.correction_reason_code=btrim(command->>'reasonCode');
  revision.correction_reason_details=btrim(command->>'reasonDetails');
  revision.corrected_by_user_id=auth.uid()::text; revision.corrected_at=now_at;
  revision.created_at=now_at; revision.updated_at=now_at; revision.row_version=1;
  revision.submitted_at=NULL; revision.acknowledged_at=NULL; revision.rejected_at=NULL;
  revision.billing_locked=false; revision.billing_statement_id=NULL; revision.bill_id=NULL;
  revision.superseded_by_revision_id=NULL; revision.superseded_at=NULL;

  -- Retire the prior effective row before inserting its replacement so the
  -- partial one-active-DEUR indexes remain true throughout the statement.
  UPDATE deurs SET superseded_by_revision_id=revision.id,superseded_at=now_at
    WHERE id=source.id;
  INSERT INTO deurs SELECT revision.*;
  UPDATE customer_review_requests SET status='Revoked',revoked_at=now_at
    WHERE revision_id=source.id AND status='Pending';
  response=jsonb_build_object('success',true,'disposition','ACCEPTED','serverOccurredAt',now_at,
    'refresh',jsonb_build_array(source.id,revision.id),
    'value',jsonb_build_object('deurId',source.id,'sourceRevisionId',source.id,
      'revisionId',revision.id,'revisionNumber',next_revision,'version',1));
  RETURN finish_operational_command(command,'CREATE_DEUR_CORRECTION','DEUR',source.id,tenant,
    auth.uid()::text,payload_hash,response,1);
END $$;

REVOKE ALL ON FUNCTION command_create_deur_correction(jsonb) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION command_create_deur_correction(jsonb) TO authenticated;

COMMIT;
