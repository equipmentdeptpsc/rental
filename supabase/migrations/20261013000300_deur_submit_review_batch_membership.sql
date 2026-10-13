BEGIN;
SET LOCAL search_path=erp,auth,extensions,pg_catalog;

-- Submit uses the DEUR's work date (or a correction's resubmission date), not
-- the wall-clock day on which an Operator happened to press Submit. A scoped
-- handoff may generate its own historical work-date batch, but cannot use this
-- exception for another Operator's DEUR or another Rental.
DO $migration$
DECLARE definition text;
  old_guard text := 'IF requested_date<local_today AND NOT erp.current_user_has_permission(''deur.customerReview.issue'') THEN';
  new_guard text := $guard$
  IF requested_date<local_today
    AND current_setting('erp.deur_submit_review_handoff',true)='true'
    AND EXISTS (
      SELECT 1 FROM erp.deurs submit_target
      WHERE submit_target.id=current_setting('erp.deur_submit_target_id',true)
        AND submit_target.company_id=tenant
        AND submit_target.rental_id=rental_record.id
        AND submit_target.status='Submitted'
        AND submit_target.submitted_by=auth.uid()::text
        AND submit_target.work_date=requested_date
    )
  THEN historical_corrected_allowed:=true; END IF;
  IF requested_date<local_today AND NOT historical_corrected_allowed AND NOT erp.current_user_has_permission('deur.customerReview.issue') THEN$guard$;
  old_existing text := 'IF batch.id IS NOT NULL THEN';
  new_existing text := $existing$
  IF batch.id IS NOT NULL
    AND current_setting('erp.deur_submit_review_handoff',true)='true'
    AND EXISTS (
      SELECT 1 FROM erp.deurs submit_target
      WHERE submit_target.id=current_setting('erp.deur_submit_target_id',true)
        AND submit_target.company_id=tenant
        AND submit_target.rental_id=rental_record.id
        AND submit_target.status='Submitted'
        AND submit_target.submitted_by=auth.uid()::text
        AND (submit_target.work_date=requested_date OR
             (submit_target.previous_revision_id IS NOT NULL AND
              (submit_target.submitted_at AT TIME ZONE rental_record.timezone)::date=requested_date))
    )
    AND NOT EXISTS (
      SELECT 1 FROM erp.customer_review_batch_items item
      WHERE item.batch_id=batch.id
        AND item.deur_id=current_setting('erp.deur_submit_target_id',true)
        AND item.customer_review_request_id IS NOT NULL
    )
  THEN
    successor_id:=extensions.gen_random_uuid();
    SET CONSTRAINTS customer_review_batches_superseded_by_fk DEFERRED;
    UPDATE erp.notification_outbox
    SET status='Superseded',updated_at=now_at
    WHERE company_id=tenant AND source_aggregate_type='CUSTOMER_REVIEW_BATCH'
      AND source_aggregate_id=batch.id::text AND status IN ('Pending','Failed');
    UPDATE erp.customer_review_batches
    SET superseded_at=now_at,superseded_by_batch_id=successor_id,row_version=row_version+1
    WHERE id=batch.id;
    batch:=NULL;
  END IF;
  IF batch.id IS NOT NULL THEN$existing$;
BEGIN
  SELECT pg_get_functiondef('erp.command_generate_customer_review_batch(jsonb)'::regprocedure) INTO definition;
  IF (length(definition)-length(replace(definition,old_guard,'')))/length(old_guard)<>1
    OR (length(definition)-length(replace(definition,old_existing,'')))/length(old_existing)<>1
    OR position('safe_response jsonb;' IN definition)=0
    OR position('INSERT INTO erp.customer_review_batches(company_id,' IN definition)=0
    OR position('VALUES(tenant,rental_record.customer_id,' IN definition)=0
  THEN RAISE EXCEPTION 'DEUR submit review generator contract changed' USING ERRCODE='55000'; END IF;
  definition:=replace(definition,old_guard,new_guard);
  definition:=replace(definition,'safe_response jsonb;','safe_response jsonb; successor_id uuid;');
  definition:=replace(definition,old_existing,new_existing);
  definition:=replace(definition,'INSERT INTO erp.customer_review_batches(company_id,','INSERT INTO erp.customer_review_batches(id,company_id,');
  definition:=replace(definition,'VALUES(tenant,rental_record.customer_id,','VALUES(coalesce(successor_id,extensions.gen_random_uuid()),tenant,rental_record.customer_id,');
  EXECUTE definition;

  SELECT pg_get_functiondef('erp.enqueue_submitted_deur_customer_review(text)'::regprocedure) INTO definition;
  IF position('generated:=erp.command_generate_customer_review_batch(' IN definition)=0
    OR position('''rentalId'',target.rental_id));' IN definition)=0
  THEN RAISE EXCEPTION 'DEUR submit review handoff contract changed' USING ERRCODE='55000'; END IF;
  definition:=replace(definition,
    'generated:=erp.command_generate_customer_review_batch(',
    'PERFORM pg_catalog.set_config(''erp.deur_submit_target_id'',target.id,true); generated:=erp.command_generate_customer_review_batch(');
  definition:=replace(definition,
    '''rentalId'',target.rental_id));',
    '''rentalId'',target.rental_id,''businessDate'',CASE WHEN target.previous_revision_id IS NOT NULL THEN (target.submitted_at AT TIME ZONE rental.timezone)::date ELSE target.work_date END));');
  EXECUTE definition;
END $migration$;

-- LOG survives the failed transaction, unlike an audit row. Keep the client
-- exception generic; log only a database-scoped DEUR ID, a validated command
-- ID, stage/code and the expected PostgREST status. Never log command JSON.
DO $diagnostic$
DECLARE definition text;
  submit_marker text := 'PERFORM erp.enqueue_submitted_deur_customer_review(current_deur.id);';
  membership_marker text := 'THEN RAISE EXCEPTION ''Submitted DEUR was not included in Customer Review batch'' USING ERRCODE=''55000''; END IF;';
BEGIN
  SELECT pg_get_functiondef('erp.command_submit_deur(jsonb)'::regprocedure) INTO definition;
  IF (length(definition)-length(replace(definition,submit_marker,'')))/length(submit_marker)<>1
  THEN RAISE EXCEPTION 'DEUR submit diagnostic marker changed' USING ERRCODE='55000'; END IF;
  definition:=replace(definition,submit_marker,
    'PERFORM pg_catalog.set_config(''erp.deur_submit_request_id'',coalesce(command->>''commandId'',''''),true); '||submit_marker);
  EXECUTE definition;

  SELECT pg_get_functiondef('erp.enqueue_submitted_deur_customer_review(text)'::regprocedure) INTO definition;
  IF (length(definition)-length(replace(definition,membership_marker,'')))/length(membership_marker)<>1
  THEN RAISE EXCEPTION 'DEUR membership diagnostic marker changed' USING ERRCODE='55000'; END IF;
  definition:=replace(definition,membership_marker,
    'THEN RAISE LOG ''DEUR_SUBMIT_FAILURE deur_id=% stage=% code=% correlation_id=% http_status=%'', '
    ||'target.id,''REVIEW_BATCH_MEMBERSHIP'',''REVIEW_BATCH_MEMBERSHIP_MISSING'','
    ||'CASE WHEN current_setting(''erp.deur_submit_request_id'',true) ~ ''^[0-9a-fA-F-]{36}$'' '
    ||'THEN current_setting(''erp.deur_submit_request_id'',true) ELSE ''UNAVAILABLE'' END,500; '
    ||'RAISE EXCEPTION ''Submitted DEUR was not included in Customer Review batch'' USING ERRCODE=''55000''; END IF;');
  EXECUTE definition;
END $diagnostic$;

ALTER FUNCTION erp.command_generate_customer_review_batch(jsonb) OWNER TO postgres;
ALTER FUNCTION erp.enqueue_submitted_deur_customer_review(text) OWNER TO postgres;
ALTER FUNCTION erp.command_submit_deur(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.command_generate_customer_review_batch(jsonb) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION erp.command_generate_customer_review_batch(jsonb) TO authenticated;
REVOKE ALL ON FUNCTION erp.enqueue_submitted_deur_customer_review(text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION erp.command_submit_deur(jsonb) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION erp.command_submit_deur(jsonb) TO authenticated;
COMMIT;
