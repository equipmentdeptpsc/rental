BEGIN;
SET search_path TO erp, pg_catalog;

CREATE TABLE notification_outbox (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  company_id text NOT NULL REFERENCES companies(id),
  notification_type text NOT NULL,
  recipient_destination text NOT NULL CHECK(length(recipient_destination) BETWEEN 3 AND 320),
  recipient_display_name text NOT NULL CHECK(length(recipient_display_name) BETWEEN 1 AND 200),
  source_aggregate_type text NOT NULL,
  source_aggregate_id text NOT NULL,
  review_request_id uuid,
  deur_revision_reference text,
  template_version integer NOT NULL CHECK(template_version > 0),
  idempotency_key text NOT NULL CHECK(length(idempotency_key) BETWEEN 1 AND 200),
  payload_fingerprint text NOT NULL CHECK(length(payload_fingerprint)=64),
  status text NOT NULL DEFAULT 'Pending'
    CHECK(status IN('Pending','Processing','ProviderAccepted','Failed','Cancelled','Superseded')),
  provider_name text,
  provider_message_id text,
  attempt_count integer NOT NULL DEFAULT 0 CHECK(attempt_count BETWEEN 0 AND 20),
  last_failure_category text,
  available_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  claimed_at timestamptz,
  claimed_by uuid,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  sent_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT notification_outbox_idempotency UNIQUE(company_id,idempotency_key),
  CONSTRAINT notification_outbox_provider_state CHECK(
    (status='ProviderAccepted' AND provider_name IS NOT NULL AND provider_message_id IS NOT NULL AND sent_at IS NOT NULL)
    OR status<>'ProviderAccepted'
  )
);

CREATE TABLE notification_delivery_attempts (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  company_id text NOT NULL REFERENCES companies(id),
  notification_id uuid NOT NULL REFERENCES notification_outbox(id),
  attempt_number integer NOT NULL CHECK(attempt_number > 0),
  worker_id uuid NOT NULL,
  status text NOT NULL CHECK(status IN('Processing','ProviderAccepted','Failed','Cancelled','Superseded')),
  provider_name text,
  provider_message_id text,
  failure_category text,
  started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  completed_at timestamptz,
  duration_ms integer CHECK(duration_ms IS NULL OR duration_ms >= 0),
  UNIQUE(notification_id,attempt_number)
);

CREATE INDEX notification_outbox_pending
  ON notification_outbox(status,available_at,created_at) WHERE status IN('Pending','Failed');
CREATE INDEX notification_attempts_notification
  ON notification_delivery_attempts(notification_id,attempt_number);

ALTER TABLE notification_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_delivery_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON notification_outbox,notification_delivery_attempts
  FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION reject_terminal_notification_change()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
  IF OLD.status='ProviderAccepted' AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'provider-accepted notification evidence is immutable' USING ERRCODE='55000';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER notification_terminal_immutable
  BEFORE UPDATE OR DELETE ON notification_outbox
  FOR EACH ROW EXECUTE FUNCTION reject_terminal_notification_change();

CREATE FUNCTION create_notification_intent(command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,pg_catalog AS $$
DECLARE existing notification_outbox; fingerprint text;
BEGIN
  IF jsonb_typeof(command)<>'object' OR EXISTS(
    SELECT 1 FROM jsonb_object_keys(command) key WHERE key NOT IN(
      'id','companyId','notificationType','recipientDestination','recipientDisplayName',
      'sourceAggregateType','sourceAggregateId','reviewRequestId','deurRevisionReference',
      'templateVersion','idempotencyKey','payloadFingerprint'
    )
  ) OR coalesce(command->>'recipientDestination','') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;
  fingerprint=command->>'payloadFingerprint';
  SELECT * INTO existing FROM notification_outbox
    WHERE company_id=command->>'companyId' AND idempotency_key=command->>'idempotencyKey' FOR UPDATE;
  IF existing.id IS NOT NULL THEN
    IF existing.payload_fingerprint IS DISTINCT FROM fingerprint THEN
      RETURN jsonb_build_object('success',false,'code','IDEMPOTENCY_MISMATCH');
    END IF;
    RETURN jsonb_build_object('success',true,'disposition','EXISTS','value',jsonb_build_object('id',existing.id));
  END IF;
  INSERT INTO notification_outbox(
    id,company_id,notification_type,recipient_destination,recipient_display_name,
    source_aggregate_type,source_aggregate_id,review_request_id,deur_revision_reference,
    template_version,idempotency_key,payload_fingerprint
  ) VALUES(
    (command->>'id')::uuid,command->>'companyId',command->>'notificationType',
    lower(command->>'recipientDestination'),command->>'recipientDisplayName',
    command->>'sourceAggregateType',command->>'sourceAggregateId',
    nullif(command->>'reviewRequestId','')::uuid,command->>'deurRevisionReference',
    (command->>'templateVersion')::integer,command->>'idempotencyKey',fingerprint
  ) RETURNING * INTO existing;
  RETURN jsonb_build_object('success',true,'disposition','CREATED','value',jsonb_build_object('id',existing.id));
EXCEPTION WHEN invalid_text_representation OR not_null_violation OR check_violation OR foreign_key_violation THEN
  RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED');
END $$;

CREATE FUNCTION claim_notification_delivery(notification_id uuid,worker_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,pg_catalog AS $$
DECLARE item notification_outbox;
BEGIN
  SELECT * INTO item FROM notification_outbox WHERE id=notification_id FOR UPDATE SKIP LOCKED;
  IF item.id IS NULL OR item.status NOT IN('Pending','Failed') OR item.available_at>clock_timestamp()
    OR item.attempt_count>=5
  THEN RETURN jsonb_build_object('success',false,'code','NOT_CLAIMED'); END IF;
  UPDATE notification_outbox SET status='Processing',claimed_at=clock_timestamp(),claimed_by=worker_id,
    attempt_count=attempt_count+1,updated_at=clock_timestamp() WHERE id=item.id RETURNING * INTO item;
  INSERT INTO notification_delivery_attempts(
    company_id,notification_id,attempt_number,worker_id,status
  ) VALUES(item.company_id,item.id,item.attempt_count,worker_id,'Processing');
  RETURN jsonb_build_object('success',true,'disposition','CLAIMED',
    'value',jsonb_build_object('id',item.id,'attempt',item.attempt_count));
END $$;

CREATE FUNCTION complete_notification_delivery(command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,pg_catalog AS $$
DECLARE item notification_outbox; now_at timestamptz=clock_timestamp();
BEGIN
  SELECT * INTO item FROM notification_outbox WHERE id=(command->>'id')::uuid FOR UPDATE;
  IF item.id IS NULL OR item.status<>'Processing' OR item.claimed_by IS DISTINCT FROM (command->>'workerId')::uuid
  THEN RETURN jsonb_build_object('success',false,'code','INVALID_TRANSITION'); END IF;
  IF command->>'status'='ProviderAccepted' THEN
    UPDATE notification_outbox SET status='ProviderAccepted',provider_name=command->>'providerName',
      provider_message_id=command->>'providerMessageId',sent_at=now_at,updated_at=now_at WHERE id=item.id;
    UPDATE notification_delivery_attempts SET status='ProviderAccepted',
      provider_name=command->>'providerName',provider_message_id=command->>'providerMessageId',
      completed_at=now_at,duration_ms=greatest(0,extract(epoch FROM(now_at-started_at))*1000)::integer
      WHERE notification_id=item.id AND attempt_number=item.attempt_count;
  ELSE
    UPDATE notification_outbox SET status='Failed',last_failure_category=command->>'failureCategory',
      available_at=now_at+interval '1 minute',updated_at=now_at WHERE id=item.id;
    UPDATE notification_delivery_attempts SET status='Failed',failure_category=command->>'failureCategory',
      completed_at=now_at,duration_ms=greatest(0,extract(epoch FROM(now_at-started_at))*1000)::integer
      WHERE notification_id=item.id AND attempt_number=item.attempt_count;
  END IF;
  RETURN jsonb_build_object('success',true,'disposition','RECORDED');
EXCEPTION WHEN invalid_text_representation THEN
  RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED');
END $$;

REVOKE ALL ON FUNCTION
  reject_terminal_notification_change(),create_notification_intent(jsonb),
  claim_notification_delivery(uuid,uuid),complete_notification_delivery(jsonb)
FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION
  create_notification_intent(jsonb),claim_notification_delivery(uuid,uuid),
  complete_notification_delivery(jsonb)
TO service_role;

COMMIT;
