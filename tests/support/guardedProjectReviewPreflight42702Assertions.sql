CREATE FUNCTION pg_temp.command(
  actor text DEFAULT 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  batch text DEFAULT '11111111-1111-4111-8111-111111111111',
  notifications jsonb DEFAULT '["33333333-3333-4333-8333-333333333333","44444444-4444-4444-8444-444444444444"]'
) RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object('actorId',actor,'batchId',batch,'deurNumber','DEUR-2026-999999',
    'notificationIds',notifications,'phase','BEFORE_PREPARATION')
$$;
CREATE FUNCTION pg_temp.assert_code(actual jsonb,expected text,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF actual->>'code' IS DISTINCT FROM expected THEN
    RAISE EXCEPTION '%: expected %, received %',label,expected,actual;
  END IF;
END $$;

DO $$
DECLARE result jsonb; before_batch jsonb; after_batch jsonb; before_counts jsonb; after_counts jsonb;
BEGIN
  SELECT to_jsonb(batch) INTO before_batch FROM erp.customer_review_batches batch WHERE id='11111111-1111-4111-8111-111111111111';
  SELECT jsonb_build_object('intents',count(*),'attempts',(SELECT count(*) FROM erp.notification_delivery_attempts),
    'envelopes',(SELECT count(*) FROM erp.notification_delivery_envelopes)) INTO before_counts FROM erp.notification_outbox;
  result=erp.preflight_guarded_project_review_first_delivery(pg_temp.command());
  IF result->>'success'<>'true' OR result->>'disposition'<>'READY'
    OR result#>>'{value,notificationCount}'<>'2' OR result#>>'{value,attemptCount}'<>'0'
    OR result#>>'{value,activeEnvelopeCount}'<>'0' OR result#>>'{value,groupScope}'<>'PROJECT'
    OR result#>>'{value,recipientSnapshotFrozen}'<>'true'
  THEN RAISE EXCEPTION 'Valid preflight failed: %',result; END IF;
  SELECT to_jsonb(batch) INTO after_batch FROM erp.customer_review_batches batch WHERE id='11111111-1111-4111-8111-111111111111';
  SELECT jsonb_build_object('intents',count(*),'attempts',(SELECT count(*) FROM erp.notification_delivery_attempts),
    'envelopes',(SELECT count(*) FROM erp.notification_delivery_envelopes)) INTO after_counts FROM erp.notification_outbox;
  IF before_batch IS DISTINCT FROM after_batch OR before_counts IS DISTINCT FROM after_counts
  THEN RAISE EXCEPTION 'Preflight mutated business data'; END IF;

  PERFORM pg_temp.assert_code(erp.preflight_guarded_project_review_first_delivery(
    pg_temp.command(batch=>'99999999-9999-4999-8999-999999999999')),'BATCH_NOT_ACTIONABLE','mismatched batch');
  PERFORM pg_temp.assert_code(erp.preflight_guarded_project_review_first_delivery(
    pg_temp.command(notifications=>'["33333333-3333-4333-8333-333333333333","55555555-5555-4555-8555-555555555555"]')),
    'NOTIFICATION_MEMBERSHIP_MISMATCH','mismatched notifications');
  PERFORM pg_temp.assert_code(erp.preflight_guarded_project_review_first_delivery(
    pg_temp.command(notifications=>'["33333333-3333-4333-8333-333333333333"]')),'VALIDATION_REJECTED','one notification');
  PERFORM pg_temp.assert_code(erp.preflight_guarded_project_review_first_delivery(
    pg_temp.command(notifications=>'["33333333-3333-4333-8333-333333333333","44444444-4444-4444-8444-444444444444","55555555-5555-4555-8555-555555555555"]')),
    'VALIDATION_REJECTED','three notifications');

  UPDATE erp.notification_outbox SET status='Processing' WHERE id='33333333-3333-4333-8333-333333333333';
  PERFORM pg_temp.assert_code(erp.preflight_guarded_project_review_first_delivery(pg_temp.command()),'NOTIFICATION_NOT_ELIGIBLE','status');
  UPDATE erp.notification_outbox SET status='Pending';
  UPDATE erp.notification_outbox SET attempt_count=1 WHERE id='33333333-3333-4333-8333-333333333333';
  PERFORM pg_temp.assert_code(erp.preflight_guarded_project_review_first_delivery(pg_temp.command()),'NOTIFICATION_NOT_ELIGIBLE','attempt');
  UPDATE erp.notification_outbox SET attempt_count=0;
  UPDATE erp.notification_outbox SET claimed_by='66666666-6666-4666-8666-666666666666',claimed_at=clock_timestamp(),lease_expires_at=clock_timestamp()+interval '1 minute'
    WHERE id='33333333-3333-4333-8333-333333333333';
  PERFORM pg_temp.assert_code(erp.preflight_guarded_project_review_first_delivery(pg_temp.command()),'NOTIFICATION_NOT_ELIGIBLE','lease');
  UPDATE erp.notification_outbox SET claimed_by=NULL,claimed_at=NULL,lease_expires_at=NULL;
  UPDATE erp.notification_outbox SET provider_name='synthetic',provider_message_id='accepted',sent_at=clock_timestamp()
    WHERE id='33333333-3333-4333-8333-333333333333';
  PERFORM pg_temp.assert_code(erp.preflight_guarded_project_review_first_delivery(pg_temp.command()),'NOTIFICATION_NOT_ELIGIBLE','provider evidence');
  UPDATE erp.notification_outbox SET provider_name=NULL,provider_message_id=NULL,sent_at=NULL;
  INSERT INTO erp.notification_delivery_attempts VALUES ('33333333-3333-4333-8333-333333333333');
  PERFORM pg_temp.assert_code(erp.preflight_guarded_project_review_first_delivery(pg_temp.command()),'NOTIFICATION_NOT_ELIGIBLE','attempt row');
  DELETE FROM erp.notification_delivery_attempts;
  INSERT INTO erp.notification_delivery_envelopes VALUES ('33333333-3333-4333-8333-333333333333',NULL);
  PERFORM pg_temp.assert_code(erp.preflight_guarded_project_review_first_delivery(pg_temp.command()),'DELIVERY_ENVELOPE_NOT_EXACT','one envelope');
  DELETE FROM erp.notification_delivery_envelopes;

  PERFORM pg_temp.assert_code(erp.preflight_guarded_project_review_first_delivery(
    pg_temp.command(actor=>'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')),'FORBIDDEN','cross tenant actor');
  DELETE FROM erp.effective_user_permissions WHERE user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  PERFORM pg_temp.assert_code(erp.preflight_guarded_project_review_first_delivery(pg_temp.command()),'FORBIDDEN','unauthorized actor');
  INSERT INTO erp.effective_user_permissions VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','settings.update');
END $$;

SELECT set_config('request.jwt.claim.role','authenticated',false);
SELECT pg_temp.assert_code(erp.preflight_guarded_project_review_first_delivery(pg_temp.command()),'VALIDATION_REJECTED','non-service caller');
SELECT set_config('request.jwt.claim.role','service_role',false);

DO $$
DECLARE definition text; volatility "char"; security_definer boolean; settings text[];
BEGIN
  SELECT p.prosrc,p.provolatile,p.prosecdef,p.proconfig INTO definition,volatility,security_definer,settings
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='erp' AND p.proname='preflight_guarded_project_review_first_delivery';
  IF volatility<>'s' OR NOT security_definer OR settings IS DISTINCT FROM ARRAY['search_path=erp, auth, pg_catalog']
  THEN RAISE EXCEPTION 'Function security/read-only attributes changed'; END IF;
  IF definition ~* E'(^|\n)\\s*(INSERT|UPDATE|DELETE)\\b'
  THEN RAISE EXCEPTION 'Function contains business-data DML'; END IF;
  IF NOT has_function_privilege('service_role','erp.preflight_guarded_project_review_first_delivery(jsonb)','EXECUTE')
    OR has_function_privilege('authenticated','erp.preflight_guarded_project_review_first_delivery(jsonb)','EXECUTE')
    OR has_function_privilege('anon','erp.preflight_guarded_project_review_first_delivery(jsonb)','EXECUTE')
  THEN RAISE EXCEPTION 'Function grants changed'; END IF;
END $$;

SELECT 'guarded Project Review preflight SQL regression passed' AS result;
