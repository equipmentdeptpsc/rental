BEGIN;
SET search_path=erp,auth,pg_catalog;
-- A prepared envelope may rotate the one usable credential for a frozen batch,
-- just as the certified dead-letter reissue path does.  The hash is never
-- returned or logged; it only lets the public review boundary validate the
-- credential carried by the encrypted envelope.
ALTER TABLE erp.notification_delivery_envelopes
  ADD COLUMN IF NOT EXISTS credential_hash text;
ALTER TABLE erp.notification_delivery_envelopes
  DROP CONSTRAINT IF EXISTS notification_delivery_envelopes_credential_hash_check;
ALTER TABLE erp.notification_delivery_envelopes
  ADD CONSTRAINT notification_delivery_envelopes_credential_hash_check
  CHECK (credential_hash IS NULL OR credential_hash ~ '^[0-9a-f]{64}$');
-- Extend the existing certified immutable-batch exception with one explicit,
-- service-only preparation rotation.  All lineage, dates, expiry, summary,
-- and item evidence remain frozen.
CREATE OR REPLACE FUNCTION erp.reject_finalized_customer_review_batch_change()
RETURNS trigger LANGUAGE plpgsql SET search_path=erp,auth,pg_catalog AS $$
DECLARE database_owner name;
BEGIN
  IF current_setting('erp.grouped_review_deadletter_reissue',true)=OLD.id::text
    AND NEW.credential_hash IS DISTINCT FROM OLD.credential_hash AND NEW.row_version=OLD.row_version+1
    AND (to_jsonb(NEW)-'credential_hash'-'row_version')=(to_jsonb(OLD)-'credential_hash'-'row_version') THEN RETURN NEW; END IF;
  IF current_setting('erp.grouped_review_existing_batch_preparation',true)=OLD.id::text
    AND NEW.credential_hash IS DISTINCT FROM OLD.credential_hash AND NEW.row_version=OLD.row_version+1
    AND (to_jsonb(NEW)-'credential_hash'-'row_version')=(to_jsonb(OLD)-'credential_hash'-'row_version') THEN RETURN NEW; END IF;
  SELECT pg_catalog.pg_get_userbyid(datdba) INTO database_owner FROM pg_catalog.pg_database WHERE datname=pg_catalog.current_database();
  IF session_user=database_owner AND current_user=database_owner AND current_setting('erp.c12_grouped_expiry_certification',true)='TENANT-UAT-C12-GROUPED-CUSTOMER-001'
    AND OLD.company_id='TENANT-UAT-C12-GROUPED-CUSTOMER-001' AND NEW.expires_at IS DISTINCT FROM OLD.expires_at AND NEW.expires_at>OLD.created_at AND NEW.expires_at<=clock_timestamp()
    AND (to_jsonb(NEW)-'expires_at')=(to_jsonb(OLD)-'expires_at') THEN RETURN NEW; END IF;
  IF OLD.finalized_at IS NOT NULL AND (NEW.company_id IS DISTINCT FROM OLD.company_id OR NEW.customer_id IS DISTINCT FROM OLD.customer_id OR NEW.project_id IS DISTINCT FROM OLD.project_id
    OR NEW.rental_id IS DISTINCT FROM OLD.rental_id OR NEW.review_date IS DISTINCT FROM OLD.review_date OR NEW.business_timezone IS DISTINCT FROM OLD.business_timezone
    OR NEW.credential_hash IS DISTINCT FROM OLD.credential_hash OR NEW.expires_at IS DISTINCT FROM OLD.expires_at OR NEW.summary_snapshot IS DISTINCT FROM OLD.summary_snapshot OR NEW.finalized_at IS DISTINCT FROM OLD.finalized_at)
  THEN RAISE EXCEPTION 'finalized grouped Customer Review batch is immutable' USING ERRCODE='55000'; END IF; RETURN NEW;
END $$;
CREATE FUNCTION erp.prepare_existing_grouped_customer_review_delivery(command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,auth,pg_catalog AS $$
DECLARE tenant text; actor_id uuid; batch erp.customer_review_batches; rental erp.rentals;
  existing erp.notification_outbox; intent erp.notification_outbox; actionable_count integer; total_count integer;
  envelope_count integer; attempt_count integer; recipient_name text; recipient_destination text; identity text; payload jsonb;
BEGIN
  IF auth.role()<>'service_role' OR jsonb_typeof(command)<>'object' OR EXISTS(
    SELECT 1 FROM jsonb_object_keys(command) key WHERE key NOT IN('commandId','batchId','actorId','notificationId','credentialHash','expectedRecipient','envelopeType','envelopeVersion','keyVersion','ciphertext','nonce','authTag'))
    OR coalesce(command->>'commandId','')='' OR coalesce(command->>'batchId','') !~ '^[0-9a-f-]{36}$'
    OR coalesce(command->>'actorId','') !~ '^[0-9a-f-]{36}$' OR coalesce(command->>'notificationId','') !~ '^[0-9a-f-]{36}$'
    OR coalesce(command->>'credentialHash','') !~ '^[0-9a-f]{64}$' OR lower(btrim(coalesce(command->>'expectedRecipient',''))) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' OR command->>'envelopeType'<>'GROUPED_CUSTOMER_REVIEW_PATH'
    OR command->>'envelopeVersion'<>'1' OR command->>'keyVersion'<>'1'
    OR coalesce(command->>'ciphertext','') !~ '^[A-Za-z0-9+/]+={0,2}$' OR coalesce(command->>'nonce','') !~ '^[A-Za-z0-9+/]{16}$'
    OR coalesce(command->>'authTag','') !~ '^[A-Za-z0-9+/]{22}==$'
  THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;
  actor_id=(command->>'actorId')::uuid;
  PERFORM pg_catalog.set_config('request.jwt.claim.sub',actor_id::text,true);
  tenant=erp.current_company_id();
  IF tenant IS NULL OR NOT erp.current_user_has_permission('deur.review') THEN RETURN jsonb_build_object('success',false,'code','FORBIDDEN'); END IF;
  SELECT * INTO batch FROM erp.customer_review_batches WHERE id=(command->>'batchId')::uuid AND company_id=tenant FOR UPDATE;
  IF batch.id IS NULL THEN RETURN jsonb_build_object('success',false,'code','NOT_FOUND'); END IF;
  IF batch.finalized_at IS NULL THEN RETURN jsonb_build_object('success',false,'code','BATCH_NOT_FINALIZED'); END IF;
  IF batch.retired_no_actionable_at IS NOT NULL THEN RETURN jsonb_build_object('success',false,'code','BATCH_RETIRED'); END IF;
  IF batch.superseded_at IS NOT NULL OR batch.superseded_by_batch_id IS NOT NULL THEN RETURN jsonb_build_object('success',false,'code','BATCH_SUPERSEDED'); END IF;
  IF batch.expires_at<=clock_timestamp() THEN RETURN jsonb_build_object('success',false,'code','BATCH_EXPIRED'); END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(tenant||'|'||batch.id::text||'|existing-grouped-review-preparation',0));

  SELECT * INTO existing FROM erp.notification_outbox WHERE company_id=tenant AND source_aggregate_type='CUSTOMER_REVIEW_BATCH'
    AND source_aggregate_id=batch.id::text AND notification_type='CUSTOMER_GROUPED_REVIEW_REQUESTED'
    AND status NOT IN('DeadLetter','FailedCredentialLost','Cancelled','Superseded') ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
  IF existing.id IS NOT NULL THEN
    SELECT count(*) INTO envelope_count FROM erp.notification_delivery_envelopes WHERE notification_id=existing.id AND retired_at IS NULL;
    SELECT count(*) INTO attempt_count FROM erp.notification_delivery_attempts WHERE notification_id=existing.id;
    IF existing.provider_name IS NOT NULL OR existing.provider_message_id IS NOT NULL OR attempt_count>0 THEN RETURN jsonb_build_object('success',false,'code','ALREADY_SENT'); END IF;
    IF existing.status<>'Pending' OR envelope_count<>1 THEN RETURN jsonb_build_object('success',false,'code','PREPARATION_INTEGRITY'); END IF;
    RETURN jsonb_build_object('success',true,'disposition','EXISTING','value',jsonb_build_object('batchId',batch.id,'notificationIntentId',existing.id,'recipientDestination',existing.recipient_destination,'recipientSource','RENTAL_CUSTOMER_REVIEW_SNAPSHOT','activeEnvelopeCount',envelope_count,'providerAttempts',attempt_count,'sent',false));
  END IF;
  IF EXISTS(SELECT 1 FROM erp.notification_outbox WHERE company_id=tenant AND source_aggregate_type='CUSTOMER_REVIEW_BATCH' AND source_aggregate_id=batch.id::text) THEN
    RETURN jsonb_build_object('success',false,'code','PREPARATION_TERMINAL');
  END IF;

  SELECT count(*) INTO total_count FROM erp.customer_review_batch_items WHERE batch_id=batch.id;
  SELECT count(*) INTO actionable_count FROM erp.customer_review_batch_items item
    JOIN erp.customer_review_requests request ON request.company_id=item.company_id AND request.id=item.customer_review_request_id
    JOIN erp.deurs target ON target.company_id=item.company_id AND target.id=item.revision_id
    WHERE item.batch_id=batch.id AND request.status='Pending' AND request.revoked_at IS NULL AND request.superseded_at IS NULL
      AND request.consumed_at IS NULL AND request.expires_at>clock_timestamp() AND target.status='Submitted'
      AND target.superseded_by_revision_id IS NULL AND target.row_version=request.revision_version
      AND item.deur_id=request.deur_id AND item.revision_id=request.revision_id;
  IF actionable_count<1 THEN RETURN jsonb_build_object('success',false,'code','NO_ACTIONABLE_ITEMS'); END IF;
  IF EXISTS(SELECT 1 FROM erp.billing_statement_lines line WHERE line.company_id=tenant AND line.deur_id IN(SELECT deur_id FROM erp.customer_review_batch_items WHERE batch_id=batch.id AND deur_id IS NOT NULL))
  THEN RETURN jsonb_build_object('success',false,'code','BILLING_STATE_BLOCKED'); END IF;
  SELECT * INTO rental FROM erp.rentals WHERE company_id=tenant AND id=batch.rental_id AND customer_id=batch.customer_id AND project_id=batch.project_id;
  recipient_name=btrim(coalesce(rental.customer_review_name_snapshot,'')); recipient_destination=lower(btrim(coalesce(rental.customer_review_email_snapshot,'')));
  IF rental.id IS NULL OR length(recipient_name) NOT BETWEEN 1 AND 200 OR recipient_destination !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    OR recipient_name ~ '[\r\n]' OR recipient_destination ~ '[\r\n]' THEN RETURN jsonb_build_object('success',false,'code','RECIPIENT_UNAVAILABLE'); END IF;
  IF lower(btrim(command->>'expectedRecipient')) IS DISTINCT FROM recipient_destination THEN RETURN jsonb_build_object('success',false,'code','RECIPIENT_MISMATCH'); END IF;

  identity='customer-grouped-review:'||batch.id::text||':prepared-v1';
  payload=jsonb_build_object('recipientName',recipient_name,'companyName',batch.summary_snapshot->>'company','customerName',batch.summary_snapshot->>'customer',
    'projectName',batch.summary_snapshot->>'project','rentalReference',batch.summary_snapshot->>'rental','reviewDate',batch.review_date,
    'expirationLabel',batch.expires_at,'totalLineCount',total_count,'actionableCount',actionable_count,
    'inProgressCount',coalesce((batch.summary_snapshot->>'inProgressCount')::integer,0),
    'acknowledgedCount',coalesce((batch.summary_snapshot->>'acknowledgedCount')::integer,0));
  PERFORM pg_catalog.set_config('erp.grouped_review_existing_batch_preparation',batch.id::text,true);
  UPDATE erp.customer_review_batches SET credential_hash=command->>'credentialHash',row_version=row_version+1 WHERE id=batch.id;
  INSERT INTO erp.notification_outbox(id,company_id,notification_type,recipient_destination,recipient_display_name,source_aggregate_type,source_aggregate_id,
    template_version,idempotency_key,payload_fingerprint,template_payload,requires_review_credential)
  VALUES((command->>'notificationId')::uuid,tenant,'CUSTOMER_GROUPED_REVIEW_REQUESTED',recipient_destination,recipient_name,'CUSTOMER_REVIEW_BATCH',batch.id::text,3,identity,
    pg_catalog.encode(extensions.digest(identity||'|'||recipient_destination||'|CUSTOMER_GROUPED_REVIEW_REQUESTED','sha256'),'hex'),payload,true) RETURNING * INTO intent;
  INSERT INTO erp.notification_delivery_envelopes(notification_id,envelope_type,envelope_version,ciphertext,nonce,auth_tag,key_version,credential_hash)
  VALUES(intent.id,command->>'envelopeType',1,command->>'ciphertext',command->>'nonce',command->>'authTag',1,command->>'credentialHash');
  INSERT INTO erp.audit_log(id,company_id,aggregate_type,aggregate_id,action,actor_id,actor_name,occurred_at,correlation_id,new_values)
  VALUES(extensions.gen_random_uuid()::text,tenant,'CUSTOMER_REVIEW_BATCH',batch.id::text,'GROUPED_REVIEW_DELIVERY_PREPARED',actor_id,(SELECT display_name FROM erp.users WHERE id=actor_id),clock_timestamp(),command->>'commandId',
    jsonb_build_object('notificationIntentId',intent.id,'recipientSource','RENTAL_CUSTOMER_REVIEW_SNAPSHOT','actionableCount',actionable_count));
  RETURN jsonb_build_object('success',true,'disposition','CREATED','value',jsonb_build_object('batchId',batch.id,'notificationIntentId',intent.id,
    'recipientDestination',recipient_destination,'recipientSource','RENTAL_CUSTOMER_REVIEW_SNAPSHOT','activeEnvelopeCount',1,'providerAttempts',0,'sent',false));
EXCEPTION WHEN unique_violation THEN RETURN jsonb_build_object('success',false,'code','PREPARATION_INTEGRITY');
END $$;
ALTER FUNCTION erp.reject_finalized_customer_review_batch_change() OWNER TO postgres;
ALTER FUNCTION erp.prepare_existing_grouped_customer_review_delivery(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.prepare_existing_grouped_customer_review_delivery(jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION erp.prepare_existing_grouped_customer_review_delivery(jsonb) TO service_role;
COMMENT ON FUNCTION erp.prepare_existing_grouped_customer_review_delivery(jsonb) IS
  'Service-only idempotent preparation for one existing finalized grouped-review batch. Rotates only the frozen credential hash, creates one pending outbox intent and one encrypted envelope, and never invokes a provider.';
COMMIT;
