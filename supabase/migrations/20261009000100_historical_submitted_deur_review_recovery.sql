BEGIN;
SET search_path=erp,auth,extensions,pg_catalog;

-- A separate administrative path for an initial Submitted DEUR whose original
-- work date has left the normal grouped-review window. The normal generator is
-- deliberately unchanged. The caller supplies only the DEUR and command keys.
CREATE FUNCTION erp.command_recover_submitted_deur_customer_review(command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,auth,extensions,pg_catalog AS $$
DECLARE
  tenant text:=erp.current_company_id(); actor uuid:=auth.uid();
  target erp.deurs; rental erp.rentals; line erp.rental_equipment_lines;
  company_record erp.companies; customer_record erp.customers; project_record erp.projects;
  equipment_record erp.equipment; operator_record erp.operators;
  batch erp.customer_review_batches; request erp.customer_review_requests; intent erp.notification_outbox;
  idem jsonb; payload_hash text; response jsonb; now_at timestamptz:=clock_timestamp();
  recipient_name text; recipient_destination text; identity text; timeline jsonb;
  shift_start timestamptz; shift_end timestamptz; request_snapshot jsonb; item_snapshot jsonb;
  summary_payload jsonb; notification_payload jsonb;
BEGIN
  IF tenant IS NULL OR actor IS NULL THEN RETURN jsonb_build_object('success',false,'code','UNAUTHENTICATED'); END IF;
  IF NOT erp.current_user_has_permission('deur.customerReview.issue') THEN
    RETURN jsonb_build_object('success',false,'code','FORBIDDEN');
  END IF;
  IF jsonb_typeof(command)<>'object' OR EXISTS(
    SELECT 1 FROM jsonb_object_keys(command) key WHERE key NOT IN('commandId','idempotencyKey','deurId')
  ) OR nullif(btrim(command->>'commandId'),'') IS NULL
    OR nullif(btrim(command->>'idempotencyKey'),'') IS NULL
    OR coalesce(command->>'deurId','') !~ '^[0-9a-f-]{36}$'
  THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;

  -- The row lock serializes different actors and idempotency keys for one DEUR.
  SELECT * INTO target FROM erp.deurs
  WHERE id=command->>'deurId' AND company_id=tenant FOR UPDATE;
  IF target.id IS NULL THEN RETURN jsonb_build_object('success',false,'code','NOT_FOUND'); END IF;
  idem:=erp.begin_operational_command(command,'RECOVER_SUBMITTED_DEUR_CUSTOMER_REVIEW','DEUR',target.id,tenant,actor::text);
  IF idem->>'state'='MISMATCH' THEN RETURN jsonb_build_object('success',false,'code','IDEMPOTENCY_MISMATCH'); END IF;
  IF idem->>'state'='REPLAY' THEN RETURN (idem->'response')||jsonb_build_object('disposition','REPLAYED'); END IF;
  IF idem->>'state'<>'NEW' THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;
  payload_hash:=idem->>'payloadHash';

  IF target.status<>'Submitted' OR target.acknowledged_at IS NOT NULL
    OR target.submitted_at IS NULL OR target.superseded_by_revision_id IS NOT NULL
    OR target.previous_revision_id IS NOT NULL OR coalesce(target.revision_number,1)<>1
  THEN RETURN jsonb_build_object('success',false,'code','DEUR_NOT_RECOVERABLE'); END IF;

  SELECT * INTO rental FROM erp.rentals
  WHERE id=target.rental_id AND company_id=tenant;
  SELECT * INTO line FROM erp.rental_equipment_lines
  WHERE id=target.rental_equipment_line_id AND rental_id=target.rental_id AND company_id=tenant AND deleted_at IS NULL;
  IF rental.id IS NULL OR line.id IS NULL
    OR target.customer_id IS DISTINCT FROM rental.customer_id
    OR target.project_id IS DISTINCT FROM rental.project_id
    OR target.equipment_id IS DISTINCT FROM line.equipment_id
    OR nullif(btrim(rental.timezone),'') IS NULL
    OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name=rental.timezone)
  THEN RETURN jsonb_build_object('success',false,'code','RENTAL_CONTEXT_INVALID'); END IF;
  IF target.work_date IS NULL OR target.work_date >= (now_at AT TIME ZONE rental.timezone)::date THEN
    RETURN jsonb_build_object('success',false,'code','NORMAL_DATE_WINDOW');
  END IF;
  recipient_name:=btrim(coalesce(rental.customer_review_name_snapshot,''));
  recipient_destination:=lower(btrim(coalesce(rental.customer_review_email_snapshot,'')));
  IF length(recipient_name) NOT BETWEEN 1 AND 200
    OR recipient_name ~ '[\r\n]' OR length(recipient_destination) NOT BETWEEN 3 AND 254
    OR recipient_destination !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    OR recipient_destination ~ '[\r\n]'
  THEN RETURN jsonb_build_object('success',false,'code','RECIPIENT_UNAVAILABLE'); END IF;

  -- An existing request is never reissued, regardless of its lifecycle status.
  IF EXISTS(SELECT 1 FROM erp.customer_review_requests existing
    WHERE existing.company_id=tenant AND (existing.deur_id=target.id OR existing.revision_id=target.id))
  THEN RETURN jsonb_build_object('success',true,'disposition','ALREADY_EXISTS','reason','REVIEW_REQUEST_PRESENT'); END IF;
  IF EXISTS(SELECT 1 FROM erp.customer_review_batch_items existing
    WHERE existing.company_id=tenant AND (existing.deur_id=target.id OR existing.revision_id=target.id))
    OR EXISTS(SELECT 1 FROM erp.customer_review_batches existing
      WHERE existing.company_id=tenant AND existing.rental_id=rental.id AND existing.review_date=target.work_date)
    OR EXISTS(SELECT 1 FROM erp.notification_outbox existing
      WHERE existing.company_id=tenant AND (existing.deur_revision_reference=target.id
        OR existing.idempotency_key='customer-grouped-review:'||target.id||':submit-v1'))
  THEN RETURN jsonb_build_object('success',false,'code','RECOVERY_INTEGRITY'); END IF;

  SELECT * INTO company_record FROM erp.companies WHERE id=tenant AND active;
  SELECT * INTO customer_record FROM erp.customers WHERE id=rental.customer_id AND company_id=tenant;
  SELECT * INTO project_record FROM erp.projects WHERE id=rental.project_id AND company_id=tenant;
  SELECT * INTO equipment_record FROM erp.equipment WHERE id=line.equipment_id AND company_id=tenant;
  SELECT * INTO operator_record FROM erp.operators WHERE id=line.operator_id AND company_id=tenant;
  IF company_record.id IS NULL OR customer_record.id IS NULL OR project_record.id IS NULL
    OR equipment_record.id IS NULL OR operator_record.id IS NULL
  THEN RETURN jsonb_build_object('success',false,'code','RENTAL_CONTEXT_INVALID'); END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object('activity',event.activity_type,'action',event.action,
      'occurredAt',event.occurred_at,'sequence',event.sequence) ORDER BY event.sequence),'[]'::jsonb),
    min(event.occurred_at) FILTER(WHERE event.activity_type='shift' AND event.action='start'),
    max(event.occurred_at) FILTER(WHERE event.activity_type='shift' AND event.action='end')
  INTO timeline,shift_start,shift_end FROM erp.deur_events event WHERE event.deur_id=target.id;
  request_snapshot:=jsonb_build_object('rentalReference',rental.rental_number,'customerName',recipient_name,
    'project',project_record.name,'equipment',concat_ws(' - ',equipment_record.asset_no,equipment_record.equipment_name),
    'operator',operator_record.name,'workDate',target.work_date,'shift',target.shift,
    'shiftStart',shift_start,'shiftEnd',shift_end,'operationMinutes',target.total_operating_minutes,
    'idleMinutes',target.total_idle_minutes,'standbyMinutes',coalesce(target.total_standby_minutes,target.total_meal_break_minutes),
    'breakdownMinutes',target.total_maintenance_minutes,'openingMeter',target.opening_meter,'closingMeter',target.closing_meter,
    'submittedRevision',concat(coalesce(target.deur_number,'DEUR'),' R',coalesce(target.revision_number,1)),
    'submittedAt',target.submitted_at,'timeline',timeline);
  item_snapshot:=jsonb_strip_nulls(jsonb_build_object('equipmentName',equipment_record.equipment_name,
    'assetNumber',equipment_record.asset_no,'operator',operator_record.name,'deurNumber',target.deur_number,
    'revisionLabel','R'||coalesce(target.revision_number,1)::text,'workDate',target.work_date,'shift',target.shift,
    'shiftStart',shift_start,'shiftEnd',shift_end,'operationMinutes',target.total_operating_minutes,
    'idleMinutes',target.total_idle_minutes,'standbyMinutes',coalesce(target.total_standby_minutes,target.total_meal_break_minutes),
    'breakdownMinutes',target.total_maintenance_minutes,'openingMeter',target.opening_meter,'closingMeter',target.closing_meter,
    'timeline',timeline,'reviewState','SUBMITTED_AWAITING_ACKNOWLEDGEMENT'));
  summary_payload:=jsonb_build_object('company',company_record.name,'customer',customer_record.name,
    'project',project_record.name,'rental',coalesce(rental.rental_number,rental.id),'reviewDate',target.work_date,
    'businessTimezone',rental.timezone,'totalLineCount',1,'actionableCount',1,
    'inProgressCount',0,'acknowledgedCount',0,'correctionRequestedCount',0);

  -- A random digest reserves the batch credential slot. The existing worker
  -- replaces it with the encrypted delivery path's hash before claiming mail.
  INSERT INTO erp.customer_review_batches(company_id,customer_id,project_id,rental_id,review_date,
    business_timezone,credential_hash,expires_at,summary_snapshot)
  VALUES(tenant,rental.customer_id,rental.project_id,rental.id,target.work_date,rental.timezone,
    pg_catalog.encode(extensions.digest(extensions.gen_random_bytes(32),'sha256'),'hex'),
    now_at+interval '7 days','{}'::jsonb) RETURNING * INTO batch;
  INSERT INTO erp.customer_review_requests(company_id,rental_id,rental_equipment_line_id,deur_id,revision_id,
    equipment_id,operator_id,customer_id,token_hash,expires_at,created_by,issued_at,recipient_name,
    recipient_destination,permitted_actions,revision_version,snapshot,issuance_mode)
  VALUES(tenant,rental.id,line.id,target.id,target.id,target.equipment_id,target.operator_id,target.customer_id,
    pg_catalog.encode(extensions.digest(extensions.gen_random_bytes(32),'sha256'),'hex'),
    now_at+interval '7 days',actor,now_at,recipient_name,recipient_destination,
    ARRAY['ACKNOWLEDGE','REQUEST_CORRECTION'],target.row_version,request_snapshot,'GROUPED') RETURNING * INTO request;
  INSERT INTO erp.customer_review_batch_items(batch_id,company_id,customer_id,project_id,rental_id,
    rental_equipment_line_id,equipment_id,operator_id,deur_id,revision_id,customer_review_request_id,item_snapshot)
  VALUES(batch.id,tenant,rental.customer_id,rental.project_id,rental.id,line.id,line.equipment_id,line.operator_id,
    target.id,target.id,request.id,item_snapshot);
  UPDATE erp.customer_review_batches SET summary_snapshot=summary_payload,finalized_at=now_at
  WHERE id=batch.id RETURNING * INTO batch;

  identity:='customer-grouped-review:'||target.id||':submit-v1';
  notification_payload:=jsonb_build_object('recipientName',recipient_name,'companyName',company_record.name,
    'customerName',customer_record.name,'projectName',project_record.name,
    'rentalReference',coalesce(rental.rental_number,rental.id),'reviewDate',batch.review_date,
    'expirationLabel',batch.expires_at,'totalLineCount',1,'actionableCount',1,
    'inProgressCount',0,'acknowledgedCount',0);
  INSERT INTO erp.notification_outbox(company_id,notification_type,recipient_destination,recipient_display_name,
    source_aggregate_type,source_aggregate_id,template_version,idempotency_key,payload_fingerprint,
    template_payload,requires_review_credential)
  VALUES(tenant,'CUSTOMER_GROUPED_REVIEW_REQUESTED',recipient_destination,recipient_name,
    'CUSTOMER_REVIEW_BATCH',batch.id::text,3,identity,
    pg_catalog.encode(extensions.digest(identity||'|'||recipient_destination||'|CUSTOMER_GROUPED_REVIEW_REQUESTED','sha256'),'hex'),
    notification_payload,true) RETURNING * INTO intent;

  response:=jsonb_build_object('success',true,'disposition','CREATED','value',
    jsonb_build_object('deurId',target.id,'reviewRequestId',request.id,'batchId',batch.id,
      'notificationIntentId',intent.id,'reviewDate',batch.review_date));
  RETURN erp.finish_operational_command(command,'RECOVER_SUBMITTED_DEUR_CUSTOMER_REVIEW','DEUR',target.id,
    tenant,actor::text,payload_hash,response,target.row_version);
END $$;

ALTER FUNCTION erp.command_recover_submitted_deur_customer_review(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.command_recover_submitted_deur_customer_review(jsonb)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION erp.command_recover_submitted_deur_customer_review(jsonb) TO authenticated;
COMMENT ON FUNCTION erp.command_recover_submitted_deur_customer_review(jsonb) IS
  'Permission-gated, tenant-derived, idempotent historical initial Submitted DEUR review recovery. Creates one grouped request, item, batch, and pending outbox intent without direct delivery.';

COMMIT;
