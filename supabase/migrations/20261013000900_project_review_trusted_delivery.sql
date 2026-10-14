BEGIN;
SET LOCAL search_path=erp,auth,extensions,pg_catalog;

-- The service may discover only the recipient snapshot for an actor already
-- authorized to issue a Project review. It never receives review credentials.
CREATE FUNCTION erp.read_project_review_delivery_recipients(target_rental_id text,actor_id uuid,scheduler boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,auth,pg_catalog AS $$
DECLARE rental erp.rentals; contacts erp.project_customer_review_recipients;
BEGIN
  IF auth.role()<>'service_role' OR actor_id IS NULL OR nullif(btrim(target_rental_id),'') IS NULL
  THEN RETURN jsonb_build_object('success',false,'code','FORBIDDEN'); END IF;
  SELECT * INTO rental FROM erp.rentals WHERE id=target_rental_id;
  IF rental.id IS NULL OR rental.project_id IS NULL OR rental.customer_id IS NULL
  THEN RETURN jsonb_build_object('success',false,'code','NOT_FOUND'); END IF;
  IF scheduler THEN
    IF NOT EXISTS(SELECT 1 FROM erp.system_principals principal
      JOIN erp.system_principal_permissions permission ON permission.principal_id=principal.id
      WHERE principal.id=actor_id AND principal.company_id=rental.company_id
        AND principal.active AND principal.principal_type='GROUPED_REVIEW_SCHEDULER'
        AND permission.permission_code='grouped_review.schedule')
    THEN RETURN jsonb_build_object('success',false,'code','FORBIDDEN'); END IF;
  ELSE
    IF NOT EXISTS(SELECT 1 FROM erp.users actor JOIN erp.companies company ON company.id=actor.company_id
      WHERE actor.id=actor_id AND actor.company_id=rental.company_id AND actor.status='active' AND company.active)
    THEN RETURN jsonb_build_object('success',false,'code','FORBIDDEN'); END IF;
    PERFORM pg_catalog.set_config('request.jwt.claim.sub',actor_id::text,true);
    IF NOT erp.current_user_has_permission('deur.review')
    THEN RETURN jsonb_build_object('success',false,'code','FORBIDDEN'); END IF;
  END IF;
  IF NOT EXISTS(SELECT 1 FROM erp.projects project WHERE project.company_id=rental.company_id
    AND project.id=rental.project_id AND project.customer_id=rental.customer_id
    AND project.active AND project.deleted_at IS NULL)
  THEN RETURN jsonb_build_object('success',false,'code','PROJECT_RELATIONSHIP_INVALID'); END IF;
  SELECT * INTO contacts FROM erp.project_customer_review_recipients
    WHERE company_id=rental.company_id AND project_id=rental.project_id;
  IF contacts.project_id IS NULL OR jsonb_array_length(contacts.recipients)=0
  THEN RETURN jsonb_build_object('success',false,'code','PROJECT_REVIEW_RECIPIENTS_REQUIRED'); END IF;
  RETURN jsonb_build_object('success',true,'value',jsonb_build_object(
    'recipients',contacts.recipients,'recipientVersion',contacts.row_version));
END $$;

CREATE FUNCTION erp.trusted_prepare_project_grouped_review_delivery(command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,auth,extensions,pg_catalog AS $$
DECLARE actor_id uuid; rental erp.rentals; contacts erp.project_customer_review_recipients;
  authority_result jsonb; generated jsonb; batch erp.customer_review_batches;
  supplied jsonb; reviewer jsonb; notification_id uuid; seen text[]='{}'; address text;
  identity text; payload jsonb; intent erp.notification_outbox; notification_ids jsonb='[]'::jsonb;
BEGIN
  IF auth.role()<>'service_role' OR jsonb_typeof(command)<>'object'
    OR EXISTS(SELECT 1 FROM jsonb_object_keys(command) key WHERE key NOT IN
      ('commandId','idempotencyKey','rentalId','businessDate','actorId','scheduler','credentialHash','envelopes'))
    OR coalesce(command->>'actorId','') !~ '^[0-9a-f-]{36}$'
    OR nullif(command->>'rentalId','') IS NULL OR nullif(command->>'commandId','') IS NULL
    OR nullif(command->>'idempotencyKey','') IS NULL
    OR coalesce(command->>'credentialHash','') !~ '^[0-9a-f]{64}$'
    OR coalesce(jsonb_typeof(command->'envelopes'),'')<>'array'
    OR jsonb_array_length(command->'envelopes') NOT BETWEEN 1 AND 10
    OR coalesce(jsonb_typeof(command->'scheduler'),'')<>'boolean'
  THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;
  BEGIN actor_id=(command->>'actorId')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END;
  SELECT * INTO rental FROM erp.rentals WHERE id=command->>'rentalId' FOR UPDATE;
  IF rental.id IS NULL THEN RETURN jsonb_build_object('success',false,'code','NOT_FOUND'); END IF;
  authority_result=erp.read_project_review_delivery_recipients(rental.id,actor_id,(command->>'scheduler')::boolean);
  IF authority_result->>'success'<>'true' THEN RETURN authority_result; END IF;
  SELECT * INTO contacts FROM erp.project_customer_review_recipients
    WHERE company_id=rental.company_id AND project_id=rental.project_id FOR SHARE;
  IF contacts.row_version IS DISTINCT FROM (authority_result#>>'{value,recipientVersion}')::bigint
    OR contacts.recipients IS DISTINCT FROM authority_result#>'{value,recipients}'
    OR jsonb_array_length(contacts.recipients)<>jsonb_array_length(command->'envelopes')
  THEN RETURN jsonb_build_object('success',false,'code','RECIPIENT_SNAPSHOT_MISMATCH'); END IF;
  FOR supplied IN SELECT value FROM jsonb_array_elements(command->'envelopes') LOOP
    address=lower(btrim(coalesce(supplied->>'recipientEmail','')));
    IF coalesce(jsonb_typeof(supplied),'')<>'object'
      OR EXISTS(SELECT 1 FROM jsonb_object_keys(supplied) key WHERE key NOT IN
        ('recipientEmail','notificationId','envelopeType','envelopeVersion','keyVersion','ciphertext','nonce','authTag'))
      OR address=ANY(seen)
      OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(contacts.recipients) recipient WHERE recipient->>'email'=address)
      OR coalesce(supplied->>'notificationId','') !~ '^[0-9a-f-]{36}$'
      OR supplied->>'envelopeType'<>'GROUPED_CUSTOMER_REVIEW_PATH'
      OR supplied->>'envelopeVersion'<>'1' OR supplied->>'keyVersion'<>'1'
      OR coalesce(supplied->>'ciphertext','') !~ '^[A-Za-z0-9+/]+={0,2}$'
      OR coalesce(supplied->>'nonce','') !~ '^[A-Za-z0-9+/]{16}$'
      OR coalesce(supplied->>'authTag','') !~ '^[A-Za-z0-9+/]{22}==$'
    THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;
    seen=array_append(seen,address);
  END LOOP;
  IF (command->>'scheduler')::boolean THEN
    PERFORM pg_catalog.set_config('erp.system_principal_id',actor_id::text,true);
    PERFORM pg_catalog.set_config('erp.scheduler_preparation','true',true);
  END IF;
  PERFORM pg_catalog.set_config('request.jwt.claim.sub',actor_id::text,true);
  generated=erp.internal_generate_customer_review_batch(jsonb_build_object(
    'commandId',command->>'commandId','idempotencyKey',command->>'idempotencyKey',
    'rentalId',rental.id,'businessDate',command->>'businessDate'),command->>'credentialHash');
  IF generated->>'success'<>'true' OR generated->>'disposition'<>'CREATED' THEN RETURN generated; END IF;
  IF coalesce((generated#>>'{value,actionableCount}')::integer,0)=0
  THEN RETURN jsonb_set(generated,'{disposition}',to_jsonb('NO_ACTIONABLE_ITEMS'::text),true); END IF;
  SELECT * INTO batch FROM erp.customer_review_batches WHERE id=(generated#>>'{value,batchId}')::uuid
    AND company_id=rental.company_id AND group_scope='PROJECT' AND credential_hash=command->>'credentialHash'
    AND recipient_snapshot=contacts.recipients AND recipient_version=contacts.row_version
    AND finalized_at IS NOT NULL AND superseded_at IS NULL AND expires_at>clock_timestamp() FOR UPDATE;
  IF batch.id IS NULL THEN RAISE EXCEPTION 'Project review batch snapshot mismatch' USING ERRCODE='55000'; END IF;
  FOR supplied IN SELECT value FROM jsonb_array_elements(command->'envelopes') LOOP
    address=lower(btrim(supplied->>'recipientEmail'));
    SELECT value INTO reviewer FROM jsonb_array_elements(batch.recipient_snapshot) value WHERE value->>'email'=address;
    notification_id=(supplied->>'notificationId')::uuid;
    identity='customer-grouped-review:'||batch.id::text||':project:'||
      pg_catalog.encode(extensions.digest(address,'sha256'),'hex');
    payload=jsonb_build_object('recipientName',reviewer->>'name','companyName',batch.summary_snapshot->>'company',
      'customerName',batch.summary_snapshot->>'customer','projectName',batch.summary_snapshot->>'project',
      'rentalReference','Project review','reviewDate',batch.review_date,'expirationLabel',batch.expires_at,
      'totalLineCount',coalesce((batch.summary_snapshot->>'totalLineCount')::integer,0),
      'actionableCount',coalesce((batch.summary_snapshot->>'actionableCount')::integer,0),
      'inProgressCount',coalesce((batch.summary_snapshot->>'inProgressCount')::integer,0),
      'acknowledgedCount',coalesce((batch.summary_snapshot->>'acknowledgedCount')::integer,0));
    INSERT INTO erp.notification_outbox(id,company_id,notification_type,recipient_destination,recipient_display_name,
      source_aggregate_type,source_aggregate_id,template_version,idempotency_key,payload_fingerprint,template_payload,requires_review_credential)
    VALUES(notification_id,batch.company_id,'CUSTOMER_GROUPED_REVIEW_REQUESTED',address,reviewer->>'name',
      'CUSTOMER_REVIEW_BATCH',batch.id::text,3,identity,
      pg_catalog.encode(extensions.digest(identity||'|'||address||'|CUSTOMER_GROUPED_REVIEW_REQUESTED','sha256'),'hex'),payload,true)
    RETURNING * INTO intent;
    INSERT INTO erp.notification_delivery_envelopes(notification_id,envelope_type,envelope_version,
      ciphertext,nonce,auth_tag,key_version,credential_hash)
    VALUES(intent.id,'GROUPED_CUSTOMER_REVIEW_PATH',1,
      supplied->>'ciphertext',supplied->>'nonce',supplied->>'authTag',1,command->>'credentialHash');
    notification_ids=notification_ids||jsonb_build_array(intent.id);
  END LOOP;
  RETURN generated||jsonb_build_object('value',(generated->'value')||jsonb_build_object('notificationIntentIds',notification_ids));
END $$;

-- Historical one-recipient issuance must fail closed after this migration.
CREATE OR REPLACE FUNCTION erp.trusted_prepare_grouped_customer_review_delivery(command jsonb)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=erp,auth,pg_catalog AS $$
  SELECT jsonb_build_object('success',false,'code','PROJECT_REVIEW_DELIVERY_REQUIRED')
$$;
CREATE OR REPLACE FUNCTION erp.trusted_issue_customer_review_batch(command jsonb)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=erp,auth,pg_catalog AS $$
  SELECT jsonb_build_object('success',false,'code','PROJECT_REVIEW_DELIVERY_REQUIRED')
$$;

ALTER FUNCTION erp.read_project_review_delivery_recipients(text,uuid,boolean) OWNER TO postgres;
ALTER FUNCTION erp.trusted_prepare_project_grouped_review_delivery(jsonb) OWNER TO postgres;
ALTER FUNCTION erp.trusted_prepare_grouped_customer_review_delivery(jsonb) OWNER TO postgres;
ALTER FUNCTION erp.trusted_issue_customer_review_batch(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.read_project_review_delivery_recipients(text,uuid,boolean),
  erp.trusted_prepare_project_grouped_review_delivery(jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION erp.read_project_review_delivery_recipients(text,uuid,boolean),
  erp.trusted_prepare_project_grouped_review_delivery(jsonb) TO service_role;
COMMIT;
