BEGIN;
SET LOCAL search_path=erp,auth,extensions,pg_catalog;

-- A shared bearer link cannot authenticate a person. For Project batches the
-- action must nevertheless carry one claimed reviewer from the frozen recipient
-- snapshot; historical Rental batches retain their original contract.
CREATE FUNCTION pg_temp.replace_project_review_contract(source text,needle text,replacement text)
RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  IF needle='' OR (length(source)-length(replace(source,needle,'')))/length(needle)<>1
  THEN RAISE EXCEPTION 'Grouped review contract changed: %',left(needle,80) USING ERRCODE='55000'; END IF;
  RETURN replace(source,needle,replacement);
END $$;

DO $migration$
DECLARE definition text;
BEGIN
  SELECT pg_get_functiondef('erp.project_public_customer_review_batch(uuid)'::regprocedure) INTO definition;
  definition=pg_temp.replace_project_review_contract(definition,
    '''items'', projected_items',
    '''items'', projected_items, ''reviewers'', CASE WHEN batch_record.group_scope=''PROJECT'' THEN batch_record.recipient_snapshot ELSE ''[]''::jsonb END');
  EXECUTE definition;

  SELECT pg_get_functiondef('erp.decide_customer_review_batch_item(jsonb,text)'::regprocedure) INTO definition;
  definition=pg_temp.replace_project_review_contract(definition,
    '  allowed_keys text[];',
    '  allowed_keys text[]; reviewer_name text; reviewer_email text;');
  definition=pg_temp.replace_project_review_contract(definition,
    '  IF batch_record.expires_at <= now_at THEN RETURN jsonb_build_object(''success'',false,''code'',''EXPIRED''); END IF;',
    $replacement$  IF batch_record.expires_at <= now_at THEN RETURN jsonb_build_object('success',false,'code','EXPIRED'); END IF;
  IF batch_record.group_scope='PROJECT' THEN
    reviewer_email=lower(btrim(coalesce(command->>'reviewerEmail','')));
    SELECT recipient->>'name' INTO reviewer_name FROM jsonb_array_elements(batch_record.recipient_snapshot) recipient
      WHERE recipient->>'email'=reviewer_email;
    IF nullif(btrim(coalesce(reviewer_name,'')),'') IS NULL
    THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;
  ELSIF command ? 'reviewerEmail' THEN
    RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED');
  END IF;$replacement$);
  definition=pg_temp.replace_project_review_contract(definition,
    'IF request.id IS NULL THEN RETURN jsonb_build_object(''success'',false,''code'',''INVALID_OR_UNAVAILABLE''); END IF;',
    'IF request.id IS NULL THEN RETURN jsonb_build_object(''success'',false,''code'',''INVALID_OR_UNAVAILABLE''); END IF; reviewer_name=coalesce(reviewer_name,request.recipient_name);');
  definition=pg_temp.replace_project_review_contract(definition,
    '''batchItemPublicId'',item_record.id,''reason'',CASE WHEN requested_action=''REQUEST_CORRECTION'' THEN remarks END',
    '''batchItemPublicId'',item_record.id,''reason'',CASE WHEN requested_action=''REQUEST_CORRECTION'' THEN remarks END,''claimedReviewerEmail'',reviewer_email,''identityEvidence'',CASE WHEN batch_record.group_scope=''PROJECT'' THEN ''CLAIMED_FROM_SHARED_LINK'' ELSE ''LEGACY_RENTAL_RECIPIENT'' END');
  IF (length(definition)-length(replace(definition,'request.recipient_name','')))/length('request.recipient_name')<>5
  THEN RAISE EXCEPTION 'Grouped reviewer attribution contract changed' USING ERRCODE='55000'; END IF;
  definition=replace(definition,'request.recipient_name','reviewer_name');
  -- The fallback assignment must continue reading the legacy request field.
  definition=replace(definition,'reviewer_name=coalesce(reviewer_name,reviewer_name)',
    'reviewer_name=coalesce(reviewer_name,request.recipient_name)');
  definition=replace(definition,
    'ARRAY[''credential'',''publicItemId'',''commandId'',''idempotencyKey'']',
    'ARRAY[''credential'',''publicItemId'',''commandId'',''idempotencyKey'',''reviewerEmail'']');
  definition=replace(definition,
    'ARRAY[''credential'',''publicItemId'',''commandId'',''idempotencyKey'',''remarks'']',
    'ARRAY[''credential'',''publicItemId'',''commandId'',''idempotencyKey'',''remarks'',''reviewerEmail'']');
  EXECUTE definition;

  SELECT pg_get_functiondef('erp.acknowledge_customer_review_batch_items(jsonb)'::regprocedure) INTO definition;
  definition=pg_temp.replace_project_review_contract(definition,
    $needle$WHERE key NOT IN('credential','publicItemIds','commandId','idempotencyKey')$needle$,
    $replacement$WHERE key NOT IN('credential','publicItemIds','commandId','idempotencyKey','reviewerEmail')$replacement$);
  definition=pg_temp.replace_project_review_contract(definition,
    $needle$IF batch.expires_at<=clock_timestamp() THEN RETURN jsonb_build_object('success',false,'code','EXPIRED'); END IF;$needle$,
    $replacement$IF batch.expires_at<=clock_timestamp() THEN RETURN jsonb_build_object('success',false,'code','EXPIRED'); END IF;
  IF batch.group_scope='PROJECT' AND NOT EXISTS(
    SELECT 1 FROM jsonb_array_elements(batch.recipient_snapshot) recipient
    WHERE recipient->>'email'=lower(btrim(coalesce(command->>'reviewerEmail',''))))
  THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;
  IF batch.group_scope<>'PROJECT' AND command ? 'reviewerEmail'
  THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;$replacement$);
  definition=pg_temp.replace_project_review_contract(definition,
    $needle$'idempotencyKey',(command->>'idempotencyKey')||':'||item_id::text),'ACKNOWLEDGE')$needle$,
    $replacement$'idempotencyKey',(command->>'idempotencyKey')||':'||item_id::text) || CASE WHEN batch.group_scope='PROJECT' THEN jsonb_build_object('reviewerEmail',lower(btrim(command->>'reviewerEmail'))) ELSE '{}'::jsonb END,'ACKNOWLEDGE')$replacement$);
  EXECUTE definition;
END $migration$;

ALTER FUNCTION erp.project_public_customer_review_batch(uuid) OWNER TO postgres;
ALTER FUNCTION erp.decide_customer_review_batch_item(jsonb,text) OWNER TO postgres;
ALTER FUNCTION erp.acknowledge_customer_review_batch_items(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.project_public_customer_review_batch(uuid),erp.decide_customer_review_batch_item(jsonb,text)
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION erp.acknowledge_customer_review_batch_items(jsonb) FROM PUBLIC,authenticated,service_role;
GRANT EXECUTE ON FUNCTION erp.acknowledge_customer_review_batch_items(jsonb) TO anon;
COMMIT;
