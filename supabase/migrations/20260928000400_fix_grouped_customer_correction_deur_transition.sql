BEGIN;
SET search_path = erp, pg_catalog;
-- A grouped correction is a canonical per-DEUR decision.  The original
-- grouped wrapper persisted the review request and correction evidence but
-- omitted the matching DEUR lifecycle transition, leaving rental/billing
-- projections to see a submitted DEUR.  Keep the public credential boundary
-- and derive all identities from the finalized batch item.
CREATE OR REPLACE FUNCTION erp.decide_customer_review_batch_item(command jsonb, requested_action text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = erp, pg_catalog
AS $$
DECLARE
  batch_record erp.customer_review_batches;
  item_record erp.customer_review_batch_items;
  request erp.customer_review_requests;
  target erp.deurs;
  now_at timestamptz := clock_timestamp();
  allowed_keys text[];
  remarks text := btrim(coalesce(command->>'remarks',''));
  idem jsonb;
  payload_hash text;
  response jsonb;
  projection jsonb;
BEGIN
  allowed_keys := CASE requested_action
    WHEN 'ACKNOWLEDGE' THEN ARRAY['credential','publicItemId','commandId','idempotencyKey']
    WHEN 'REQUEST_CORRECTION' THEN ARRAY['credential','publicItemId','commandId','idempotencyKey','remarks']
    ELSE ARRAY[]::text[] END;
  IF requested_action NOT IN ('ACKNOWLEDGE','REQUEST_CORRECTION')
    OR jsonb_typeof(command) <> 'object'
    OR coalesce(command->>'credential','') !~ '^[0-9a-f]{64}$'
    OR coalesce(command->>'publicItemId','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    OR nullif(command->>'commandId','') IS NULL OR nullif(command->>'idempotencyKey','') IS NULL
    OR EXISTS (SELECT 1 FROM jsonb_object_keys(command) key WHERE NOT key = ANY(allowed_keys))
    OR (requested_action = 'REQUEST_CORRECTION' AND length(remarks) NOT BETWEEN 10 AND 1000)
    OR (requested_action = 'ACKNOWLEDGE' AND command ? 'remarks')
  THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;

  SELECT * INTO batch_record FROM erp.customer_review_batches
  WHERE credential_hash = pg_catalog.encode(extensions.digest(command->>'credential','sha256'),'hex') FOR UPDATE;
  IF batch_record.id IS NULL THEN RETURN jsonb_build_object('success',false,'code','INVALID_OR_UNAVAILABLE'); END IF;
  IF batch_record.superseded_at IS NOT NULL OR batch_record.superseded_by_batch_id IS NOT NULL
  THEN RETURN jsonb_build_object('success',false,'code','SUPERSEDED'); END IF;
  IF batch_record.expires_at <= now_at THEN RETURN jsonb_build_object('success',false,'code','EXPIRED'); END IF;

  SELECT * INTO item_record FROM erp.customer_review_batch_items
  WHERE batch_id = batch_record.id AND id = (command->>'publicItemId')::uuid FOR UPDATE;
  IF item_record.id IS NULL THEN RETURN jsonb_build_object('success',false,'code','INVALID_OR_UNAVAILABLE'); END IF;
  IF item_record.customer_review_request_id IS NULL OR item_record.deur_id IS NULL OR item_record.revision_id IS NULL
  THEN RETURN jsonb_build_object('success',false,'code','NOT_ACTIONABLE'); END IF;

  SELECT * INTO request FROM erp.customer_review_requests
  WHERE company_id = item_record.company_id AND id = item_record.customer_review_request_id
    AND rental_id = item_record.rental_id
    AND rental_equipment_line_id = item_record.rental_equipment_line_id
    AND deur_id = item_record.deur_id AND revision_id = item_record.revision_id
  FOR UPDATE;
  IF request.id IS NULL THEN RETURN jsonb_build_object('success',false,'code','INVALID_OR_UNAVAILABLE'); END IF;

  idem := erp.begin_operational_command(command,'GROUPED_PUBLIC_REVIEW_'||requested_action,
    'CUSTOMER_REVIEW_BATCH_ITEM',item_record.id::text,request.company_id,
    'public-grouped-review:'||batch_record.id::text||':'||item_record.id::text);
  IF idem->>'state' = 'MISMATCH' THEN RETURN jsonb_build_object('success',false,'code','IDEMPOTENCY_MISMATCH'); END IF;
  IF idem->>'state' = 'REPLAY' THEN RETURN (idem->'response') || jsonb_build_object('disposition','REPLAYED'); END IF;

  IF request.status IN ('Acknowledged','CorrectionRequested') OR request.consumed_at IS NOT NULL
  THEN RETURN jsonb_build_object('success',false,'code','ALREADY_COMPLETED'); END IF;
  IF request.status <> 'Pending' OR request.revoked_at IS NOT NULL OR request.superseded_at IS NOT NULL
    OR request.expires_at <= now_at OR NOT requested_action = ANY(request.permitted_actions)
  THEN RETURN jsonb_build_object('success',false,'code','NOT_ACTIONABLE'); END IF;

  SELECT * INTO target FROM erp.deurs WHERE company_id = request.company_id AND id = request.revision_id FOR UPDATE;
  IF target.id IS NULL OR target.id IS DISTINCT FROM request.deur_id
    OR target.rental_id IS DISTINCT FROM request.rental_id
    OR target.rental_equipment_line_id IS DISTINCT FROM request.rental_equipment_line_id
    OR target.status <> 'Submitted' OR target.superseded_by_revision_id IS NOT NULL
    OR target.row_version IS DISTINCT FROM request.revision_version
  THEN RETURN jsonb_build_object('success',false,'code','NOT_ACTIONABLE'); END IF;
  payload_hash := idem->>'payloadHash';

  INSERT INTO erp.customer_review_outcomes(company_id,review_request_id,rental_id,deur_id,revision_id,
    action,customer_reason,recipient_name,occurred_at)
  VALUES(request.company_id,request.id,request.rental_id,request.deur_id,request.revision_id,
    requested_action,CASE WHEN requested_action='REQUEST_CORRECTION' THEN remarks END,request.recipient_name,now_at);

  IF requested_action = 'ACKNOWLEDGE' THEN
    UPDATE erp.deurs SET status='Acknowledged',acknowledged_at=now_at,
      acknowledged_by=request.recipient_name,acknowledgement_remarks=NULL WHERE id=target.id RETURNING * INTO target;
    INSERT INTO erp.deur_review_history(id,deur_id,action,actor_name,occurred_at,company_id)
      VALUES(extensions.gen_random_uuid()::text,target.id,'acknowledged',request.recipient_name,now_at,request.company_id);
    UPDATE erp.customer_review_requests SET status='Acknowledged',consumed_at=now_at,row_version=row_version+1 WHERE id=request.id;
  ELSE
    INSERT INTO erp.customer_correction_requests(company_id,review_request_id,source_revision_id,customer_reason)
      VALUES(request.company_id,request.id,request.revision_id,remarks);
    UPDATE erp.customer_review_requests SET status='CorrectionRequested',consumed_at=now_at,
      customer_comment=remarks,row_version=row_version+1 WHERE id=request.id;
    UPDATE erp.deurs SET status='Rejected',rejected_at=now_at,rejected_by=request.recipient_name,
      rejection_reason=remarks WHERE id=target.id RETURNING * INTO target;
  END IF;

  INSERT INTO erp.audit_log(id,company_id,aggregate_type,aggregate_id,action,actor_id,occurred_at,correlation_id,new_values)
  VALUES(extensions.gen_random_uuid()::text,request.company_id,'CUSTOMER_REVIEW',request.id::text,
    requested_action,NULL,now_at,command->>'commandId',jsonb_build_object('revisionId',request.revision_id,
      'batchItemPublicId',item_record.id,'reason',CASE WHEN requested_action='REQUEST_CORRECTION' THEN remarks END));

  projection := erp.project_public_customer_review_batch(batch_record.id);
  response := jsonb_build_object('success',true,'disposition','ACCEPTED','serverOccurredAt',now_at,'value',projection);
  RETURN erp.finish_operational_command(command,'GROUPED_PUBLIC_REVIEW_'||requested_action,
    'CUSTOMER_REVIEW_BATCH_ITEM',item_record.id::text,request.company_id,
    'public-grouped-review:'||batch_record.id::text||':'||item_record.id::text,
    payload_hash,response,target.row_version);
EXCEPTION WHEN unique_violation THEN
  RETURN jsonb_build_object('success',false,'code','ALREADY_COMPLETED');
END;
$$;
-- Repair only completed correction decisions whose corresponding effective
-- revision remains submitted. The original immutable outcome/audit evidence
-- remains authoritative; this adds the omitted lifecycle projection.
WITH repaired AS (
  UPDATE erp.deurs AS target
  SET status='Rejected',
      rejected_at=coalesce(target.rejected_at,request.consumed_at),
      rejected_by=coalesce(target.rejected_by,request.recipient_name),
      rejection_reason=coalesce(target.rejection_reason,request.customer_comment),
      updated_at=clock_timestamp()
  FROM erp.customer_review_requests AS request
  WHERE request.company_id=target.company_id
    AND request.deur_id=target.id
    AND request.revision_id=target.id
    AND request.status='CorrectionRequested'
    AND request.consumed_at IS NOT NULL
    AND target.status='Submitted'
    AND target.superseded_by_revision_id IS NULL
  RETURNING target.id,target.company_id,request.id AS review_request_id,request.consumed_at
)
INSERT INTO erp.audit_log(id,company_id,aggregate_type,aggregate_id,action,actor_name,occurred_at,correlation_id,new_values)
SELECT extensions.gen_random_uuid()::text,company_id,'DEUR',id::text,'CUSTOMER_CORRECTION_STATE_REPAIRED',
  'System',clock_timestamp(),review_request_id::text,jsonb_build_object('reviewRequestId',review_request_id,'decisionOccurredAt',consumed_at)
FROM repaired;
COMMIT;
