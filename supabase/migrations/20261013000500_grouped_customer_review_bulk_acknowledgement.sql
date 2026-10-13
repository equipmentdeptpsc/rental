BEGIN;
SET LOCAL search_path=erp,auth,extensions,pg_catalog;

-- The existing per-item decision remains the sole writer of acknowledgement,
-- outcome and audit evidence. A failed member decision rolls back the entire
-- bulk call, including decisions made earlier in this transaction.
CREATE FUNCTION erp.acknowledge_customer_review_batch_items(command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,auth,extensions,pg_catalog AS $$
DECLARE
  batch erp.customer_review_batches; item_id uuid; item_text text; ids uuid[]='{}';
  result jsonb; projection jsonb; idem jsonb; payload_hash text; response jsonb;
  failure_code text;
BEGIN
  IF jsonb_typeof(command)<>'object'
    OR EXISTS(SELECT 1 FROM jsonb_object_keys(command) key
      WHERE key NOT IN('credential','publicItemIds','commandId','idempotencyKey'))
    OR coalesce(command->>'credential','') !~ '^[0-9a-f]{64}$'
    OR nullif(command->>'commandId','') IS NULL
    OR nullif(command->>'idempotencyKey','') IS NULL
    OR coalesce(jsonb_typeof(command->'publicItemIds'),'')<>'array'
    OR jsonb_array_length(command->'publicItemIds') NOT BETWEEN 1 AND 50
  THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;
  FOR item_text IN SELECT value #>> '{}' FROM jsonb_array_elements(command->'publicItemIds') value LOOP
    IF item_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;
    item_id=item_text::uuid;
    IF item_id=ANY(ids) THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;
    ids=array_append(ids,item_id);
  END LOOP;
  SELECT * INTO batch FROM erp.customer_review_batches
  WHERE credential_hash=pg_catalog.encode(extensions.digest(command->>'credential','sha256'),'hex') FOR UPDATE;
  IF batch.id IS NULL THEN RETURN jsonb_build_object('success',false,'code','INVALID_OR_UNAVAILABLE'); END IF;
  IF batch.superseded_at IS NOT NULL THEN RETURN jsonb_build_object('success',false,'code','SUPERSEDED'); END IF;
  IF batch.expires_at<=clock_timestamp() THEN RETURN jsonb_build_object('success',false,'code','EXPIRED'); END IF;
  IF (SELECT count(*) FROM erp.customer_review_batch_items i WHERE i.batch_id=batch.id AND i.id=ANY(ids))<>array_length(ids,1)
  THEN RETURN jsonb_build_object('success',false,'code','INVALID_OR_UNAVAILABLE'); END IF;
  idem=erp.begin_operational_command(command,'GROUPED_PUBLIC_REVIEW_BULK_ACKNOWLEDGE',
    'CUSTOMER_REVIEW_BATCH',batch.id::text,batch.company_id,'public-grouped-review:'||batch.id::text);
  IF idem->>'state'='MISMATCH' THEN RETURN jsonb_build_object('success',false,'code','IDEMPOTENCY_MISMATCH'); END IF;
  IF idem->>'state'='REPLAY' THEN RETURN (idem->'response')||jsonb_build_object('disposition','REPLAYED'); END IF;
  IF idem->>'state'<>'NEW' THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;
  payload_hash=idem->>'payloadHash';
  FOREACH item_id IN ARRAY (SELECT array_agg(id ORDER BY id) FROM unnest(ids) id) LOOP
    result=erp.decide_customer_review_batch_item(jsonb_build_object(
      'credential',command->>'credential','publicItemId',item_id,
      'commandId',(command->>'commandId')||':'||item_id::text,
      'idempotencyKey',(command->>'idempotencyKey')||':'||item_id::text),'ACKNOWLEDGE');
    IF result->>'success'<>'true' THEN
      failure_code=coalesce(result->>'code','NOT_ACTIONABLE');
      RAISE EXCEPTION 'Bulk review item rejected' USING ERRCODE='P0001';
    END IF;
  END LOOP;
  projection=erp.project_public_customer_review_batch(batch.id);
  response=jsonb_build_object('success',true,'disposition','ACCEPTED','serverOccurredAt',clock_timestamp(),'value',projection);
  RETURN erp.finish_operational_command(command,'GROUPED_PUBLIC_REVIEW_BULK_ACKNOWLEDGE',
    'CUSTOMER_REVIEW_BATCH',batch.id::text,batch.company_id,'public-grouped-review:'||batch.id::text,
    payload_hash,response,batch.row_version);
EXCEPTION WHEN SQLSTATE 'P0001' THEN
  RETURN jsonb_build_object('success',false,'code',coalesce(failure_code,'NOT_ACTIONABLE'));
END $$;

ALTER FUNCTION erp.acknowledge_customer_review_batch_items(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.acknowledge_customer_review_batch_items(jsonb) FROM PUBLIC,authenticated,service_role;
GRANT EXECUTE ON FUNCTION erp.acknowledge_customer_review_batch_items(jsonb) TO anon;
COMMIT;
