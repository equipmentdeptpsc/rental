BEGIN;
SET search_path TO erp, pg_catalog;

ALTER TABLE notification_outbox
  ADD COLUMN template_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN requires_review_credential boolean NOT NULL DEFAULT false,
  ADD COLUMN lease_expires_at timestamptz;

ALTER TABLE notification_outbox DROP CONSTRAINT notification_outbox_status_check;
ALTER TABLE notification_outbox ADD CONSTRAINT notification_outbox_status_check
  CHECK(status IN(
    'Pending','Processing','ProviderAccepted','Failed','Cancelled','Superseded',
    'UnknownOutcome','FailedCredentialLost','DeadLetter'
  ));
ALTER TABLE notification_delivery_attempts DROP CONSTRAINT notification_delivery_attempts_status_check;
ALTER TABLE notification_delivery_attempts ADD CONSTRAINT notification_delivery_attempts_status_check
  CHECK(status IN(
    'Processing','ProviderAccepted','Failed','Cancelled','Superseded',
    'UnknownOutcome','FailedCredentialLost','DeadLetter'
  ));

CREATE FUNCTION enqueue_customer_review_notification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,pg_catalog AS $$
DECLARE target deurs; company companies; notification_type text; payload jsonb; identity text;
BEGIN
  SELECT * INTO target FROM deurs WHERE id=NEW.revision_id AND company_id=NEW.company_id;
  SELECT * INTO company FROM companies WHERE id=NEW.company_id AND active;
  IF target.id IS NULL OR company.id IS NULL THEN
    RAISE EXCEPTION 'invalid customer notification scope' USING ERRCODE='23503';
  END IF;
  notification_type=CASE WHEN coalesce(target.revision_number,1)>1
    THEN 'CUSTOMER_CORRECTED_REVIEW_REQUESTED' ELSE 'CUSTOMER_REVIEW_REQUESTED' END;
  identity='customer-review:'||NEW.id::text||':v1';
  payload=NEW.snapshot||jsonb_build_object(
    'recipientName',NEW.recipient_name,'companyName',company.name,
    'rentalReference',coalesce(NEW.snapshot->>'rentalReference','Unavailable'),
    'deurNumber',split_part(coalesce(NEW.snapshot->>'submittedRevision',''), ' R', 1),
    'revisionLabel','R'||coalesce(target.revision_number,1)::text,
    'expirationLabel',NEW.expires_at
  );
  INSERT INTO notification_outbox(
    company_id,notification_type,recipient_destination,recipient_display_name,
    source_aggregate_type,source_aggregate_id,review_request_id,deur_revision_reference,
    template_version,idempotency_key,payload_fingerprint,template_payload,
    requires_review_credential
  ) VALUES(
    NEW.company_id,notification_type,lower(NEW.recipient_destination),NEW.recipient_name,
    'CUSTOMER_REVIEW',NEW.id::text,NEW.id,
    coalesce(NEW.snapshot->>'submittedRevision',NEW.revision_id),
    1,identity,pg_catalog.encode(extensions.digest(
      identity||'|'||lower(NEW.recipient_destination)||'|'||notification_type,'sha256'),'hex'),
    payload,true
  ) ON CONFLICT(company_id,idempotency_key) DO NOTHING;
  RETURN NEW;
END $$;

CREATE FUNCTION enqueue_manager_review_notification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,pg_catalog AS $$
DECLARE target deurs; company companies; notification_type text; payload jsonb; identity text;
BEGIN
  SELECT * INTO target FROM deurs WHERE id=NEW.revision_id AND company_id=NEW.company_id;
  SELECT * INTO company FROM companies WHERE id=NEW.company_id AND active;
  IF target.id IS NULL OR company.id IS NULL THEN
    RAISE EXCEPTION 'invalid manager notification scope' USING ERRCODE='23503';
  END IF;
  notification_type=CASE WHEN coalesce(target.revision_number,1)>1
    THEN 'MANAGER_CORRECTED_REVIEW_REQUESTED' ELSE 'MANAGER_REVIEW_REQUESTED' END;
  identity='manager-review:'||NEW.id::text||':v1';
  payload=NEW.snapshot||jsonb_build_object(
    'recipientName',NEW.recipient_name,'companyName',company.name,
    'rentalReference',coalesce(NEW.snapshot->>'rentalReference','Unavailable'),
    'deurNumber',split_part(coalesce(NEW.snapshot->>'submittedRevision',''), ' R', 1),
    'revisionLabel','R'||coalesce(target.revision_number,1)::text,
    'expirationLabel',NEW.expires_at
  );
  INSERT INTO notification_outbox(
    company_id,notification_type,recipient_destination,recipient_display_name,
    source_aggregate_type,source_aggregate_id,review_request_id,deur_revision_reference,
    template_version,idempotency_key,payload_fingerprint,template_payload,
    requires_review_credential
  ) VALUES(
    NEW.company_id,notification_type,lower(NEW.recipient_destination),NEW.recipient_name,
    'MANAGER_REVIEW',NEW.id::text,NEW.id,
    coalesce(NEW.snapshot->>'submittedRevision',NEW.revision_id),
    1,identity,pg_catalog.encode(extensions.digest(
      identity||'|'||lower(NEW.recipient_destination)||'|'||notification_type,'sha256'),'hex'),
    payload,true
  ) ON CONFLICT(company_id,idempotency_key) DO NOTHING;
  RETURN NEW;
END $$;

CREATE FUNCTION enqueue_customer_review_outcome_notification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,pg_catalog AS $$
DECLARE request customer_review_requests; company companies; kind text; identity text; payload jsonb;
BEGIN
  SELECT * INTO request FROM customer_review_requests
    WHERE id=NEW.review_request_id AND company_id=NEW.company_id;
  SELECT * INTO company FROM companies WHERE id=NEW.company_id AND active;
  kind=CASE NEW.action WHEN 'ACKNOWLEDGE' THEN 'CUSTOMER_ACKNOWLEDGED'
    ELSE 'CUSTOMER_CORRECTION_CONFIRMED' END;
  identity='customer-outcome:'||NEW.id::text||':v1';
  payload=request.snapshot||jsonb_build_object(
    'recipientName',request.recipient_name,'companyName',company.name,
    'rentalReference',coalesce(request.snapshot->>'rentalReference','Unavailable'),
    'reason',NEW.customer_reason
  );
  INSERT INTO notification_outbox(
    company_id,notification_type,recipient_destination,recipient_display_name,
    source_aggregate_type,source_aggregate_id,review_request_id,deur_revision_reference,
    template_version,idempotency_key,payload_fingerprint,template_payload
  ) VALUES(
    NEW.company_id,kind,request.recipient_destination,request.recipient_name,
    'CUSTOMER_REVIEW_OUTCOME',NEW.id::text,request.id,
    coalesce(request.snapshot->>'submittedRevision',request.revision_id),
    1,identity,pg_catalog.encode(extensions.digest(
      identity||'|'||request.recipient_destination||'|'||kind,'sha256'),'hex'),payload
  ) ON CONFLICT(company_id,idempotency_key) DO NOTHING;
  RETURN NEW;
END $$;

CREATE FUNCTION enqueue_manager_review_outcome_notification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,pg_catalog AS $$
DECLARE request manager_review_requests; company companies; kind text; identity text; payload jsonb;
BEGIN
  SELECT * INTO request FROM manager_review_requests
    WHERE id=NEW.review_request_id AND company_id=NEW.company_id;
  SELECT * INTO company FROM companies WHERE id=NEW.company_id AND active;
  kind=CASE NEW.action WHEN 'APPROVE' THEN 'MANAGER_APPROVED'
    WHEN 'REJECT' THEN 'MANAGER_REJECTED' ELSE 'MANAGER_CORRECTION_CONFIRMED' END;
  identity='manager-outcome:'||NEW.id::text||':v1';
  payload=request.snapshot||jsonb_build_object(
    'recipientName',request.recipient_name,'companyName',company.name,
    'rentalReference',coalesce(request.snapshot->>'rentalReference','Unavailable'),
    'reason',NEW.reason
  );
  INSERT INTO notification_outbox(
    company_id,notification_type,recipient_destination,recipient_display_name,
    source_aggregate_type,source_aggregate_id,review_request_id,deur_revision_reference,
    template_version,idempotency_key,payload_fingerprint,template_payload
  ) VALUES(
    NEW.company_id,kind,request.recipient_destination,request.recipient_name,
    'MANAGER_REVIEW_OUTCOME',NEW.id::text,request.id,
    coalesce(request.snapshot->>'submittedRevision',request.revision_id),
    1,identity,pg_catalog.encode(extensions.digest(
      identity||'|'||request.recipient_destination||'|'||kind,'sha256'),'hex'),payload
  ) ON CONFLICT(company_id,idempotency_key) DO NOTHING;
  RETURN NEW;
END $$;

CREATE FUNCTION enqueue_correction_work_item_notification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,pg_catalog AS $$
DECLARE recipient users; company companies; kind text; identity text; reason text; review_id uuid;
BEGIN
  SELECT * INTO company FROM companies WHERE id=NEW.company_id AND active;
  IF TG_TABLE_NAME='customer_correction_requests' THEN
    kind='CUSTOMER_CORRECTION_WORK_ITEM'; reason=NEW.customer_reason; review_id=NEW.review_request_id;
  ELSE
    kind='MANAGER_CORRECTION_WORK_ITEM'; reason=NEW.reason; review_id=NEW.review_request_id;
  END IF;
  FOR recipient IN
    SELECT DISTINCT u.* FROM users u
    JOIN user_roles ur ON ur.user_id=u.id
    JOIN role_permissions rp ON rp.role_id=ur.role_id
    JOIN app_permissions p ON p.id=rp.permission_id
    WHERE u.company_id=NEW.company_id AND u.status='active' AND p.code='deur.review'
      AND u.username ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  LOOP
    identity=lower(kind)||':'||NEW.id::text||':'||recipient.id::text||':v1';
    INSERT INTO notification_outbox(
      company_id,notification_type,recipient_destination,recipient_display_name,
      source_aggregate_type,source_aggregate_id,review_request_id,template_version,
      idempotency_key,payload_fingerprint,template_payload
    ) VALUES(
      NEW.company_id,kind,lower(recipient.username),recipient.display_name,
      'CORRECTION_WORK_ITEM',NEW.id::text,review_id,1,identity,
      pg_catalog.encode(extensions.digest(identity||'|'||lower(recipient.username),'sha256'),'hex'),
      jsonb_build_object(
        'recipientName',recipient.display_name,'companyName',company.name,
        'rentalReference','See correction work item','reason',reason
      )
    ) ON CONFLICT(company_id,idempotency_key) DO NOTHING;
  END LOOP;
  RETURN NEW;
END $$;

CREATE TRIGGER customer_review_notification_intent
  AFTER INSERT ON customer_review_requests FOR EACH ROW
  EXECUTE FUNCTION enqueue_customer_review_notification();
CREATE TRIGGER manager_review_notification_intent
  AFTER INSERT ON manager_review_requests FOR EACH ROW
  EXECUTE FUNCTION enqueue_manager_review_notification();
CREATE TRIGGER customer_outcome_notification_intent
  AFTER INSERT ON customer_review_outcomes FOR EACH ROW
  EXECUTE FUNCTION enqueue_customer_review_outcome_notification();
CREATE TRIGGER manager_outcome_notification_intent
  AFTER INSERT ON manager_review_outcomes FOR EACH ROW
  EXECUTE FUNCTION enqueue_manager_review_outcome_notification();
CREATE TRIGGER customer_correction_work_item_notification_intent
  AFTER INSERT ON customer_correction_requests FOR EACH ROW
  EXECUTE FUNCTION enqueue_correction_work_item_notification();
CREATE TRIGGER manager_correction_work_item_notification_intent
  AFTER INSERT ON manager_correction_requests FOR EACH ROW
  EXECUTE FUNCTION enqueue_correction_work_item_notification();

CREATE FUNCTION trusted_issue_customer_review(command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,auth,pg_catalog AS $$
DECLARE result jsonb; request_id uuid; intent_id uuid;
BEGIN
  result=command_create_customer_review_request(command);
  IF result->>'success'<>'true' OR result->>'disposition'='REPLAYED' THEN RETURN result; END IF;
  request_id=(result#>>'{value,requestId}')::uuid;
  SELECT id INTO intent_id FROM notification_outbox
    WHERE review_request_id=request_id AND requires_review_credential;
  RETURN jsonb_set(result,'{value,notificationIntentId}',to_jsonb(intent_id),true);
END $$;

CREATE FUNCTION trusted_issue_manager_review(command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,auth,pg_catalog AS $$
DECLARE result jsonb; raw_path text; request_id uuid; intent_id uuid;
BEGIN
  result=command_create_manager_review_request(command);
  IF result->>'success'<>'true' OR result->>'disposition'='REPLAYED' THEN RETURN result; END IF;
  raw_path=result#>>'{value,notification,reviewPath}';
  SELECT id INTO request_id FROM manager_review_requests
    WHERE token_hash=pg_catalog.encode(extensions.digest(
      split_part(raw_path,'/review/manager/',2),'sha256'),'hex');
  SELECT id INTO intent_id FROM notification_outbox
    WHERE review_request_id=request_id AND requires_review_credential;
  RETURN jsonb_set(result,'{value,notificationIntentId}',to_jsonb(intent_id),true);
END $$;

CREATE FUNCTION get_notification_delivery_intent(notification_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=erp,pg_catalog AS $$
  SELECT CASE WHEN n.id IS NULL THEN jsonb_build_object('success',false,'code','NOT_FOUND')
  ELSE jsonb_build_object('success',true,'value',jsonb_build_object(
    'id',n.id,'companyId',n.company_id,'type',n.notification_type,
    'recipient',jsonb_build_object('destination',n.recipient_destination,'displayName',n.recipient_display_name),
    'sourceAggregateType',n.source_aggregate_type,'sourceAggregateId',n.source_aggregate_id,
    'reviewRequestId',n.review_request_id,'deurRevisionReference',n.deur_revision_reference,
    'templateVersion',n.template_version,'idempotencyKey',n.idempotency_key,
    'input',n.template_payload,'requiresReviewCredential',n.requires_review_credential,
    'attempt',n.attempt_count
  )) END FROM (SELECT * FROM notification_outbox WHERE id=notification_id) n
$$;

CREATE FUNCTION claim_notification_delivery_batch(worker_id uuid,batch_size integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,pg_catalog AS $$
DECLARE ids uuid[]; item_id uuid; values jsonb='[]'::jsonb;
BEGIN
  IF batch_size NOT BETWEEN 1 AND 50 THEN
    RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED');
  END IF;
  UPDATE notification_outbox SET status='Failed',claimed_by=NULL,claimed_at=NULL,lease_expires_at=NULL,
    last_failure_category='TemporaryProviderFailure',updated_at=clock_timestamp()
  WHERE status='Processing' AND lease_expires_at<clock_timestamp()
    AND NOT requires_review_credential;
  SELECT array_agg(id) INTO ids FROM (
    SELECT id FROM notification_outbox
    WHERE status IN('Pending','Failed') AND available_at<=clock_timestamp()
      AND attempt_count<5 AND NOT requires_review_credential
    ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT batch_size
  ) candidates;
  FOREACH item_id IN ARRAY coalesce(ids,ARRAY[]::uuid[]) LOOP
    values=values||jsonb_build_array(claim_notification_delivery(item_id,worker_id)->'value');
    UPDATE notification_outbox SET lease_expires_at=clock_timestamp()+interval '2 minutes'
      WHERE id=item_id AND claimed_by=worker_id;
  END LOOP;
  RETURN jsonb_build_object('success',true,'value',values);
END $$;

CREATE OR REPLACE FUNCTION claim_notification_delivery(notification_id uuid,worker_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,pg_catalog AS $$
DECLARE item notification_outbox;
BEGIN
  SELECT * INTO item FROM notification_outbox WHERE id=notification_id FOR UPDATE SKIP LOCKED;
  IF item.id IS NULL OR item.status NOT IN('Pending','Failed') OR item.available_at>clock_timestamp()
    OR item.attempt_count>=5
  THEN RETURN jsonb_build_object('success',false,'code','NOT_CLAIMED'); END IF;
  IF item.review_request_id IS NOT NULL AND (
    (item.source_aggregate_type='CUSTOMER_REVIEW' AND EXISTS(
      SELECT 1 FROM customer_review_requests r WHERE r.id=item.review_request_id AND r.status='Superseded'))
    OR (item.source_aggregate_type='MANAGER_REVIEW' AND EXISTS(
      SELECT 1 FROM manager_review_requests r WHERE r.id=item.review_request_id AND r.status='Superseded'))
  ) THEN
    UPDATE notification_outbox SET status='Superseded',updated_at=clock_timestamp() WHERE id=item.id;
    RETURN jsonb_build_object('success',false,'code','SUPERSEDED');
  END IF;
  UPDATE notification_outbox SET status='Processing',claimed_at=clock_timestamp(),claimed_by=worker_id,
    lease_expires_at=clock_timestamp()+interval '2 minutes',
    attempt_count=attempt_count+1,updated_at=clock_timestamp() WHERE id=item.id RETURNING * INTO item;
  INSERT INTO notification_delivery_attempts(company_id,notification_id,attempt_number,worker_id,status)
  VALUES(item.company_id,item.id,item.attempt_count,worker_id,'Processing');
  RETURN jsonb_build_object('success',true,'disposition','CLAIMED',
    'value',jsonb_build_object('id',item.id,'attempt',item.attempt_count));
END $$;

CREATE OR REPLACE FUNCTION complete_notification_delivery(command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,pg_catalog AS $$
DECLARE item notification_outbox; now_at timestamptz=clock_timestamp(); next_status text;
  retry_seconds integer;
BEGIN
  SELECT * INTO item FROM notification_outbox WHERE id=(command->>'id')::uuid FOR UPDATE;
  IF item.id IS NULL OR item.status<>'Processing'
    OR item.claimed_by IS DISTINCT FROM (command->>'workerId')::uuid
  THEN RETURN jsonb_build_object('success',false,'code','INVALID_TRANSITION'); END IF;
  next_status=command->>'status';
  IF next_status NOT IN('ProviderAccepted','Failed','UnknownOutcome','FailedCredentialLost','DeadLetter','Cancelled','Superseded')
  THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;
  IF next_status='ProviderAccepted' THEN
    UPDATE notification_outbox SET status=next_status,provider_name=command->>'providerName',
      provider_message_id=command->>'providerMessageId',sent_at=now_at,updated_at=now_at,
      lease_expires_at=NULL WHERE id=item.id;
  ELSE
    retry_seconds=greatest(1,least(coalesce((command->>'retryAfterSeconds')::integer,60),3600));
    UPDATE notification_outbox SET status=next_status,last_failure_category=command->>'failureCategory',
      available_at=CASE WHEN next_status='Failed' THEN now_at+make_interval(secs=>retry_seconds) ELSE available_at END,
      updated_at=now_at,lease_expires_at=NULL WHERE id=item.id;
  END IF;
  UPDATE notification_delivery_attempts SET status=next_status,
    provider_name=command->>'providerName',provider_message_id=command->>'providerMessageId',
    failure_category=command->>'failureCategory',completed_at=now_at,
    duration_ms=greatest(0,extract(epoch FROM(now_at-started_at))*1000)::integer
  WHERE notification_id=item.id AND attempt_number=item.attempt_count;
  RETURN jsonb_build_object('success',true,'disposition','RECORDED');
EXCEPTION WHEN invalid_text_representation THEN
  RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED');
END $$;

REVOKE ALL ON FUNCTION
  enqueue_customer_review_notification(),enqueue_manager_review_notification(),
  enqueue_customer_review_outcome_notification(),enqueue_manager_review_outcome_notification(),
  enqueue_correction_work_item_notification(),trusted_issue_customer_review(jsonb),
  trusted_issue_manager_review(jsonb),get_notification_delivery_intent(uuid),
  claim_notification_delivery_batch(uuid,integer)
FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION trusted_issue_customer_review(jsonb),trusted_issue_manager_review(jsonb)
  TO authenticated;
GRANT EXECUTE ON FUNCTION get_notification_delivery_intent(uuid),
  claim_notification_delivery_batch(uuid,integer)
TO service_role;

COMMIT;
