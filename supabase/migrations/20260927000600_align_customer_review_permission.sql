BEGIN;
-- Align customer-review issuance with the active canonical permission.
-- No role or user assignments are changed; the existing command contract,
-- idempotency, lineage, recipient snapshot, and audit behavior are retained.
CREATE OR REPLACE FUNCTION erp.command_create_customer_review_request(command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,auth,pg_catalog AS $$
DECLARE
  tenant text=current_company_id(); target deurs; line rental_equipment_lines;
  rental rentals; equipment_record equipment; operator_record operators;
  project_record projects; raw_token text; request customer_review_requests;
  now_at timestamptz=clock_timestamp();
  idem jsonb; payload_hash text; response jsonb; safe_response jsonb; review_snapshot jsonb;
  timeline jsonb; shift_start timestamptz; shift_end timestamptz;
  canonical_recipient_name text; canonical_recipient_destination text; protected_command jsonb;
BEGIN
  IF tenant IS NULL THEN RETURN jsonb_build_object('success',false,'code','UNAUTHENTICATED'); END IF;
  IF NOT current_user_has_permission('deur.customerReview.issue') THEN
    RETURN jsonb_build_object('success',false,'code','FORBIDDEN');
  END IF;
  IF jsonb_typeof(command)<>'object' OR EXISTS(
    SELECT 1 FROM jsonb_object_keys(command) key
    WHERE key NOT IN('commandId','idempotencyKey','deurId','rentalLineId','revisionId')
  ) THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;

  SELECT * INTO target FROM deurs WHERE id=command->>'deurId' AND company_id=tenant FOR UPDATE;
  SELECT * INTO line FROM rental_equipment_lines WHERE id=command->>'rentalLineId' AND company_id=tenant;
  SELECT * INTO rental FROM rentals WHERE id=target.rental_id AND company_id=tenant;
  SELECT * INTO equipment_record FROM equipment WHERE id=target.equipment_id AND company_id=tenant;
  SELECT * INTO operator_record FROM operators WHERE id=target.operator_id AND company_id=tenant;
  SELECT * INTO project_record FROM projects WHERE id=target.project_id AND company_id=tenant;

  IF target.id IS NULL OR line.id IS NULL OR rental.id IS NULL
    OR target.id IS DISTINCT FROM command->>'revisionId'
    OR target.rental_equipment_line_id IS DISTINCT FROM line.id
    OR target.status<>'Submitted' OR target.superseded_by_revision_id IS NOT NULL
    OR target.submitted_at IS NULL
    OR nullif(btrim(rental.customer_review_name_snapshot),'') IS NULL
    OR rental.customer_review_email_snapshot IS NULL
    OR rental.customer_review_email_snapshot !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    OR rental.customer_review_email_snapshot ~ E'[\\r\\n]'
    OR equipment_record.id IS NULL OR operator_record.id IS NULL
    OR EXISTS(SELECT 1 FROM deur_events started WHERE started.deur_id=target.id AND started.action='start'
      AND NOT EXISTS(SELECT 1 FROM deur_events finished WHERE finished.deur_id=started.deur_id
        AND finished.activity_type=started.activity_type AND finished.action='end' AND finished.sequence>started.sequence))
    OR EXISTS(SELECT 1 FROM customer_correction_requests correction
      WHERE correction.company_id=tenant AND correction.source_revision_id=target.id AND correction.status='Open')
  THEN RETURN jsonb_build_object('success',false,'code','INVALID_TRANSITION'); END IF;

  canonical_recipient_name=btrim(rental.customer_review_name_snapshot);
  canonical_recipient_destination=lower(btrim(rental.customer_review_email_snapshot));
  protected_command=command||jsonb_build_object('_canonicalRecipientName',canonical_recipient_name,'_canonicalRecipientDestination',canonical_recipient_destination);
  idem=begin_operational_command(protected_command,'CREATE_CUSTOMER_REVIEW','DEUR',target.id,tenant,auth.uid()::text);
  IF idem->>'state'='MISMATCH' THEN RETURN jsonb_build_object('success',false,'code','IDEMPOTENCY_MISMATCH','retryable',false); END IF;
  IF idem->>'state'='REPLAY' THEN RETURN (idem->'response')||jsonb_build_object('disposition','REPLAYED'); END IF;
  IF idem->>'state'<>'NEW' THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;
  payload_hash=idem->>'payloadHash';

  SELECT coalesce(jsonb_agg(jsonb_build_object('activity',event_rows.activity_type,'action',event_rows.action,
    'occurredAt',event_rows.occurred_at,'sequence',event_rows.sequence) ORDER BY event_rows.sequence),'[]'::jsonb)
    INTO timeline FROM deur_events event_rows WHERE event_rows.deur_id=target.id;
  SELECT min(occurred_at) FILTER(WHERE activity_type='shift' AND action='start'),
         max(occurred_at) FILTER(WHERE activity_type='shift' AND action='end')
    INTO shift_start,shift_end FROM deur_events WHERE deur_id=target.id;

  review_snapshot=jsonb_build_object('rentalReference',rental.rental_number,'customerName',canonical_recipient_name,
    'project',coalesce(project_record.name,rental.project_snapshot),'equipment',concat_ws(' - ',equipment_record.asset_no,equipment_record.equipment_name),
    'operator',operator_record.name,'workDate',target.work_date,'shift',target.shift,'shiftStart',shift_start,'shiftEnd',shift_end,
    'operationMinutes',target.total_operating_minutes,'idleMinutes',target.total_idle_minutes,
    'standbyMinutes',coalesce(target.total_standby_minutes,target.total_meal_break_minutes),
    'breakdownMinutes',target.total_maintenance_minutes,'openingMeter',target.opening_meter,'closingMeter',target.closing_meter,
    'submittedRevision',concat(coalesce(target.deur_number,'DEUR'),' R',coalesce(target.revision_number,1)),
    'submittedAt',target.submitted_at,'timeline',timeline);

  UPDATE customer_review_requests SET status='Superseded',revoked_at=now_at,superseded_at=now_at
  WHERE company_id=tenant AND status='Pending' AND (revision_id=target.id OR deur_id=target.id OR revision_id IN(
    SELECT id FROM deurs WHERE company_id=tenant AND coalesce(revision_chain_id,id)=coalesce(target.revision_chain_id,target.id)));

  raw_token=pg_catalog.encode(extensions.gen_random_bytes(32),'hex');
  INSERT INTO customer_review_requests(company_id,rental_id,rental_equipment_line_id,deur_id,revision_id,equipment_id,operator_id,customer_id,token_hash,expires_at,created_by,issued_at,recipient_name,recipient_destination,permitted_actions,revision_version,snapshot)
  VALUES(tenant,target.rental_id,line.id,target.id,target.id,target.equipment_id,target.operator_id,target.customer_id,
    pg_catalog.encode(extensions.digest(raw_token,'sha256'),'hex'),now_at+interval '7 days',auth.uid(),now_at,
    canonical_recipient_name,canonical_recipient_destination,ARRAY['ACKNOWLEDGE','REQUEST_CORRECTION'],target.row_version,review_snapshot)
  RETURNING * INTO request;

  INSERT INTO audit_log(id,company_id,aggregate_type,aggregate_id,action,actor_id,occurred_at,correlation_id,new_values)
  VALUES(extensions.gen_random_uuid()::text,tenant,'CUSTOMER_REVIEW',request.id::text,'CREATE_REQUEST',auth.uid()::text,now_at,command->>'commandId',
    jsonb_build_object('revisionId',request.revision_id,'expiresAt',request.expires_at,'recipientDestination',request.recipient_destination,
      'permittedActions',request.permitted_actions,'revisionVersion',request.revision_version));

  safe_response=jsonb_build_object('success',true,'disposition','ACCEPTED','serverOccurredAt',now_at,
    'value',jsonb_build_object('requestId',request.id,'expiresAt',request.expires_at,'notification',jsonb_build_object(
      'eventType','CUSTOMER_DEUR_REVIEW_REQUESTED','recipientDestination',request.recipient_destination,
      'customerDisplayName',request.recipient_name,'rentalReference',rental.rental_number,
      'equipmentSummary',review_snapshot->>'equipment','expiresAt',request.expires_at)));
  response=jsonb_set(safe_response,'{value,notification,reviewPath}',to_jsonb('/review/deur/'||raw_token),true);
  PERFORM finish_operational_command(protected_command,'CREATE_CUSTOMER_REVIEW','DEUR',target.id,tenant,auth.uid()::text,payload_hash,safe_response,target.row_version);
  RETURN response;
END $$;
ALTER FUNCTION erp.command_create_customer_review_request(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.command_create_customer_review_request(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION erp.command_create_customer_review_request(jsonb) TO authenticated;
COMMIT;
