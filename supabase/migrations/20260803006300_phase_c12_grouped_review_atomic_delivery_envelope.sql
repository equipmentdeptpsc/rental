BEGIN;
SET search_path=erp,auth,pg_catalog;

CREATE TABLE erp.notification_delivery_envelopes (
  notification_id uuid PRIMARY KEY REFERENCES erp.notification_outbox(id) ON DELETE CASCADE,
  envelope_type text NOT NULL CHECK(envelope_type='GROUPED_CUSTOMER_REVIEW_PATH'),
  envelope_version integer NOT NULL CHECK(envelope_version=1),
  ciphertext text CHECK(ciphertext IS NULL OR length(ciphertext) BETWEEN 24 AND 2048),
  nonce text CHECK(nonce IS NULL OR length(nonce)=16),
  auth_tag text CHECK(auth_tag IS NULL OR length(auth_tag)=24),
  key_version integer NOT NULL CHECK(key_version=1),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  retired_at timestamptz,
  CONSTRAINT notification_delivery_envelope_active_material CHECK(
    (retired_at IS NULL AND ciphertext IS NOT NULL AND nonce IS NOT NULL AND auth_tag IS NOT NULL)
    OR (retired_at IS NOT NULL AND ciphertext IS NULL AND nonce IS NULL AND auth_tag IS NULL)
  )
);
ALTER TABLE erp.notification_delivery_envelopes OWNER TO postgres;
ALTER TABLE erp.notification_delivery_envelopes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON erp.notification_delivery_envelopes FROM PUBLIC,anon,authenticated,service_role;

-- Forward-refactor the certified 05900 implementation without copying its business logic.
-- The public wrapper still generates and returns one 256-bit credential. The internal path
-- supplies only a validated SHA-256 hash and therefore returns no raw credential.
DO $$
DECLARE definition text;
BEGIN
  SELECT pg_get_functiondef('erp.command_generate_customer_review_batch(jsonb)'::regprocedure) INTO definition;
  definition:=replace(definition,
    'raw_credential text; raw_request_token text;',
    'raw_credential text; supplied_hash text; raw_request_token text;');
  definition:=replace(definition,
    'raw_credential=pg_catalog.encode(extensions.gen_random_bytes(32),''hex'');',
    'supplied_hash=nullif(current_setting(''erp.grouped_review_credential_hash'',true),''''); raw_credential=CASE WHEN supplied_hash IS NULL THEN pg_catalog.encode(extensions.gen_random_bytes(32),''hex'') END;');
  definition:=replace(definition,
    'pg_catalog.encode(extensions.digest(raw_credential,''sha256''),''hex''),now_at+interval ''7 days'',''{}''::jsonb)',
    'coalesce(supplied_hash,pg_catalog.encode(extensions.digest(raw_credential,''sha256''),''hex'')),now_at+interval ''7 days'',''{}''::jsonb)');
  definition:=replace(definition,
    'RETURN safe_response||jsonb_build_object(''value'',(safe_response->''value'')||jsonb_build_object(''credential'',raw_credential));',
    'RETURN CASE WHEN supplied_hash IS NULL THEN safe_response||jsonb_build_object(''value'',(safe_response->''value'')||jsonb_build_object(''credential'',raw_credential)) ELSE safe_response END;');
  IF definition NOT LIKE '%supplied_hash=nullif(current_setting(%'
    OR definition NOT LIKE '%CASE WHEN supplied_hash IS NULL THEN safe_response%'
  THEN RAISE EXCEPTION '06300 could not refactor the certified 05900 definition' USING ERRCODE='55000'; END IF;
  EXECUTE definition;
END $$;

CREATE FUNCTION erp.internal_generate_customer_review_batch(command jsonb,credential_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,auth,pg_catalog AS $$
BEGIN
  IF credential_hash IS NULL OR credential_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invalid grouped review credential hash' USING ERRCODE='22023';
  END IF;
  IF EXISTS(SELECT 1 FROM erp.customer_review_batches WHERE customer_review_batches.credential_hash=internal_generate_customer_review_batch.credential_hash) THEN
    RAISE EXCEPTION 'grouped review credential hash collision' USING ERRCODE='23505';
  END IF;
  PERFORM pg_catalog.set_config('erp.grouped_review_credential_hash',credential_hash,true);
  RETURN erp.command_generate_customer_review_batch(command);
END $$;

CREATE FUNCTION erp.trusted_prepare_grouped_customer_review_delivery(command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,auth,pg_catalog AS $$
DECLARE generated jsonb; canonical_command jsonb; actor_id uuid; notification_id uuid;
  batch_record erp.customer_review_batches; rental_record erp.rentals; intent_record erp.notification_outbox;
  identity text; payload jsonb; recipient_name text; recipient_destination text;
BEGIN
  IF auth.role()<>'service_role' OR jsonb_typeof(command)<>'object' OR EXISTS(
    SELECT 1 FROM jsonb_object_keys(command) key WHERE key NOT IN(
      'commandId','idempotencyKey','rentalId','businessDate','actorId','notificationId','credentialHash',
      'envelopeType','envelopeVersion','keyVersion','ciphertext','nonce','authTag'))
    OR coalesce(command->>'credentialHash','') !~ '^[0-9a-f]{64}$'
    OR command->>'envelopeType'<>'GROUPED_CUSTOMER_REVIEW_PATH'
    OR command->>'envelopeVersion'<>'1' OR command->>'keyVersion'<>'1'
    OR coalesce(command->>'ciphertext','') !~ '^[A-Za-z0-9+/]+={0,2}$'
    OR coalesce(command->>'nonce','') !~ '^[A-Za-z0-9+/]{16}$'
    OR coalesce(command->>'authTag','') !~ '^[A-Za-z0-9+/]{22}==$'
  THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;
  BEGIN actor_id=(command->>'actorId')::uuid; notification_id=(command->>'notificationId')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END;
  IF NOT EXISTS(SELECT 1 FROM erp.users WHERE id=actor_id AND status='active') THEN
    RETURN jsonb_build_object('success',false,'code','FORBIDDEN'); END IF;
  PERFORM pg_catalog.set_config('request.jwt.claim.sub',actor_id::text,true);
  canonical_command=jsonb_build_object('commandId',command->>'commandId','idempotencyKey',command->>'idempotencyKey',
    'rentalId',command->>'rentalId','businessDate',command->>'businessDate');
  generated:=erp.internal_generate_customer_review_batch(canonical_command,command->>'credentialHash');
  IF generated->>'success'<>'true' OR generated->>'disposition'<>'CREATED' THEN RETURN generated; END IF;
  IF coalesce((generated#>>'{value,actionableCount}')::integer,0)=0 THEN
    RETURN jsonb_set(generated,'{disposition}',to_jsonb('NO_ACTIONABLE_ITEMS'::text),true); END IF;
  SELECT * INTO batch_record FROM erp.customer_review_batches WHERE id=(generated#>>'{value,batchId}')::uuid
    AND credential_hash=command->>'credentialHash' AND finalized_at IS NOT NULL
    AND superseded_at IS NULL AND superseded_by_batch_id IS NULL AND expires_at>clock_timestamp() FOR UPDATE;
  IF batch_record.id IS NULL THEN RAISE EXCEPTION 'generated grouped review batch is unavailable' USING ERRCODE='55000'; END IF;
  SELECT * INTO rental_record FROM erp.rentals WHERE company_id=batch_record.company_id AND id=batch_record.rental_id
    AND customer_id=batch_record.customer_id AND project_id=batch_record.project_id;
  recipient_name=btrim(coalesce(rental_record.customer_review_name_snapshot,''));
  recipient_destination=lower(btrim(coalesce(rental_record.customer_review_email_snapshot,'')));
  IF rental_record.id IS NULL OR length(recipient_name) NOT BETWEEN 1 AND 200
    OR recipient_destination !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    OR recipient_name ~ '[\r\n]' OR recipient_destination ~ '[\r\n]'
  THEN RAISE EXCEPTION 'Rental Customer Review recipient snapshot unavailable' USING ERRCODE='55000'; END IF;
  identity='customer-grouped-review:'||batch_record.id::text||':v1';
  payload=jsonb_build_object('recipientName',recipient_name,'companyName',batch_record.summary_snapshot->>'company',
    'customerName',batch_record.summary_snapshot->>'customer','projectName',batch_record.summary_snapshot->>'project',
    'rentalReference',batch_record.summary_snapshot->>'rental','reviewDate',batch_record.review_date,'expirationLabel',batch_record.expires_at,
    'totalLineCount',coalesce((batch_record.summary_snapshot->>'totalLineCount')::integer,0),
    'actionableCount',coalesce((batch_record.summary_snapshot->>'actionableCount')::integer,0),
    'inProgressCount',coalesce((batch_record.summary_snapshot->>'inProgressCount')::integer,0),
    'acknowledgedCount',coalesce((batch_record.summary_snapshot->>'acknowledgedCount')::integer,0),
    'correctionRequestedCount',coalesce((batch_record.summary_snapshot->>'correctionRequestedCount')::integer,0));
  INSERT INTO erp.notification_outbox(id,company_id,notification_type,recipient_destination,recipient_display_name,
    source_aggregate_type,source_aggregate_id,template_version,idempotency_key,payload_fingerprint,template_payload,requires_review_credential)
  VALUES(notification_id,batch_record.company_id,'CUSTOMER_GROUPED_REVIEW_REQUESTED',recipient_destination,recipient_name,
    'CUSTOMER_REVIEW_BATCH',batch_record.id::text,3,identity,
    pg_catalog.encode(extensions.digest(identity||'|'||recipient_destination||'|CUSTOMER_GROUPED_REVIEW_REQUESTED','sha256'),'hex'),payload,true)
  RETURNING * INTO intent_record;
  INSERT INTO erp.notification_delivery_envelopes(notification_id,envelope_type,envelope_version,ciphertext,nonce,auth_tag,key_version)
  VALUES(intent_record.id,command->>'envelopeType',(command->>'envelopeVersion')::integer,command->>'ciphertext',
    command->>'nonce',command->>'authTag',(command->>'keyVersion')::integer);
  RETURN generated||jsonb_build_object('value',(generated->'value')||jsonb_build_object('notificationIntentId',intent_record.id));
END $$;

CREATE FUNCTION erp.get_grouped_review_delivery_envelope(notification_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=erp,pg_catalog AS $$
  SELECT CASE WHEN e.notification_id IS NULL THEN jsonb_build_object('success',false,'code','NOT_FOUND')
    ELSE jsonb_build_object('success',true,'value',jsonb_build_object('envelopeType',e.envelope_type,
      'envelopeVersion',e.envelope_version,'keyVersion',e.key_version,'ciphertext',e.ciphertext,'nonce',e.nonce,'authTag',e.auth_tag)) END
  FROM (SELECT * FROM erp.notification_delivery_envelopes WHERE notification_id=get_grouped_review_delivery_envelope.notification_id
    AND retired_at IS NULL) e
$$;

CREATE OR REPLACE FUNCTION erp.claim_notification_delivery_batch(worker_id uuid,batch_size integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,pg_catalog AS $$
DECLARE ids uuid[]; item_id uuid; values jsonb='[]'::jsonb;
BEGIN
  IF batch_size NOT BETWEEN 1 AND 50 THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;
  UPDATE notification_outbox SET status='Failed',claimed_by=NULL,claimed_at=NULL,lease_expires_at=NULL,
    last_failure_category='TemporaryProviderFailure',updated_at=clock_timestamp()
  WHERE status='Processing' AND lease_expires_at<clock_timestamp()
    AND (NOT requires_review_credential OR EXISTS(SELECT 1 FROM notification_delivery_envelopes e WHERE e.notification_id=notification_outbox.id AND e.retired_at IS NULL));
  SELECT array_agg(id) INTO ids FROM (SELECT id FROM notification_outbox
    WHERE status IN('Pending','Failed') AND available_at<=clock_timestamp() AND attempt_count<5
      AND (NOT requires_review_credential OR EXISTS(SELECT 1 FROM notification_delivery_envelopes e WHERE e.notification_id=notification_outbox.id AND e.retired_at IS NULL))
    ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT batch_size) candidates;
  FOREACH item_id IN ARRAY coalesce(ids,ARRAY[]::uuid[]) LOOP
    values=values||jsonb_build_array(claim_notification_delivery(item_id,worker_id)->'value');
    UPDATE notification_outbox SET lease_expires_at=clock_timestamp()+interval '2 minutes' WHERE id=item_id AND claimed_by=worker_id;
  END LOOP;
  RETURN jsonb_build_object('success',true,'value',values);
END $$;

CREATE OR REPLACE FUNCTION erp.complete_notification_delivery(command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,pg_catalog AS $$
DECLARE item notification_outbox; now_at timestamptz=clock_timestamp(); next_status text; retry_seconds integer;
BEGIN
  SELECT * INTO item FROM notification_outbox WHERE id=(command->>'id')::uuid FOR UPDATE;
  IF item.id IS NULL OR item.status<>'Processing' OR item.claimed_by IS DISTINCT FROM (command->>'workerId')::uuid
  THEN RETURN jsonb_build_object('success',false,'code','INVALID_TRANSITION'); END IF;
  next_status=command->>'status';
  IF next_status NOT IN('ProviderAccepted','Failed','UnknownOutcome','FailedCredentialLost','DeadLetter','Cancelled','Superseded')
  THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;
  IF next_status='ProviderAccepted' THEN UPDATE notification_outbox SET status=next_status,provider_name=command->>'providerName',
    provider_message_id=command->>'providerMessageId',sent_at=now_at,updated_at=now_at,lease_expires_at=NULL WHERE id=item.id;
  ELSE retry_seconds=greatest(1,least(coalesce((command->>'retryAfterSeconds')::integer,60),3600));
    UPDATE notification_outbox SET status=next_status,last_failure_category=command->>'failureCategory',
      available_at=CASE WHEN next_status='Failed' THEN now_at+make_interval(secs=>retry_seconds) ELSE available_at END,
      updated_at=now_at,lease_expires_at=NULL WHERE id=item.id; END IF;
  UPDATE notification_delivery_attempts SET status=next_status,provider_name=command->>'providerName',
    provider_message_id=command->>'providerMessageId',failure_category=command->>'failureCategory',completed_at=now_at,
    duration_ms=greatest(0,extract(epoch FROM(now_at-started_at))*1000)::integer
    WHERE notification_id=item.id AND attempt_number=item.attempt_count;
  IF next_status IN('ProviderAccepted','FailedCredentialLost','DeadLetter','Cancelled','Superseded') THEN
    UPDATE notification_delivery_envelopes SET ciphertext=NULL,nonce=NULL,auth_tag=NULL,retired_at=now_at
      WHERE notification_id=item.id AND retired_at IS NULL; END IF;
  RETURN jsonb_build_object('success',true,'disposition','RECORDED');
EXCEPTION WHEN invalid_text_representation THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED');
END $$;

-- Preserve the exact certified cleanup API and add the child table in FK order.
DO $$ DECLARE definition text; BEGIN
  SELECT pg_get_functiondef('erp.cleanup_c12_grouped_customer_review_fixture(text,text,text)'::regprocedure) INTO definition;
  definition:=replace(definition,'DELETE FROM notification_outbox WHERE company_id=target_tenant_id;',
    'DELETE FROM notification_delivery_envelopes e USING notification_outbox n WHERE e.notification_id=n.id AND n.company_id=target_tenant_id; DELETE FROM notification_outbox WHERE company_id=target_tenant_id;');
  IF definition NOT LIKE '%DELETE FROM notification_delivery_envelopes e USING notification_outbox n%' THEN
    RAISE EXCEPTION '06300 cleanup expansion did not match certified definition' USING ERRCODE='55000'; END IF;
  EXECUTE definition;
END $$;

ALTER FUNCTION erp.internal_generate_customer_review_batch(jsonb,text) OWNER TO postgres;
ALTER FUNCTION erp.trusted_prepare_grouped_customer_review_delivery(jsonb) OWNER TO postgres;
ALTER FUNCTION erp.get_grouped_review_delivery_envelope(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.internal_generate_customer_review_batch(jsonb,text),
  erp.trusted_prepare_grouped_customer_review_delivery(jsonb),erp.get_grouped_review_delivery_envelope(uuid)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION erp.trusted_prepare_grouped_customer_review_delivery(jsonb),
  erp.get_grouped_review_delivery_envelope(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION erp.claim_notification_delivery_batch(uuid,integer),erp.complete_notification_delivery(jsonb) TO service_role;
COMMENT ON TABLE erp.notification_delivery_envelopes IS 'Server-encrypted retry material only; plaintext credentials, paths, and encryption keys are prohibited.';
COMMIT;
