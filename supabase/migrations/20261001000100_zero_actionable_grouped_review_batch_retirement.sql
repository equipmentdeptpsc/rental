BEGIN;
SET search_path=erp,auth,pg_catalog;
ALTER TABLE erp.customer_review_batches
  ADD COLUMN retired_no_actionable_at timestamptz;
ALTER TABLE erp.customer_review_batches
  ADD CONSTRAINT customer_review_batches_retired_no_actionable_check CHECK (
    retired_no_actionable_at IS NULL OR (superseded_at IS NULL AND superseded_by_batch_id IS NULL)
  );
DROP INDEX erp.uq_customer_review_batches_current_group_date;
CREATE UNIQUE INDEX uq_customer_review_batches_current_group_date
  ON erp.customer_review_batches(company_id,customer_id,project_id,rental_id,review_date)
  WHERE superseded_at IS NULL AND retired_no_actionable_at IS NULL;
CREATE FUNCTION erp.command_retire_zero_actionable_customer_review_batch(command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,auth,pg_catalog AS $$
DECLARE tenant text=erp.current_company_id(); batch erp.customer_review_batches; idem jsonb; payload_hash text; response jsonb; now_at timestamptz=clock_timestamp();
BEGIN
  IF tenant IS NULL THEN RETURN jsonb_build_object('success',false,'code','UNAUTHENTICATED'); END IF;
  IF NOT erp.current_user_has_permission('deur.customerReview.issue') THEN RETURN jsonb_build_object('success',false,'code','FORBIDDEN'); END IF;
  IF jsonb_typeof(command)<>'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(command) k WHERE k NOT IN('batchId','commandId','idempotencyKey'))
    OR coalesce(command->>'batchId','') !~ '^[0-9a-f-]{36}$' OR nullif(command->>'commandId','') IS NULL OR nullif(command->>'idempotencyKey','') IS NULL
  THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;
  SELECT * INTO batch FROM erp.customer_review_batches WHERE id=(command->>'batchId')::uuid AND company_id=tenant FOR UPDATE;
  IF batch.id IS NULL THEN RETURN jsonb_build_object('success',false,'code','NOT_FOUND'); END IF;
  idem=erp.begin_operational_command(command,'RETIRE_ZERO_ACTIONABLE_CUSTOMER_REVIEW_BATCH','CUSTOMER_REVIEW_BATCH',batch.id::text,tenant,auth.uid()::text);
  IF idem->>'state'='MISMATCH' THEN RETURN jsonb_build_object('success',false,'code','IDEMPOTENCY_MISMATCH'); END IF;
  IF idem->>'state'='REPLAY' THEN RETURN (idem->'response')||jsonb_build_object('disposition','REPLAYED'); END IF;
  IF idem->>'state'<>'NEW' THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;
  payload_hash=idem->>'payloadHash';
  IF batch.retired_no_actionable_at IS NOT NULL THEN RETURN jsonb_build_object('success',false,'code','ALREADY_RETIRED'); END IF;
  IF batch.superseded_at IS NOT NULL OR batch.finalized_at IS NULL
    OR EXISTS(SELECT 1 FROM erp.customer_review_batch_items i WHERE i.batch_id=batch.id AND i.customer_review_request_id IS NOT NULL)
    OR EXISTS(SELECT 1 FROM erp.customer_review_requests r WHERE r.company_id=tenant AND r.rental_id=batch.rental_id AND r.created_at>=batch.created_at AND r.created_at<=batch.expires_at)
    OR EXISTS(SELECT 1 FROM erp.notification_outbox n WHERE n.company_id=tenant AND n.source_aggregate_type='CUSTOMER_REVIEW_BATCH' AND n.source_aggregate_id=batch.id::text)
    OR EXISTS(SELECT 1 FROM erp.notification_delivery_attempts a JOIN erp.notification_outbox n ON n.id=a.notification_id WHERE n.company_id=tenant AND n.source_aggregate_type='CUSTOMER_REVIEW_BATCH' AND n.source_aggregate_id=batch.id::text)
    OR EXISTS(SELECT 1 FROM erp.billing_statement_lines l JOIN erp.customer_review_batch_items i ON i.deur_id=l.deur_id WHERE i.batch_id=batch.id)
  THEN RETURN jsonb_build_object('success',false,'code','ZERO_ACTIONABLE_RETIREMENT_REJECTED'); END IF;
  UPDATE erp.customer_review_batches SET retired_no_actionable_at=now_at,row_version=row_version+1 WHERE id=batch.id RETURNING * INTO batch;
  INSERT INTO erp.audit_log(id,company_id,aggregate_type,aggregate_id,action,actor_id,occurred_at,correlation_id,new_values)
  VALUES(extensions.gen_random_uuid()::text,tenant,'CUSTOMER_REVIEW_BATCH',batch.id::text,'CUSTOMER_REVIEW_BATCH_RETIRED_NO_ACTIONABLE',auth.uid()::text,now_at,command->>'commandId',jsonb_build_object('resultCode','RETIRED_NO_ACTIONABLE'));
  response=jsonb_build_object('success',true,'disposition','RETIRED_NO_ACTIONABLE','value',jsonb_build_object('batchId',batch.id,'retiredNoActionableAt',batch.retired_no_actionable_at));
  RETURN erp.finish_operational_command(command,'RETIRE_ZERO_ACTIONABLE_CUSTOMER_REVIEW_BATCH','CUSTOMER_REVIEW_BATCH',batch.id::text,tenant,auth.uid()::text,payload_hash,response,batch.row_version);
END $$;
DO $$ DECLARE definition text; needle text='AND superseded_at IS NULL;'; BEGIN
  SELECT pg_get_functiondef('erp.command_generate_customer_review_batch(jsonb)'::regprocedure) INTO definition;
  IF (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 THEN RAISE EXCEPTION 'current grouped-review batch lookup did not match the authoritative definition' USING ERRCODE='55000'; END IF;
  definition:=replace(definition,needle,'AND superseded_at IS NULL AND retired_no_actionable_at IS NULL;');
  EXECUTE definition;
END $$;
ALTER FUNCTION erp.command_retire_zero_actionable_customer_review_batch(jsonb) OWNER TO postgres;
ALTER FUNCTION erp.command_generate_customer_review_batch(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.command_retire_zero_actionable_customer_review_batch(jsonb) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION erp.command_retire_zero_actionable_customer_review_batch(jsonb) TO authenticated;
COMMENT ON COLUMN erp.customer_review_batches.retired_no_actionable_at IS 'Terminal evidence-preserving disposition for a finalized grouped batch with no requests, notification, delivery, provider attempt, or billing dependency.';
COMMENT ON FUNCTION erp.command_retire_zero_actionable_customer_review_batch(jsonb) IS 'Authenticated, tenant-derived, idempotent retirement for a zero-actionable frozen grouped Customer Review batch; never clones or rewrites historical items.';
COMMIT;
