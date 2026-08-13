BEGIN;
SET search_path=erp,pg_catalog;

CREATE UNIQUE INDEX uq_customer_grouped_review_notification_per_batch
  ON erp.notification_outbox(company_id,source_aggregate_id)
  WHERE notification_type='CUSTOMER_GROUPED_REVIEW_REQUESTED'
    AND source_aggregate_type='CUSTOMER_REVIEW_BATCH';

CREATE FUNCTION erp.trusted_issue_customer_review_batch(command jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=erp,auth,pg_catalog
AS $$
DECLARE
  generated jsonb;
  safe_generated jsonb;
  raw_credential text;
  batch_id uuid;
  batch_record erp.customer_review_batches;
  rental_record erp.rentals;
  intent_record erp.notification_outbox;
  identity text;
  payload jsonb;
  recipient_name text;
  recipient_destination text;
BEGIN
  IF jsonb_typeof(command)<>'object'
    OR nullif(command->>'commandId','') IS NULL
    OR nullif(command->>'idempotencyKey','') IS NULL
    OR nullif(command->>'rentalId','') IS NULL
    OR EXISTS(SELECT 1 FROM jsonb_object_keys(command) key
      WHERE key NOT IN('commandId','idempotencyKey','rentalId','businessDate'))
  THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;

  generated:=erp.command_generate_customer_review_batch(command);
  safe_generated:=generated #- '{value,credential}';
  IF generated->>'success'<>'true' OR generated->>'disposition'<>'CREATED' THEN RETURN safe_generated; END IF;
  IF coalesce((generated#>>'{value,actionableCount}')::integer,0)=0 THEN
    RETURN jsonb_set(safe_generated,'{disposition}',to_jsonb('NO_ACTIONABLE_ITEMS'::text),true);
  END IF;

  raw_credential:=generated#>>'{value,credential}';
  batch_id=(generated#>>'{value,batchId}')::uuid;
  IF raw_credential !~ '^[0-9a-f]{64}$' OR batch_id IS NULL
  THEN RAISE EXCEPTION 'trusted grouped review generation omitted its one-time credential handoff' USING ERRCODE='55000'; END IF;

  SELECT * INTO batch_record FROM erp.customer_review_batches
    WHERE id=batch_id AND credential_hash=pg_catalog.encode(extensions.digest(raw_credential,'sha256'),'hex')
      AND finalized_at IS NOT NULL AND superseded_at IS NULL AND superseded_by_batch_id IS NULL
      AND expires_at>clock_timestamp() FOR UPDATE;
  IF batch_record.id IS NULL THEN RAISE EXCEPTION 'generated grouped review batch is unavailable' USING ERRCODE='55000'; END IF;
  SELECT * INTO rental_record FROM erp.rentals
    WHERE company_id=batch_record.company_id AND id=batch_record.rental_id
      AND customer_id=batch_record.customer_id AND project_id=batch_record.project_id;
  recipient_name:=btrim(coalesce(rental_record.customer_review_name_snapshot,''));
  recipient_destination:=lower(btrim(coalesce(rental_record.customer_review_email_snapshot,'')));
  IF rental_record.id IS NULL OR length(recipient_name) NOT BETWEEN 1 AND 200
    OR recipient_destination !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    OR recipient_name ~ '[\r\n]' OR recipient_destination ~ '[\r\n]'
  THEN RAISE EXCEPTION 'Rental Customer Review recipient snapshot unavailable' USING ERRCODE='55000'; END IF;

  identity:='customer-grouped-review:'||batch_record.id::text||':v1';
  payload:=jsonb_build_object(
    'recipientName',recipient_name,
    'companyName',batch_record.summary_snapshot->>'company',
    'customerName',batch_record.summary_snapshot->>'customer',
    'projectName',batch_record.summary_snapshot->>'project',
    'rentalReference',batch_record.summary_snapshot->>'rental',
    'reviewDate',batch_record.review_date,
    'expirationLabel',batch_record.expires_at,
    'totalLineCount',coalesce((batch_record.summary_snapshot->>'totalLineCount')::integer,0),
    'actionableCount',coalesce((batch_record.summary_snapshot->>'actionableCount')::integer,0),
    'inProgressCount',coalesce((batch_record.summary_snapshot->>'inProgressCount')::integer,0),
    'acknowledgedCount',coalesce((batch_record.summary_snapshot->>'acknowledgedCount')::integer,0),
    'correctionRequestedCount',coalesce((batch_record.summary_snapshot->>'correctionRequestedCount')::integer,0)
  );
  IF payload::text ~* 'credential|tokenHash|credentialHash|companyId|tenantId|batchId'
  THEN RAISE EXCEPTION 'unsafe grouped review notification payload' USING ERRCODE='55000'; END IF;

  INSERT INTO erp.notification_outbox(
    company_id,notification_type,recipient_destination,recipient_display_name,
    source_aggregate_type,source_aggregate_id,template_version,idempotency_key,
    payload_fingerprint,template_payload,requires_review_credential
  ) VALUES(
    batch_record.company_id,'CUSTOMER_GROUPED_REVIEW_REQUESTED',recipient_destination,recipient_name,
    'CUSTOMER_REVIEW_BATCH',batch_record.id::text,3,identity,
    pg_catalog.encode(extensions.digest(identity||'|'||recipient_destination||'|CUSTOMER_GROUPED_REVIEW_REQUESTED','sha256'),'hex'),
    payload,true
  ) ON CONFLICT(company_id,idempotency_key) DO NOTHING;
  SELECT * INTO intent_record FROM erp.notification_outbox
    WHERE company_id=batch_record.company_id AND idempotency_key=identity;
  IF intent_record.id IS NULL OR intent_record.notification_type<>'CUSTOMER_GROUPED_REVIEW_REQUESTED'
    OR intent_record.source_aggregate_id<>batch_record.id::text
  THEN RAISE EXCEPTION 'grouped review notification identity mismatch' USING ERRCODE='55000'; END IF;

  RETURN jsonb_set(safe_generated,'{value,notification}',jsonb_build_object(
    'notificationIntentId',intent_record.id,
    'reviewPath','/review/customer/grouped/'||raw_credential
  ),true) || jsonb_build_object('value',(safe_generated->'value')||jsonb_build_object(
    'notificationIntentId',intent_record.id,
    'notification',jsonb_build_object('reviewPath','/review/customer/grouped/'||raw_credential)
  ));
END;
$$;

ALTER FUNCTION erp.trusted_issue_customer_review_batch(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.trusted_issue_customer_review_batch(jsonb) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION erp.trusted_issue_customer_review_batch(jsonb) TO authenticated;
COMMENT ON FUNCTION erp.trusted_issue_customer_review_batch(jsonb) IS
  'Authenticated tenant-derived grouped generation plus one credential-bearing trusted notification handoff. Recipient and content are server-derived; raw credential is returned once and never persisted.';

-- Expand only the certified grouped fixture provider-attempt guard from zero to
-- one. All existing tenant, cardinality, security, and deletion-order guards remain.
DO $$
DECLARE cleanup_definition text;
BEGIN
  SELECT pg_get_functiondef('erp.cleanup_c12_grouped_customer_review_fixture(text,text,text)'::regprocedure)
    INTO cleanup_definition;
  cleanup_definition:=replace(cleanup_definition,
    '(SELECT count(*) FROM notification_delivery_attempts WHERE company_id=target_tenant_id)>0',
    '(SELECT count(*) FROM notification_delivery_attempts WHERE company_id=target_tenant_id)>1');
  IF cleanup_definition NOT LIKE '%notification_delivery_attempts WHERE company_id=target_tenant_id)>1%'
    OR cleanup_definition NOT LIKE '%customer_review_batches WHERE company_id=target_tenant_id)>2%'
    OR cleanup_definition NOT LIKE '%customer_review_batch_items WHERE company_id=target_tenant_id)>6%'
  THEN RAISE EXCEPTION '06200 cleanup boundary expansion did not match certified definition' USING ERRCODE='55000'; END IF;
  EXECUTE cleanup_definition;
END;
$$;
ALTER FUNCTION erp.cleanup_c12_grouped_customer_review_fixture(text,text,text) OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.cleanup_c12_grouped_customer_review_fixture(text,text,text)
  FROM PUBLIC,anon,authenticated,service_role;

COMMIT;
