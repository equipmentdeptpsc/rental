BEGIN;
SET LOCAL search_path=erp,auth,extensions,pg_catalog;

ALTER TABLE erp.customer_review_batches
  ADD COLUMN group_scope text NOT NULL DEFAULT 'RENTAL',
  ADD COLUMN recipient_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN recipient_version bigint NOT NULL DEFAULT 0,
  ADD CONSTRAINT customer_review_batches_group_scope_check CHECK(group_scope IN('RENTAL','PROJECT')),
  ADD CONSTRAINT customer_review_batches_recipient_snapshot_check CHECK(jsonb_typeof(recipient_snapshot)='array'),
  ADD CONSTRAINT customer_review_batches_recipient_version_check CHECK(recipient_version>=0);
ALTER TABLE erp.customer_review_batches ADD CONSTRAINT customer_review_batches_project_context_identity
  UNIQUE(id,company_id,customer_id,project_id);
CREATE UNIQUE INDEX uq_customer_review_batches_current_project_date_timezone
  ON erp.customer_review_batches(company_id,customer_id,project_id,review_date,business_timezone)
  WHERE group_scope='PROJECT' AND superseded_at IS NULL AND retired_no_actionable_at IS NULL;
ALTER TABLE erp.customer_review_batch_items DROP CONSTRAINT customer_review_batch_items_batch_context_fk;
ALTER TABLE erp.customer_review_batch_items ADD CONSTRAINT customer_review_batch_items_project_context_fk
  FOREIGN KEY(batch_id,company_id,customer_id,project_id)
  REFERENCES erp.customer_review_batches(id,company_id,customer_id,project_id) ON DELETE RESTRICT;

-- The anchor Rental remains on the batch for legacy identity and FK lineage.
-- Every new cross-Rental item must independently prove its complete context.
CREATE FUNCTION erp.validate_project_customer_review_batch_item()
RETURNS trigger LANGUAGE plpgsql SET search_path=erp,pg_catalog AS $$
DECLARE parent erp.customer_review_batches; related erp.rentals; assignment erp.assignments;
BEGIN
  SELECT * INTO parent FROM erp.customer_review_batches WHERE id=NEW.batch_id;
  IF parent.group_scope<>'PROJECT' THEN RETURN NEW; END IF;
  SELECT * INTO related FROM erp.rentals WHERE company_id=NEW.company_id AND id=NEW.rental_id;
  IF related.id IS NULL OR related.customer_id IS DISTINCT FROM parent.customer_id
    OR related.project_id IS DISTINCT FROM parent.project_id
    OR related.timezone IS DISTINCT FROM parent.business_timezone
  THEN RAISE EXCEPTION 'Project review item Rental context mismatch' USING ERRCODE='23514'; END IF;
  SELECT a.* INTO assignment FROM erp.rental_equipment_lines l
  JOIN erp.assignments a ON a.company_id=l.company_id AND a.id=l.assignment_id
  WHERE l.company_id=NEW.company_id AND l.id=NEW.rental_equipment_line_id AND l.rental_id=NEW.rental_id;
  IF assignment.id IS NULL OR assignment.project_id IS DISTINCT FROM parent.project_id
  THEN RAISE EXCEPTION 'Project review item Assignment context mismatch' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER validate_project_customer_review_batch_item BEFORE INSERT OR UPDATE ON erp.customer_review_batch_items
FOR EACH ROW EXECUTE FUNCTION erp.validate_project_customer_review_batch_item();
ALTER FUNCTION erp.validate_project_customer_review_batch_item() OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.validate_project_customer_review_batch_item() FROM PUBLIC,anon,authenticated,service_role;

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
  IF OLD.finalized_at IS NOT NULL AND (
    NEW.company_id IS DISTINCT FROM OLD.company_id OR NEW.customer_id IS DISTINCT FROM OLD.customer_id OR
    NEW.project_id IS DISTINCT FROM OLD.project_id OR NEW.rental_id IS DISTINCT FROM OLD.rental_id OR
    NEW.review_date IS DISTINCT FROM OLD.review_date OR NEW.business_timezone IS DISTINCT FROM OLD.business_timezone OR
    NEW.group_scope IS DISTINCT FROM OLD.group_scope OR NEW.recipient_snapshot IS DISTINCT FROM OLD.recipient_snapshot OR
    NEW.recipient_version IS DISTINCT FROM OLD.recipient_version OR
    NEW.credential_hash IS DISTINCT FROM OLD.credential_hash OR NEW.expires_at IS DISTINCT FROM OLD.expires_at OR
    NEW.summary_snapshot IS DISTINCT FROM OLD.summary_snapshot OR NEW.finalized_at IS DISTINCT FROM OLD.finalized_at
  ) THEN RAISE EXCEPTION 'finalized grouped Customer Review batch is immutable' USING ERRCODE='55000'; END IF;
  RETURN NEW;
END $$;

-- Only one current delivery per recipient is permitted. Historical terminal
-- intents remain intact; one Project link can have multiple encrypted intents.
DROP INDEX erp.uq_customer_grouped_review_live_notification_per_batch;
CREATE UNIQUE INDEX uq_customer_grouped_review_live_notification_per_batch_recipient
  ON erp.notification_outbox(company_id,source_aggregate_id,recipient_destination)
  WHERE notification_type='CUSTOMER_GROUPED_REVIEW_REQUESTED'
    AND source_aggregate_type='CUSTOMER_REVIEW_BATCH'
    AND status NOT IN('DeadLetter','FailedCredentialLost','Cancelled','Superseded');

-- Keep SINGLE legacy request behavior for historical paths. A newly issued
-- GROUPED request must resolve to a configured Project recipient, never the
-- Customer profile or Rental's old recipient snapshot.
CREATE OR REPLACE FUNCTION erp.enforce_customer_review_snapshot_recipient()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,pg_catalog AS $$
DECLARE target_rental erp.rentals; project_recipients erp.project_customer_review_recipients;
BEGIN
  SELECT * INTO target_rental FROM erp.rentals WHERE id=NEW.rental_id AND company_id=NEW.company_id;
  IF target_rental.id IS NULL THEN RAISE EXCEPTION 'RENTAL_NOT_FOUND' USING ERRCODE='22023'; END IF;
  IF NEW.issuance_mode='GROUPED' THEN
    SELECT * INTO project_recipients FROM erp.project_customer_review_recipients
    WHERE company_id=NEW.company_id AND project_id=target_rental.project_id;
    IF project_recipients.project_id IS NULL OR jsonb_array_length(project_recipients.recipients)=0
    THEN RAISE EXCEPTION 'PROJECT_REVIEW_RECIPIENTS_REQUIRED' USING ERRCODE='22023'; END IF;
    NEW.recipient_name=project_recipients.recipients->0->>'name';
    NEW.recipient_destination=project_recipients.recipients->0->>'email';
    RETURN NEW;
  END IF;
  IF target_rental.customer_review_email_snapshot IS NULL THEN
    RAISE EXCEPTION 'CUSTOMER_EMAIL_REQUIRED' USING ERRCODE='22023';
  END IF;
  NEW.recipient_name=target_rental.customer_review_name_snapshot;
  NEW.recipient_destination=target_rental.customer_review_email_snapshot;
  RETURN NEW;
END $$;

CREATE FUNCTION pg_temp.project_review_replace_once(source text,needle text,replacement text)
RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  IF needle='' OR (length(source)-length(replace(source,needle,'')))/length(needle)<>1
  THEN RAISE EXCEPTION 'Project review generator contract changed: %',left(needle,90) USING ERRCODE='55000'; END IF;
  RETURN replace(source,needle,replacement);
END $$;

DO $migration$
DECLARE definition text;
BEGIN
  SELECT pg_get_functiondef('erp.command_generate_customer_review_batch(jsonb)'::regprocedure) INTO definition;
  definition=pg_temp.project_review_replace_once(definition,
    'rental_record erp.rentals; customer_record erp.customers; project_record erp.projects; company_record erp.companies;',
    'rental_record erp.rentals; member_rental erp.rentals; customer_record erp.customers; project_record erp.projects; company_record erp.companies; reviewer_config erp.project_customer_review_recipients;');
  definition=pg_temp.project_review_replace_once(definition,
    'IF customer_record.id IS NULL OR project_record.id IS NULL OR company_record.id IS NULL THEN RETURN jsonb_build_object(''success'',false,''code'',''INVALID_TRANSITION''); END IF;',
    $replacement$IF customer_record.id IS NULL OR project_record.id IS NULL OR company_record.id IS NULL
    OR NOT project_record.active OR project_record.deleted_at IS NOT NULL
    OR project_record.customer_id IS DISTINCT FROM customer_record.id
  THEN RETURN jsonb_build_object('success',false,'code','INVALID_TRANSITION'); END IF;
  SELECT * INTO reviewer_config FROM erp.project_customer_review_recipients
  WHERE company_id=tenant AND project_id=project_record.id FOR SHARE;
  IF reviewer_config.project_id IS NULL OR jsonb_array_length(reviewer_config.recipients)=0
  THEN RETURN jsonb_build_object('success',false,'code','PROJECT_REVIEW_RECIPIENTS_REQUIRED'); END IF;$replacement$);
  definition=pg_temp.project_review_replace_once(definition,
    'tenant||''|''||rental_record.id||''|''||requested_date::text',
    'tenant||''|''||rental_record.customer_id||''|''||rental_record.project_id||''|''||rental_record.timezone||''|''||requested_date::text');
  definition=pg_temp.project_review_replace_once(definition,
    'AND project_id=rental_record.project_id AND rental_id=rental_record.id AND review_date=requested_date AND superseded_at IS NULL AND retired_no_actionable_at IS NULL;',
    'AND project_id=rental_record.project_id AND group_scope=''PROJECT'' AND business_timezone=rental_record.timezone AND review_date=requested_date AND superseded_at IS NULL AND retired_no_actionable_at IS NULL;');
  definition=pg_temp.project_review_replace_once(definition,
    'IF batch.id IS NOT NULL
    AND current_setting(''erp.deur_submit_review_handoff'',true)=''true''',
    $replacement$IF batch.id IS NOT NULL AND (batch.recipient_version IS DISTINCT FROM reviewer_config.row_version
    OR batch.recipient_snapshot IS DISTINCT FROM reviewer_config.recipients)
    AND (current_setting('erp.deur_submit_review_handoff',true)='true'
      OR nullif(current_setting('erp.grouped_review_credential_hash',true),'') IS NOT NULL)
    AND EXISTS(SELECT 1 FROM erp.customer_review_batch_items existing_item
      JOIN erp.customer_review_requests existing_request ON existing_request.company_id=existing_item.company_id
        AND existing_request.id=existing_item.customer_review_request_id
      WHERE existing_item.batch_id=batch.id AND existing_request.status='Pending'
        AND existing_request.consumed_at IS NULL AND existing_request.revoked_at IS NULL
        AND existing_request.superseded_at IS NULL) THEN
    successor_id:=extensions.gen_random_uuid();
    SET CONSTRAINTS customer_review_batches_superseded_by_fk DEFERRED;
    UPDATE erp.notification_outbox SET status='Superseded',updated_at=now_at
    WHERE company_id=tenant AND source_aggregate_type='CUSTOMER_REVIEW_BATCH'
      AND source_aggregate_id=batch.id::text AND status IN('Pending','Failed');
    UPDATE erp.customer_review_batches
    SET superseded_at=now_at,superseded_by_batch_id=successor_id,row_version=row_version+1
    WHERE id=batch.id;
    batch:=NULL;
  END IF;
  IF batch.id IS NOT NULL
    AND current_setting('erp.deur_submit_review_handoff',true)='true'$replacement$);
  definition=pg_temp.project_review_replace_once(definition,
    '  supplied_hash=nullif(current_setting(''erp.grouped_review_credential_hash'',true),'''');',
    $replacement$  IF successor_id IS NULL THEN successor_id:=extensions.gen_random_uuid(); END IF;
  SET CONSTRAINTS customer_review_batches_superseded_by_fk DEFERRED;
  UPDATE erp.notification_outbox n SET status='Superseded',updated_at=now_at
  FROM erp.customer_review_batches old_batch
  WHERE n.company_id=tenant AND n.source_aggregate_type='CUSTOMER_REVIEW_BATCH'
    AND n.source_aggregate_id=old_batch.id::text AND n.status IN('Pending','Failed')
    AND old_batch.company_id=tenant AND old_batch.customer_id=rental_record.customer_id
    AND old_batch.project_id=rental_record.project_id AND old_batch.business_timezone=rental_record.timezone
    AND old_batch.review_date=requested_date AND old_batch.group_scope='RENTAL' AND old_batch.superseded_at IS NULL;
  UPDATE erp.customer_review_batches old_batch
  SET superseded_at=now_at,superseded_by_batch_id=successor_id,row_version=row_version+1
  WHERE old_batch.company_id=tenant AND old_batch.customer_id=rental_record.customer_id
    AND old_batch.project_id=rental_record.project_id AND old_batch.business_timezone=rental_record.timezone
    AND old_batch.review_date=requested_date AND old_batch.group_scope='RENTAL' AND old_batch.superseded_at IS NULL;
  supplied_hash=nullif(current_setting('erp.grouped_review_credential_hash',true),'');$replacement$);
  definition=pg_temp.project_review_replace_once(definition,
    'INSERT INTO erp.customer_review_batches(id,company_id,customer_id,project_id,rental_id,review_date,business_timezone,credential_hash,expires_at,summary_snapshot)',
    'INSERT INTO erp.customer_review_batches(id,company_id,customer_id,project_id,rental_id,review_date,business_timezone,credential_hash,expires_at,summary_snapshot,group_scope,recipient_snapshot,recipient_version)');
  definition=pg_temp.project_review_replace_once(definition,
    'now_at+interval ''7 days'',''{}''::jsonb) RETURNING * INTO batch;',
    'now_at+interval ''7 days'',''{}''::jsonb,''PROJECT'',reviewer_config.recipients,reviewer_config.row_version) RETURNING * INTO batch;');
  definition=pg_temp.project_review_replace_once(definition,
    'FOR line_record IN SELECT * FROM erp.rental_equipment_lines WHERE company_id=tenant AND rental_id=rental_record.id AND deleted_at IS NULL ORDER BY id LOOP',
    $replacement$FOR line_record IN SELECT line.* FROM erp.rental_equipment_lines line
    JOIN erp.rentals related ON related.company_id=line.company_id AND related.id=line.rental_id
    WHERE line.company_id=tenant AND line.deleted_at IS NULL AND line.status<>'Cancelled'
      AND related.customer_id=rental_record.customer_id AND related.project_id=rental_record.project_id
      AND related.timezone=rental_record.timezone AND related.status<>'Cancelled'
      AND (line.rental_id=rental_record.id OR EXISTS(SELECT 1 FROM erp.deurs candidate
        WHERE candidate.company_id=tenant AND candidate.rental_equipment_line_id=line.id
          AND candidate.superseded_by_revision_id IS NULL
          AND (candidate.work_date=requested_date OR (candidate.previous_revision_id IS NOT NULL
            AND (candidate.submitted_at AT TIME ZONE related.timezone)::date=requested_date))))
    ORDER BY line.rental_id,line.id LOOP
    SELECT * INTO member_rental FROM erp.rentals WHERE company_id=tenant AND id=line_record.rental_id;
    IF NOT EXISTS(SELECT 1 FROM erp.assignments assignment WHERE assignment.company_id=tenant
      AND assignment.id=line_record.assignment_id AND assignment.project_id=rental_record.project_id)
    THEN RAISE EXCEPTION 'Rental line Project identity missing or conflicting' USING ERRCODE='55000'; END IF;$replacement$);
  definition=pg_temp.project_review_replace_once(definition,
    $needle$IF nullif(btrim(rental_record.customer_review_name_snapshot),'') IS NULL OR rental_record.customer_review_email_snapshot IS NULL
            OR rental_record.customer_review_email_snapshot !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
          THEN RAISE EXCEPTION 'Rental Customer Review recipient snapshot unavailable' USING ERRCODE='55000'; END IF;$needle$,
    'IF jsonb_array_length(reviewer_config.recipients)=0 THEN RAISE EXCEPTION ''PROJECT_REVIEW_RECIPIENTS_REQUIRED'' USING ERRCODE=''55000''; END IF;');
  definition=pg_temp.project_review_replace_once(definition,
    '''rentalReference'',rental_record.rental_number,''customerName'',btrim(rental_record.customer_review_name_snapshot)',
    '''rentalReference'',member_rental.rental_number,''customerName'',customer_record.name');
  definition=pg_temp.project_review_replace_once(definition,
    'VALUES(tenant,rental_record.id,line_record.id,target.id,target.id,target.equipment_id,target.operator_id,target.customer_id,',
    'VALUES(tenant,member_rental.id,line_record.id,target.id,target.id,target.equipment_id,target.operator_id,target.customer_id,');
  definition=pg_temp.project_review_replace_once(definition,
    'now_at,btrim(rental_record.customer_review_name_snapshot),',
    'now_at,reviewer_config.recipients->0->>''name'',');
  definition=pg_temp.project_review_replace_once(definition,
    'lower(btrim(rental_record.customer_review_email_snapshot)),ARRAY[''ACKNOWLEDGE'',''REQUEST_CORRECTION'']',
    'reviewer_config.recipients->0->>''email'',ARRAY[''ACKNOWLEDGE'',''REQUEST_CORRECTION'']');
  definition=pg_temp.project_review_replace_once(definition,
    'VALUES(batch.id,tenant,rental_record.customer_id,rental_record.project_id,rental_record.id,line_record.id,',
    'VALUES(batch.id,tenant,rental_record.customer_id,rental_record.project_id,member_rental.id,line_record.id,');
  definition=pg_temp.project_review_replace_once(definition,
    '''rental'',coalesce(rental_record.rental_number,rental_record.id)',
    '''rental'',''Project review''');
  IF (length(definition)-length(replace(definition,'''equipmentName''','')))/length('''equipmentName''')<>2
  THEN RAISE EXCEPTION 'Project review item snapshot contract changed' USING ERRCODE='55000'; END IF;
  definition=replace(definition,'''equipmentName''','''rentalReference'',member_rental.rental_number,''equipmentName''');
  EXECUTE definition;
END $migration$;

CREATE OR REPLACE FUNCTION erp.enqueue_submitted_deur_customer_review(target_deur_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,auth,extensions,pg_catalog AS $$
DECLARE
  target erp.deurs; rental erp.rentals; batch erp.customer_review_batches;
  generated jsonb; intent erp.notification_outbox; reviewer jsonb;
  recipient_name text; recipient_destination text; identity text; payload jsonb;
  intent_ids jsonb='[]'::jsonb;
BEGIN
  SELECT * INTO target FROM erp.deurs WHERE id=target_deur_id AND company_id=erp.current_company_id() FOR UPDATE;
  IF target.id IS NULL OR target.status<>'Submitted' OR target.submitted_by IS DISTINCT FROM auth.uid()::text
  THEN RAISE EXCEPTION 'submitted DEUR handoff scope rejected' USING ERRCODE='42501'; END IF;
  SELECT * INTO rental FROM erp.rentals WHERE company_id=target.company_id AND id=target.rental_id;
  IF rental.id IS NULL OR target.customer_id IS DISTINCT FROM rental.customer_id
    OR target.project_id IS DISTINCT FROM rental.project_id
    OR NOT EXISTS (SELECT 1 FROM erp.rental_equipment_lines line
      JOIN erp.assignments assignment ON assignment.company_id=line.company_id AND assignment.id=line.assignment_id
      WHERE line.company_id=target.company_id AND line.id=target.rental_equipment_line_id
        AND line.rental_id=target.rental_id AND assignment.project_id=target.project_id)
  THEN RAISE EXCEPTION 'submitted DEUR Project relationship unavailable' USING ERRCODE='55000'; END IF;
  PERFORM pg_catalog.set_config('erp.deur_submit_review_handoff','true',true);
  PERFORM pg_catalog.set_config('erp.deur_submit_target_id',target.id,true);
  generated=erp.command_generate_customer_review_batch(jsonb_build_object(
    'commandId','deur-submit-review:'||target.id||':'||target.row_version,
    'idempotencyKey','deur-submit-review:'||target.id||':'||target.row_version,
    'rentalId',target.rental_id,
    'businessDate',CASE WHEN target.previous_revision_id IS NOT NULL
      THEN (target.submitted_at AT TIME ZONE rental.timezone)::date ELSE target.work_date END));
  IF generated->>'success'<>'true' OR coalesce(generated#>>'{value,batchId}','')='' THEN
    RAISE LOG 'DEUR_SUBMIT_FAILURE deur_id=% stage=% code=% correlation_id=% http_status=%',
      target.id,'PROJECT_REVIEW_BATCH',coalesce(generated->>'code','PROJECT_REVIEW_GENERATION_FAILED'),
      CASE WHEN current_setting('erp.deur_submit_request_id',true) ~ '^[0-9a-fA-F-]{36}$'
        THEN current_setting('erp.deur_submit_request_id',true) ELSE 'UNAVAILABLE' END,500;
    RAISE EXCEPTION 'Project Customer Review batch handoff failed (%)',coalesce(generated->>'code','UNKNOWN') USING ERRCODE='55000';
  END IF;
  SELECT * INTO batch FROM erp.customer_review_batches
  WHERE id=(generated#>>'{value,batchId}')::uuid AND company_id=target.company_id FOR UPDATE;
  IF batch.id IS NULL OR batch.group_scope<>'PROJECT' OR batch.customer_id IS DISTINCT FROM target.customer_id
    OR batch.project_id IS DISTINCT FROM target.project_id OR batch.business_timezone IS DISTINCT FROM rental.timezone
    OR NOT EXISTS (SELECT 1 FROM erp.customer_review_batch_items item
      WHERE item.batch_id=batch.id AND item.deur_id=target.id AND item.customer_review_request_id IS NOT NULL)
  THEN
    RAISE LOG 'DEUR_SUBMIT_FAILURE deur_id=% stage=% code=% correlation_id=% http_status=%',
      target.id,'REVIEW_BATCH_MEMBERSHIP','REVIEW_BATCH_MEMBERSHIP_MISSING',
      CASE WHEN current_setting('erp.deur_submit_request_id',true) ~ '^[0-9a-fA-F-]{36}$'
        THEN current_setting('erp.deur_submit_request_id',true) ELSE 'UNAVAILABLE' END,500;
    RAISE EXCEPTION 'Submitted DEUR was not included in Customer Review batch' USING ERRCODE='55000';
  END IF;
  IF jsonb_array_length(batch.recipient_snapshot)=0 OR batch.recipient_version<1
  THEN RAISE EXCEPTION 'PROJECT_REVIEW_RECIPIENTS_REQUIRED' USING ERRCODE='55000'; END IF;
  FOR reviewer IN SELECT value FROM jsonb_array_elements(batch.recipient_snapshot) LOOP
    recipient_name=reviewer->>'name'; recipient_destination=reviewer->>'email';
    IF nullif(btrim(recipient_name),'') IS NULL OR recipient_destination !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    THEN RAISE EXCEPTION 'Project reviewer snapshot invalid' USING ERRCODE='55000'; END IF;
    identity='customer-grouped-review:'||batch.id::text||':submit-v2:'||
      pg_catalog.encode(extensions.digest(recipient_destination,'sha256'),'hex');
    payload=jsonb_build_object('recipientName',recipient_name,'companyName',batch.summary_snapshot->>'company',
      'customerName',batch.summary_snapshot->>'customer','projectName',batch.summary_snapshot->>'project',
      'rentalReference','Project review','reviewDate',batch.review_date,'expirationLabel',batch.expires_at,
      'totalLineCount',coalesce((batch.summary_snapshot->>'totalLineCount')::integer,0),
      'actionableCount',coalesce((batch.summary_snapshot->>'actionableCount')::integer,0),
      'inProgressCount',coalesce((batch.summary_snapshot->>'inProgressCount')::integer,0),
      'acknowledgedCount',coalesce((batch.summary_snapshot->>'acknowledgedCount')::integer,0));
    INSERT INTO erp.notification_outbox(company_id,notification_type,recipient_destination,recipient_display_name,
      source_aggregate_type,source_aggregate_id,template_version,idempotency_key,payload_fingerprint,template_payload,requires_review_credential)
    VALUES(target.company_id,'CUSTOMER_GROUPED_REVIEW_REQUESTED',recipient_destination,recipient_name,
      'CUSTOMER_REVIEW_BATCH',batch.id::text,3,identity,
      pg_catalog.encode(extensions.digest(identity||'|'||recipient_destination||'|CUSTOMER_GROUPED_REVIEW_REQUESTED','sha256'),'hex'),payload,true)
    ON CONFLICT(company_id,idempotency_key) DO UPDATE SET updated_at=notification_outbox.updated_at RETURNING * INTO intent;
    intent_ids=intent_ids||jsonb_build_array(intent.id);
  END LOOP;
  RETURN jsonb_build_object('success',true,'batchId',batch.id,'notificationIntentIds',intent_ids);
END $$;

CREATE FUNCTION erp.read_pending_project_review_batch_handoffs(batch_size integer)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=erp,auth,pg_catalog AS $$
BEGIN
  IF auth.role()<>'service_role' OR batch_size NOT BETWEEN 1 AND 50
  THEN RETURN jsonb_build_object('success',false,'code','FORBIDDEN'); END IF;
  RETURN jsonb_build_object('success',true,'value',coalesce((
    SELECT jsonb_agg(jsonb_build_object('batchId',candidate.id,'notificationIds',candidate.notification_ids))
    FROM (SELECT b.id, jsonb_agg(n.id ORDER BY n.id) notification_ids
      FROM erp.customer_review_batches b
      JOIN erp.notification_outbox n ON n.company_id=b.company_id
        AND n.source_aggregate_type='CUSTOMER_REVIEW_BATCH' AND n.source_aggregate_id=b.id::text
        AND n.notification_type='CUSTOMER_GROUPED_REVIEW_REQUESTED' AND n.status='Pending'
        AND n.requires_review_credential
      WHERE b.group_scope='PROJECT' AND b.finalized_at IS NOT NULL
        AND b.superseded_at IS NULL AND b.retired_no_actionable_at IS NULL
        AND b.expires_at>clock_timestamp()
        AND NOT EXISTS(SELECT 1 FROM erp.notification_delivery_envelopes envelope
          WHERE envelope.notification_id=n.id AND envelope.retired_at IS NULL)
      GROUP BY b.id,b.created_at ORDER BY b.created_at,b.id LIMIT batch_size) candidate
  ),'[]'::jsonb));
END $$;

CREATE FUNCTION erp.prepare_project_review_batch_handoff(command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,auth,pg_catalog AS $$
DECLARE
  batch erp.customer_review_batches; intent erp.notification_outbox; supplied jsonb;
  expected_ids uuid[]; seen uuid[]='{}'; notification_id uuid;
  active_count integer;
BEGIN
  IF auth.role()<>'service_role' OR jsonb_typeof(command)<>'object'
    OR EXISTS(SELECT 1 FROM jsonb_object_keys(command) key WHERE key NOT IN('batchId','credentialHash','envelopes'))
    OR coalesce(command->>'batchId','') !~ '^[0-9a-f-]{36}$'
    OR coalesce(command->>'credentialHash','') !~ '^[0-9a-f]{64}$'
    OR coalesce(jsonb_typeof(command->'envelopes'),'')<>'array'
    OR jsonb_array_length(command->'envelopes') NOT BETWEEN 1 AND 10
  THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;
  SELECT * INTO batch FROM erp.customer_review_batches WHERE id=(command->>'batchId')::uuid
    AND group_scope='PROJECT' AND finalized_at IS NOT NULL
    AND superseded_at IS NULL AND retired_no_actionable_at IS NULL
    AND expires_at>clock_timestamp() FOR UPDATE;
  IF batch.id IS NULL THEN RETURN jsonb_build_object('success',false,'code','BATCH_NOT_ACTIONABLE'); END IF;
  SELECT array_agg(id ORDER BY id) INTO expected_ids FROM erp.notification_outbox
  WHERE company_id=batch.company_id AND source_aggregate_type='CUSTOMER_REVIEW_BATCH'
    AND source_aggregate_id=batch.id::text AND notification_type='CUSTOMER_GROUPED_REVIEW_REQUESTED'
    AND status='Pending' AND requires_review_credential;
  IF cardinality(expected_ids) IS DISTINCT FROM jsonb_array_length(batch.recipient_snapshot)
    OR cardinality(expected_ids) IS DISTINCT FROM jsonb_array_length(command->'envelopes')
  THEN RETURN jsonb_build_object('success',false,'code','RECIPIENT_SNAPSHOT_MISMATCH'); END IF;
  SELECT count(*) INTO active_count FROM erp.notification_delivery_envelopes envelope
  WHERE envelope.notification_id=ANY(expected_ids) AND envelope.retired_at IS NULL;
  IF active_count=cardinality(expected_ids) THEN RETURN jsonb_build_object('success',true,'disposition','REPLAYED'); END IF;
  IF active_count<>0 THEN RETURN jsonb_build_object('success',false,'code','PREPARATION_INTEGRITY'); END IF;
  FOR supplied IN SELECT value FROM jsonb_array_elements(command->'envelopes') LOOP
    IF coalesce(jsonb_typeof(supplied),'')<>'object'
      OR EXISTS(SELECT 1 FROM jsonb_object_keys(supplied) key WHERE key NOT IN('notificationId','envelopeType','envelopeVersion','keyVersion','ciphertext','nonce','authTag'))
      OR coalesce(supplied->>'notificationId','') !~ '^[0-9a-f-]{36}$'
      OR supplied->>'envelopeType'<>'GROUPED_CUSTOMER_REVIEW_PATH'
      OR supplied->>'envelopeVersion'<>'1' OR supplied->>'keyVersion'<>'1'
      OR coalesce(supplied->>'ciphertext','') !~ '^[A-Za-z0-9+/]+={0,2}$'
      OR coalesce(supplied->>'nonce','') !~ '^[A-Za-z0-9+/]{16}$'
      OR coalesce(supplied->>'authTag','') !~ '^[A-Za-z0-9+/]{22}==$'
    THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;
    notification_id=(supplied->>'notificationId')::uuid;
    IF notification_id<>ALL(expected_ids) OR notification_id=ANY(seen)
    THEN RETURN jsonb_build_object('success',false,'code','RECIPIENT_SNAPSHOT_MISMATCH'); END IF;
    seen=array_append(seen,notification_id);
    SELECT * INTO intent FROM erp.notification_outbox WHERE id=notification_id FOR UPDATE;
    IF intent.id IS NULL OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(batch.recipient_snapshot) recipient
      WHERE recipient->>'email'=intent.recipient_destination)
    THEN RETURN jsonb_build_object('success',false,'code','RECIPIENT_SNAPSHOT_MISMATCH'); END IF;
  END LOOP;
  PERFORM pg_catalog.set_config('erp.grouped_review_existing_batch_preparation',batch.id::text,true);
  UPDATE erp.customer_review_batches SET credential_hash=command->>'credentialHash',row_version=row_version+1 WHERE id=batch.id;
  FOR supplied IN SELECT value FROM jsonb_array_elements(command->'envelopes') LOOP
    INSERT INTO erp.notification_delivery_envelopes(notification_id,envelope_type,envelope_version,
      ciphertext,nonce,auth_tag,key_version,credential_hash)
    VALUES((supplied->>'notificationId')::uuid,'GROUPED_CUSTOMER_REVIEW_PATH',1,
      supplied->>'ciphertext',supplied->>'nonce',supplied->>'authTag',1,command->>'credentialHash');
  END LOOP;
  RETURN jsonb_build_object('success',true,'disposition','PREPARED','preparedCount',cardinality(expected_ids));
END $$;

ALTER FUNCTION erp.command_generate_customer_review_batch(jsonb) OWNER TO postgres;
ALTER FUNCTION erp.enqueue_submitted_deur_customer_review(text) OWNER TO postgres;
ALTER FUNCTION erp.read_pending_project_review_batch_handoffs(integer) OWNER TO postgres;
ALTER FUNCTION erp.prepare_project_review_batch_handoff(jsonb) OWNER TO postgres;
ALTER FUNCTION erp.enforce_customer_review_snapshot_recipient() OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.command_generate_customer_review_batch(jsonb) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION erp.command_generate_customer_review_batch(jsonb) TO authenticated;
REVOKE ALL ON FUNCTION erp.enqueue_submitted_deur_customer_review(text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION erp.read_pending_project_review_batch_handoffs(integer),erp.prepare_project_review_batch_handoff(jsonb)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION erp.read_pending_project_review_batch_handoffs(integer),erp.prepare_project_review_batch_handoff(jsonb)
  TO service_role;
REVOKE ALL ON FUNCTION erp.enforce_customer_review_snapshot_recipient() FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
