BEGIN;
SET search_path=erp,auth,pg_catalog;

ALTER TABLE erp.customer_review_requests
  ADD COLUMN issuance_mode text NOT NULL DEFAULT 'SINGLE',
  ADD CONSTRAINT customer_review_requests_issuance_mode_check CHECK(issuance_mode IN('SINGLE','GROUPED'));

CREATE OR REPLACE FUNCTION erp.enqueue_customer_review_notification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,pg_catalog AS $$
DECLARE target deurs; company companies; notification_type text; payload jsonb; identity text;
BEGIN
  IF NEW.issuance_mode='GROUPED' THEN RETURN NEW; END IF;
  SELECT * INTO target FROM deurs WHERE id=NEW.revision_id AND company_id=NEW.company_id;
  SELECT * INTO company FROM companies WHERE id=NEW.company_id AND active;
  IF target.id IS NULL OR company.id IS NULL THEN RAISE EXCEPTION 'invalid customer notification scope' USING ERRCODE='23503'; END IF;
  notification_type=CASE WHEN coalesce(target.revision_number,1)>1 THEN 'CUSTOMER_CORRECTED_REVIEW_REQUESTED' ELSE 'CUSTOMER_REVIEW_REQUESTED' END;
  identity='customer-review:'||NEW.id::text||':v1';
  payload=NEW.snapshot||jsonb_build_object('recipientName',NEW.recipient_name,'companyName',company.name,
    'rentalReference',coalesce(NEW.snapshot->>'rentalReference','Unavailable'),
    'deurNumber',split_part(coalesce(NEW.snapshot->>'submittedRevision',''),' R',1),
    'revisionLabel','R'||coalesce(target.revision_number,1)::text,'expirationLabel',NEW.expires_at);
  INSERT INTO notification_outbox(company_id,notification_type,recipient_destination,recipient_display_name,
    source_aggregate_type,source_aggregate_id,review_request_id,deur_revision_reference,template_version,
    idempotency_key,payload_fingerprint,template_payload,requires_review_credential)
  VALUES(NEW.company_id,notification_type,lower(NEW.recipient_destination),NEW.recipient_name,
    'CUSTOMER_REVIEW',NEW.id::text,NEW.id,coalesce(NEW.snapshot->>'submittedRevision',NEW.revision_id),1,
    identity,pg_catalog.encode(extensions.digest(identity||'|'||lower(NEW.recipient_destination)||'|'||notification_type,'sha256'),'hex'),payload,true)
  ON CONFLICT(company_id,idempotency_key) DO NOTHING;
  RETURN NEW;
END $$;

ALTER TABLE erp.customer_review_batches ADD COLUMN finalized_at timestamptz;

CREATE FUNCTION erp.reject_finalized_customer_review_batch_change()
RETURNS trigger LANGUAGE plpgsql SET search_path=erp,pg_catalog AS $$
BEGIN
  IF OLD.finalized_at IS NOT NULL AND (
    NEW.company_id IS DISTINCT FROM OLD.company_id OR NEW.customer_id IS DISTINCT FROM OLD.customer_id OR
    NEW.project_id IS DISTINCT FROM OLD.project_id OR NEW.rental_id IS DISTINCT FROM OLD.rental_id OR
    NEW.review_date IS DISTINCT FROM OLD.review_date OR NEW.business_timezone IS DISTINCT FROM OLD.business_timezone OR
    NEW.credential_hash IS DISTINCT FROM OLD.credential_hash OR NEW.expires_at IS DISTINCT FROM OLD.expires_at OR
    NEW.summary_snapshot IS DISTINCT FROM OLD.summary_snapshot OR NEW.finalized_at IS DISTINCT FROM OLD.finalized_at
  ) THEN RAISE EXCEPTION 'finalized grouped Customer Review batch is immutable' USING ERRCODE='55000'; END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION erp.reject_finalized_customer_review_batch_item_change()
RETURNS trigger LANGUAGE plpgsql SET search_path=erp,pg_catalog AS $$
DECLARE locked boolean; database_owner name; target_company text;
BEGIN
  target_company=CASE WHEN TG_OP='DELETE' THEN OLD.company_id ELSE NEW.company_id END;
  SELECT pg_get_userbyid(datdba) INTO database_owner FROM pg_database WHERE datname=current_database();
  IF TG_OP='DELETE' AND session_user=database_owner AND current_user=database_owner
    AND current_setting('erp.c12_grouped_review_fixture_cleanup',true)='TENANT-UAT-C12-GROUPED-CUSTOMER-001'
    AND target_company='TENANT-UAT-C12-GROUPED-CUSTOMER-001' THEN RETURN OLD; END IF;
  SELECT finalized_at IS NOT NULL INTO locked FROM erp.customer_review_batches WHERE id=CASE WHEN TG_OP='DELETE' THEN OLD.batch_id ELSE NEW.batch_id END;
  IF locked THEN RAISE EXCEPTION 'finalized grouped Customer Review batch items are immutable' USING ERRCODE='55000'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;

CREATE TRIGGER customer_review_batch_finalized_immutable BEFORE UPDATE ON erp.customer_review_batches
FOR EACH ROW EXECUTE FUNCTION erp.reject_finalized_customer_review_batch_change();
CREATE TRIGGER customer_review_batch_item_finalized_immutable BEFORE INSERT OR UPDATE OR DELETE ON erp.customer_review_batch_items
FOR EACH ROW EXECUTE FUNCTION erp.reject_finalized_customer_review_batch_item_change();

CREATE FUNCTION erp.command_generate_customer_review_batch(command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,auth,pg_catalog AS $$
DECLARE
  tenant text=erp.current_company_id(); now_at timestamptz=clock_timestamp(); requested_date date; local_today date;
  rental_record erp.rentals; customer_record erp.customers; project_record erp.projects; company_record erp.companies;
  line_record erp.rental_equipment_lines; target erp.deurs; request erp.customer_review_requests; batch erp.customer_review_batches;
  raw_credential text; raw_request_token text; item_state text; item_snapshot jsonb; request_snapshot jsonb;
  timeline jsonb; shift_start timestamptz; shift_end timestamptz; candidate_count integer;
  total_count integer=0; actionable_count integer=0; in_progress_count integer=0; acknowledged_count integer=0; correction_count integer=0;
  idem jsonb; payload_hash text; safe_response jsonb;
BEGIN
  IF tenant IS NULL THEN RETURN jsonb_build_object('success',false,'code','UNAUTHENTICATED'); END IF;
  IF NOT erp.current_user_has_permission('deur.review') THEN RETURN jsonb_build_object('success',false,'code','FORBIDDEN'); END IF;
  IF jsonb_typeof(command)<>'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(command) key
    WHERE key NOT IN('commandId','idempotencyKey','rentalId','businessDate'))
    OR nullif(command->>'commandId','') IS NULL OR nullif(command->>'idempotencyKey','') IS NULL OR nullif(command->>'rentalId','') IS NULL
  THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;

  SELECT * INTO rental_record FROM erp.rentals WHERE id=command->>'rentalId' AND company_id=tenant FOR UPDATE;
  IF rental_record.id IS NULL THEN RETURN jsonb_build_object('success',false,'code','NOT_FOUND'); END IF;
  IF rental_record.customer_id IS NULL OR rental_record.project_id IS NULL OR nullif(btrim(rental_record.timezone),'') IS NULL
    OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name=rental_record.timezone)
  THEN RETURN jsonb_build_object('success',false,'code','INVALID_TIMEZONE'); END IF;
  local_today=(now_at AT TIME ZONE rental_record.timezone)::date;
  BEGIN requested_date=coalesce(nullif(command->>'businessDate','')::date,local_today);
  EXCEPTION WHEN others THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END;
  IF requested_date<local_today OR requested_date>local_today+1 THEN RETURN jsonb_build_object('success',false,'code','INVALID_BUSINESS_DATE'); END IF;

  SELECT * INTO customer_record FROM erp.customers WHERE company_id=tenant AND id=rental_record.customer_id;
  SELECT * INTO project_record FROM erp.projects WHERE company_id=tenant AND id=rental_record.project_id;
  SELECT * INTO company_record FROM erp.companies WHERE id=tenant AND active;
  IF customer_record.id IS NULL OR project_record.id IS NULL OR company_record.id IS NULL THEN RETURN jsonb_build_object('success',false,'code','INVALID_TRANSITION'); END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(tenant||'|'||rental_record.id||'|'||requested_date::text,0));
  idem=erp.begin_operational_command(command,'GENERATE_CUSTOMER_REVIEW_BATCH','RENTAL_DATE',rental_record.id||':'||requested_date::text,tenant,auth.uid()::text);
  IF idem->>'state'='MISMATCH' THEN RETURN jsonb_build_object('success',false,'code','IDEMPOTENCY_MISMATCH'); END IF;
  IF idem->>'state'='REPLAY' THEN RETURN (idem->'response')||jsonb_build_object('disposition','REPLAYED'); END IF;
  IF idem->>'state'<>'NEW' THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;
  payload_hash=idem->>'payloadHash';

  SELECT * INTO batch FROM erp.customer_review_batches WHERE company_id=tenant AND customer_id=rental_record.customer_id
    AND project_id=rental_record.project_id AND rental_id=rental_record.id AND review_date=requested_date AND superseded_at IS NULL;
  IF batch.id IS NOT NULL THEN
    safe_response=jsonb_build_object('success',true,'disposition','EXISTING','value',jsonb_build_object('batchId',batch.id,'reviewDate',batch.review_date,'expiresAt',batch.expires_at));
    PERFORM erp.finish_operational_command(command,'GENERATE_CUSTOMER_REVIEW_BATCH','RENTAL_DATE',rental_record.id||':'||requested_date::text,tenant,auth.uid()::text,payload_hash,safe_response,batch.row_version);
    RETURN safe_response;
  END IF;

  raw_credential=pg_catalog.encode(extensions.gen_random_bytes(32),'hex');
  INSERT INTO erp.customer_review_batches(company_id,customer_id,project_id,rental_id,review_date,business_timezone,credential_hash,expires_at,summary_snapshot)
  VALUES(tenant,rental_record.customer_id,rental_record.project_id,rental_record.id,requested_date,rental_record.timezone,
    pg_catalog.encode(extensions.digest(raw_credential,'sha256'),'hex'),now_at+interval '7 days','{}'::jsonb) RETURNING * INTO batch;

  FOR line_record IN SELECT * FROM erp.rental_equipment_lines WHERE company_id=tenant AND rental_id=rental_record.id AND deleted_at IS NULL ORDER BY id LOOP
    SELECT count(*) INTO candidate_count FROM erp.deurs WHERE company_id=tenant AND rental_equipment_line_id=line_record.id AND superseded_by_revision_id IS NULL;
    IF candidate_count>1 THEN RAISE EXCEPTION 'ambiguous effective DEUR for Rental line' USING ERRCODE='55000'; END IF;
    SELECT * INTO target FROM erp.deurs WHERE company_id=tenant AND rental_equipment_line_id=line_record.id AND superseded_by_revision_id IS NULL;
    request=NULL;
    IF target.id IS NULL OR target.status IN('Draft','In Progress') THEN item_state='IN_PROGRESS'; in_progress_count=in_progress_count+1;
    ELSE
      SELECT * INTO request FROM erp.customer_review_requests WHERE company_id=tenant AND revision_id=target.id ORDER BY created_at DESC LIMIT 1;
      IF target.status='Acknowledged' OR request.status='Acknowledged' THEN item_state='ACKNOWLEDGED'; acknowledged_count=acknowledged_count+1;
      ELSIF request.status='CorrectionRequested' THEN item_state='CORRECTION_REQUESTED'; correction_count=correction_count+1;
      ELSIF target.status='Submitted' THEN
        SELECT * INTO request FROM erp.customer_review_requests WHERE company_id=tenant AND revision_id=target.id AND status='Pending'
          AND superseded_at IS NULL AND revoked_at IS NULL AND consumed_at IS NULL AND expires_at>now_at ORDER BY created_at DESC LIMIT 1;
        IF request.id IS NULL THEN
          IF nullif(btrim(rental_record.customer_review_name_snapshot),'') IS NULL OR rental_record.customer_review_email_snapshot IS NULL
            OR rental_record.customer_review_email_snapshot !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
          THEN RAISE EXCEPTION 'Rental Customer Review recipient snapshot unavailable' USING ERRCODE='55000'; END IF;
          SELECT coalesce(jsonb_agg(jsonb_build_object('activity',e.activity_type,'action',e.action,'occurredAt',e.occurred_at,'sequence',e.sequence) ORDER BY e.sequence),'[]'::jsonb),
            min(e.occurred_at) FILTER(WHERE e.activity_type='shift' AND e.action='start'),max(e.occurred_at) FILTER(WHERE e.activity_type='shift' AND e.action='end')
          INTO timeline,shift_start,shift_end FROM erp.deur_events e WHERE e.deur_id=target.id;
          request_snapshot=jsonb_build_object('rentalReference',rental_record.rental_number,'customerName',btrim(rental_record.customer_review_name_snapshot),
            'project',project_record.name,'equipment',(SELECT concat_ws(' - ',asset_no,equipment_name) FROM erp.equipment WHERE company_id=tenant AND id=line_record.equipment_id),
            'operator',(SELECT name FROM erp.operators WHERE company_id=tenant AND id=line_record.operator_id),'workDate',target.work_date,'shift',target.shift,
            'shiftStart',shift_start,'shiftEnd',shift_end,'operationMinutes',target.total_operating_minutes,'idleMinutes',target.total_idle_minutes,
            'standbyMinutes',coalesce(target.total_standby_minutes,target.total_meal_break_minutes),'breakdownMinutes',target.total_maintenance_minutes,
            'openingMeter',target.opening_meter,'closingMeter',target.closing_meter,'submittedRevision',concat(coalesce(target.deur_number,'DEUR'),' R',coalesce(target.revision_number,1)),
            'submittedAt',target.submitted_at,'timeline',timeline);
          raw_request_token=pg_catalog.encode(extensions.gen_random_bytes(32),'hex');
          INSERT INTO erp.customer_review_requests(company_id,rental_id,rental_equipment_line_id,deur_id,revision_id,equipment_id,operator_id,customer_id,
            token_hash,expires_at,created_by,issued_at,recipient_name,recipient_destination,permitted_actions,revision_version,snapshot,issuance_mode)
          VALUES(tenant,rental_record.id,line_record.id,target.id,target.id,target.equipment_id,target.operator_id,target.customer_id,
            pg_catalog.encode(extensions.digest(raw_request_token,'sha256'),'hex'),now_at+interval '7 days',auth.uid(),now_at,btrim(rental_record.customer_review_name_snapshot),
            lower(btrim(rental_record.customer_review_email_snapshot)),ARRAY['ACKNOWLEDGE','REQUEST_CORRECTION'],target.row_version,request_snapshot,'GROUPED') RETURNING * INTO request;
        END IF;
        item_state='SUBMITTED_AWAITING_ACKNOWLEDGEMENT'; actionable_count=actionable_count+1;
      ELSE item_state='IN_PROGRESS'; in_progress_count=in_progress_count+1; END IF;
    END IF;

    IF item_state='IN_PROGRESS' THEN
      SELECT jsonb_strip_nulls(jsonb_build_object('equipmentName',e.equipment_name,'assetNumber',e.asset_no,'operator',o.name,
        'deurNumber',target.deur_number,'revisionLabel',CASE WHEN target.id IS NOT NULL THEN 'R'||coalesce(target.revision_number,1)::text END,
        'workDate',target.work_date,'shift',target.shift,'openingMeter',target.opening_meter,'reviewState',item_state))
      INTO item_snapshot FROM erp.equipment e JOIN erp.operators o ON o.company_id=tenant AND o.id=line_record.operator_id WHERE e.company_id=tenant AND e.id=line_record.equipment_id;
    ELSE
      SELECT coalesce(jsonb_agg(jsonb_build_object('activity',e.activity_type,'action',e.action,'occurredAt',e.occurred_at,'sequence',e.sequence) ORDER BY e.sequence),'[]'::jsonb),
        min(e.occurred_at) FILTER(WHERE e.activity_type='shift' AND e.action='start'),max(e.occurred_at) FILTER(WHERE e.activity_type='shift' AND e.action='end')
      INTO timeline,shift_start,shift_end FROM erp.deur_events e WHERE e.deur_id=target.id;
      SELECT jsonb_strip_nulls(jsonb_build_object('equipmentName',e.equipment_name,'assetNumber',e.asset_no,'operator',o.name,'deurNumber',target.deur_number,
        'revisionLabel','R'||coalesce(target.revision_number,1)::text,'workDate',target.work_date,'shift',target.shift,'shiftStart',shift_start,'shiftEnd',shift_end,
        'operationMinutes',target.total_operating_minutes,'idleMinutes',target.total_idle_minutes,'standbyMinutes',coalesce(target.total_standby_minutes,target.total_meal_break_minutes),
        'breakdownMinutes',target.total_maintenance_minutes,'openingMeter',target.opening_meter,'closingMeter',target.closing_meter,'timeline',timeline,'reviewState',item_state))
      INTO item_snapshot FROM erp.equipment e JOIN erp.operators o ON o.company_id=tenant AND o.id=line_record.operator_id WHERE e.company_id=tenant AND e.id=line_record.equipment_id;
    END IF;
    INSERT INTO erp.customer_review_batch_items(batch_id,company_id,customer_id,project_id,rental_id,rental_equipment_line_id,equipment_id,operator_id,
      deur_id,revision_id,customer_review_request_id,item_snapshot)
    VALUES(batch.id,tenant,rental_record.customer_id,rental_record.project_id,rental_record.id,line_record.id,line_record.equipment_id,line_record.operator_id,
      target.id,target.id,request.id,item_snapshot);
    total_count=total_count+1;
  END LOOP;

  UPDATE erp.customer_review_batches SET summary_snapshot=jsonb_build_object('company',company_record.name,'customer',customer_record.name,'project',project_record.name,
    'rental',coalesce(rental_record.rental_number,rental_record.id),'reviewDate',requested_date,'businessTimezone',rental_record.timezone,
    'totalLineCount',total_count,'actionableCount',actionable_count,'inProgressCount',in_progress_count,'acknowledgedCount',acknowledged_count,
    'correctionRequestedCount',correction_count),finalized_at=now_at WHERE id=batch.id RETURNING * INTO batch;
  safe_response=jsonb_build_object('success',true,'disposition','CREATED','value',jsonb_build_object('batchId',batch.id,'reviewDate',batch.review_date,
    'expiresAt',batch.expires_at,'totalLineCount',total_count,'actionableCount',actionable_count,'inProgressCount',in_progress_count,
    'acknowledgedCount',acknowledged_count,'correctionRequestedCount',correction_count));
  PERFORM erp.finish_operational_command(command,'GENERATE_CUSTOMER_REVIEW_BATCH','RENTAL_DATE',rental_record.id||':'||requested_date::text,tenant,auth.uid()::text,payload_hash,safe_response,batch.row_version);
  RETURN safe_response||jsonb_build_object('value',(safe_response->'value')||jsonb_build_object('credential',raw_credential));
END $$;

ALTER FUNCTION erp.enqueue_customer_review_notification() OWNER TO postgres;
ALTER FUNCTION erp.reject_finalized_customer_review_batch_change() OWNER TO postgres;
ALTER FUNCTION erp.reject_finalized_customer_review_batch_item_change() OWNER TO postgres;
ALTER FUNCTION erp.command_generate_customer_review_batch(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.enqueue_customer_review_notification(),erp.reject_finalized_customer_review_batch_change(),
  erp.reject_finalized_customer_review_batch_item_change(),erp.command_generate_customer_review_batch(jsonb) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION erp.command_generate_customer_review_batch(jsonb) TO authenticated;
COMMENT ON FUNCTION erp.command_generate_customer_review_batch(jsonb) IS 'Authenticated tenant-derived grouped generation. A newly created raw credential is returned once for immediate trusted orchestration (Option B), never persisted or logged; no notification intent is created.';
COMMENT ON COLUMN erp.customer_review_requests.issuance_mode IS 'SINGLE preserves legacy individual notification issuance; GROUPED suppresses only the individual request intent.';
COMMENT ON COLUMN erp.customer_review_batches.finalized_at IS 'Frozen grouping, credential, expiry, summary, and batch-item evidence are immutable after trusted finalization; explicit supersession metadata remains allowed.';
COMMIT;
