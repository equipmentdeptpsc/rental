BEGIN;
SET search_path=erp,auth,pg_catalog;

DROP INDEX erp.uq_customer_grouped_review_notification_per_batch;
CREATE UNIQUE INDEX uq_customer_grouped_review_live_notification_per_batch
  ON erp.notification_outbox(company_id,source_aggregate_id)
  WHERE notification_type='CUSTOMER_GROUPED_REVIEW_REQUESTED'
    AND source_aggregate_type='CUSTOMER_REVIEW_BATCH'
    AND status NOT IN('DeadLetter','FailedCredentialLost','Cancelled','Superseded');

CREATE FUNCTION erp.trusted_reissue_grouped_review_deadletter(command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,auth,pg_catalog AS $$
DECLARE old_intent erp.notification_outbox; batch erp.customer_review_batches; new_id uuid; identity text;
BEGIN
  IF auth.role()<>'service_role' OR jsonb_typeof(command)<>'object' OR EXISTS(
    SELECT 1 FROM jsonb_object_keys(command) key WHERE key NOT IN(
      'commandId','oldNotificationId','notificationId','credentialHash','envelopeType','envelopeVersion','keyVersion','ciphertext','nonce','authTag'))
    OR coalesce(command->>'credentialHash','') !~ '^[0-9a-f]{64}$'
    OR command->>'envelopeType'<>'GROUPED_CUSTOMER_REVIEW_PATH' OR command->>'envelopeVersion'<>'1' OR command->>'keyVersion'<>'1'
    OR coalesce(command->>'ciphertext','') !~ '^[A-Za-z0-9+/]+={0,2}$' OR coalesce(command->>'nonce','') !~ '^[A-Za-z0-9+/]{16}$'
    OR coalesce(command->>'authTag','') !~ '^[A-Za-z0-9+/]{22}==$'
  THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;
  BEGIN new_id=(command->>'notificationId')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END;
  SELECT * INTO old_intent FROM erp.notification_outbox WHERE id=(command->>'oldNotificationId')::uuid FOR UPDATE;
  IF old_intent.id IS NULL OR old_intent.company_id<>'TENANT-LOCAL-001' OR old_intent.status<>'DeadLetter'
    OR old_intent.last_failure_category<>'AuthenticationFailure' OR old_intent.notification_type<>'CUSTOMER_GROUPED_REVIEW_REQUESTED'
    OR old_intent.source_aggregate_type<>'CUSTOMER_REVIEW_BATCH' OR old_intent.provider_message_id IS NOT NULL
  THEN RETURN jsonb_build_object('success',false,'code','REISSUANCE_NOT_ALLOWED'); END IF;
  SELECT * INTO batch FROM erp.customer_review_batches WHERE id=old_intent.source_aggregate_id::uuid AND company_id=old_intent.company_id FOR UPDATE;
  IF batch.id IS NULL OR batch.finalized_at IS NULL OR batch.superseded_at IS NOT NULL OR batch.expires_at<=clock_timestamp()
    OR (SELECT count(*) FROM erp.customer_review_batch_items WHERE batch_id=batch.id)<>1
    OR EXISTS(SELECT 1 FROM erp.notification_outbox WHERE company_id=batch.company_id AND source_aggregate_id=batch.id::text AND status='ProviderAccepted')
  THEN RETURN jsonb_build_object('success',false,'code','REISSUANCE_NOT_ALLOWED'); END IF;
  identity='customer-grouped-review:'||batch.id::text||':reissue:'||old_intent.id::text;
  IF EXISTS(SELECT 1 FROM erp.notification_outbox WHERE company_id=batch.company_id AND idempotency_key=identity) THEN
    RETURN jsonb_build_object('success',true,'disposition','REPLAYED','value',jsonb_build_object('notificationIntentId',(SELECT id FROM erp.notification_outbox WHERE company_id=batch.company_id AND idempotency_key=identity)));
  END IF;
  PERFORM pg_catalog.set_config('erp.grouped_review_deadletter_reissue',batch.id::text,true);
  UPDATE erp.customer_review_batches SET credential_hash=command->>'credentialHash',row_version=row_version+1 WHERE id=batch.id;
  INSERT INTO erp.notification_outbox(id,company_id,notification_type,recipient_destination,recipient_display_name,source_aggregate_type,source_aggregate_id,
    template_version,idempotency_key,payload_fingerprint,template_payload,requires_review_credential)
  VALUES(new_id,old_intent.company_id,old_intent.notification_type,old_intent.recipient_destination,old_intent.recipient_display_name,
    old_intent.source_aggregate_type,old_intent.source_aggregate_id,old_intent.template_version,identity,
    pg_catalog.encode(extensions.digest(identity||'|'||old_intent.recipient_destination||'|'||old_intent.notification_type,'sha256'),'hex'),old_intent.template_payload,true);
  INSERT INTO erp.notification_delivery_envelopes(notification_id,envelope_type,envelope_version,ciphertext,nonce,auth_tag,key_version)
  VALUES(new_id,command->>'envelopeType',1,command->>'ciphertext',command->>'nonce',command->>'authTag',1);
  INSERT INTO erp.audit_log(id,company_id,aggregate_type,aggregate_id,action,actor_id,occurred_at,correlation_id,new_values)
  VALUES(extensions.gen_random_uuid()::text,batch.company_id,'CUSTOMER_REVIEW_BATCH',batch.id::text,'GROUPED_REVIEW_DEADLETTER_REISSUED',NULL,clock_timestamp(),command->>'commandId',
    jsonb_build_object('oldNotificationId',old_intent.id,'newNotificationId',new_id,'reason','AuthenticationFailure'));
  RETURN jsonb_build_object('success',true,'disposition','CREATED','value',jsonb_build_object('notificationIntentId',new_id));
EXCEPTION WHEN invalid_text_representation OR unique_violation THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED');
END $$;

CREATE OR REPLACE FUNCTION erp.reject_finalized_customer_review_batch_change()
RETURNS trigger LANGUAGE plpgsql SET search_path=erp,pg_catalog AS $$
DECLARE database_owner name;
BEGIN
  IF current_setting('erp.grouped_review_deadletter_reissue',true)=OLD.id::text
    AND NEW.credential_hash IS DISTINCT FROM OLD.credential_hash AND NEW.row_version=OLD.row_version+1
    AND (to_jsonb(NEW)-'credential_hash'-'row_version')=(to_jsonb(OLD)-'credential_hash'-'row_version') THEN RETURN NEW; END IF;
  SELECT pg_get_userbyid(datdba) INTO database_owner FROM pg_database WHERE datname=current_database();
  IF session_user=database_owner AND current_user=database_owner AND current_setting('erp.c12_grouped_expiry_certification',true)='TENANT-UAT-C12-GROUPED-CUSTOMER-001'
    AND OLD.company_id='TENANT-UAT-C12-GROUPED-CUSTOMER-001' AND NEW.expires_at IS DISTINCT FROM OLD.expires_at AND NEW.expires_at>OLD.created_at AND NEW.expires_at<=clock_timestamp()
    AND (to_jsonb(NEW)-'expires_at')=(to_jsonb(OLD)-'expires_at') THEN RETURN NEW; END IF;
  IF OLD.finalized_at IS NOT NULL AND (NEW.company_id IS DISTINCT FROM OLD.company_id OR NEW.customer_id IS DISTINCT FROM OLD.customer_id OR NEW.project_id IS DISTINCT FROM OLD.project_id
    OR NEW.rental_id IS DISTINCT FROM OLD.rental_id OR NEW.review_date IS DISTINCT FROM OLD.review_date OR NEW.business_timezone IS DISTINCT FROM OLD.business_timezone
    OR NEW.credential_hash IS DISTINCT FROM OLD.credential_hash OR NEW.expires_at IS DISTINCT FROM OLD.expires_at OR NEW.summary_snapshot IS DISTINCT FROM OLD.summary_snapshot OR NEW.finalized_at IS DISTINCT FROM OLD.finalized_at)
  THEN RAISE EXCEPTION 'finalized grouped Customer Review batch is immutable' USING ERRCODE='55000'; END IF; RETURN NEW;
END $$;

ALTER FUNCTION erp.trusted_reissue_grouped_review_deadletter(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.trusted_reissue_grouped_review_deadletter(jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION erp.trusted_reissue_grouped_review_deadletter(jsonb) TO service_role;
COMMENT ON FUNCTION erp.trusted_reissue_grouped_review_deadletter(jsonb) IS 'Service-only terminal grouped-review recovery retaining the batch, item, request, and failed delivery evidence while rotating the one usable credential.';

CREATE FUNCTION erp.complete_grouped_review_notification_delivery(command jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,pg_catalog AS $$
DECLARE item erp.notification_outbox;
BEGIN
  SELECT * INTO item FROM erp.notification_outbox WHERE id=(command->>'id')::uuid AND notification_type='CUSTOMER_GROUPED_REVIEW_REQUESTED' FOR UPDATE;
  IF item.id IS NULL OR item.status<>'Processing' OR item.claimed_by IS DISTINCT FROM (command->>'workerId')::uuid
  THEN RETURN jsonb_build_object('success',false,'code','INVALID_TRANSITION'); END IF;
  UPDATE erp.notification_outbox SET uat_override_applied=coalesce((command->>'uatOverrideApplied')::boolean,false) WHERE id=item.id;
  RETURN erp.complete_notification_delivery(command-'uatOverrideApplied');
END $$;
ALTER FUNCTION erp.complete_grouped_review_notification_delivery(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.complete_grouped_review_notification_delivery(jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION erp.complete_grouped_review_notification_delivery(jsonb) TO service_role;
COMMIT;
