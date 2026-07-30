BEGIN;
SET search_path TO erp, pg_catalog;

CREATE FUNCTION trusted_reissue_review_notification(
  review_kind text,
  old_request_id uuid,
  reason text,
  command jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER SET search_path=erp,auth,pg_catalog
AS $$
DECLARE
  tenant text=current_company_id();
  failed_intent notification_outbox;
  old_request record;
  result jsonb;
BEGIN
  IF tenant IS NULL THEN
    RETURN jsonb_build_object('success',false,'code','UNAUTHENTICATED');
  END IF;
  IF review_kind NOT IN('customer','manager')
    OR old_request_id IS NULL
    OR reason IS NULL
    OR length(btrim(reason)) NOT BETWEEN 10 AND 500
    OR jsonb_typeof(command)<>'object'
  THEN
    RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED');
  END IF;

  SELECT * INTO failed_intent
  FROM notification_outbox
  WHERE company_id=tenant
    AND review_request_id=old_request_id
    AND requires_review_credential
  FOR UPDATE;
  IF failed_intent.id IS NULL OR failed_intent.status<>'FailedCredentialLost' THEN
    RETURN jsonb_build_object('success',false,'code','REISSUANCE_NOT_ALLOWED');
  END IF;

  IF review_kind='customer' THEN
    SELECT * INTO old_request
    FROM customer_review_requests
    WHERE id=old_request_id
    FOR UPDATE;
  ELSE
    SELECT * INTO old_request
    FROM manager_review_requests
    WHERE id=old_request_id
    FOR UPDATE;
  END IF;

  IF old_request.id IS NULL
    OR old_request.company_id IS DISTINCT FROM tenant
    OR old_request.status<>'Pending'
    OR command->>'revisionId' IS DISTINCT FROM old_request.revision_id
  THEN
    RETURN jsonb_build_object('success',false,'code','REISSUANCE_NOT_ALLOWED');
  END IF;

  result=CASE review_kind
    WHEN 'customer' THEN trusted_issue_customer_review(command)
    ELSE trusted_issue_manager_review(command)
  END;
  IF result->>'success'<>'true' OR result->>'disposition'<>'ACCEPTED' THEN
    RETURN result;
  END IF;

  IF review_kind='customer' THEN
    IF NOT EXISTS(
      SELECT 1 FROM customer_review_requests
      WHERE id=old_request_id AND company_id=tenant AND status='Superseded'
    ) THEN RAISE EXCEPTION 'controlled customer reissuance did not supersede source'
      USING ERRCODE='23514'; END IF;
  ELSE
    IF NOT EXISTS(
      SELECT 1 FROM manager_review_requests
      WHERE id=old_request_id AND company_id=tenant AND status='Superseded'
    ) THEN RAISE EXCEPTION 'controlled manager reissuance did not supersede source'
      USING ERRCODE='23514'; END IF;
  END IF;

  INSERT INTO audit_log(
    id,company_id,aggregate_type,aggregate_id,action,actor_id,
    occurred_at,correlation_id,new_values
  ) VALUES(
    extensions.gen_random_uuid()::text,tenant,
    upper(review_kind)||'_REVIEW',old_request_id::text,'CONTROLLED_REISSUE',
    auth.uid()::text,clock_timestamp(),command->>'commandId',
    jsonb_build_object('reason',btrim(reason),'reviewKind',review_kind)
  );
  RETURN result;
EXCEPTION WHEN invalid_text_representation THEN
  RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED');
END $$;

REVOKE ALL ON FUNCTION trusted_reissue_review_notification(text,uuid,text,jsonb)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION trusted_reissue_review_notification(text,uuid,text,jsonb)
  TO authenticated;

COMMIT;
