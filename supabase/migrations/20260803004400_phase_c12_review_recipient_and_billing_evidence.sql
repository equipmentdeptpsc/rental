BEGIN;

SET search_path TO erp, auth, pg_catalog;

ALTER TABLE erp.users
  ADD COLUMN IF NOT EXISTS email text;

ALTER TABLE erp.users
  DROP CONSTRAINT IF EXISTS users_email_format;
ALTER TABLE erp.users
  ADD CONSTRAINT users_email_format CHECK (
    email IS NULL OR (
      length(email) BETWEEN 3 AND 254
      AND email = lower(btrim(email))
      AND email !~ E'[\\r\\n]'
      AND email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    )
  );

ALTER TABLE erp.rentals
  ADD COLUMN IF NOT EXISTS customer_review_name_snapshot text,
  ADD COLUMN IF NOT EXISTS customer_review_email_snapshot text,
  ADD COLUMN IF NOT EXISTS customer_review_contact_captured_at timestamptz;

ALTER TABLE erp.rentals
  DROP CONSTRAINT IF EXISTS rentals_customer_review_email_format;
ALTER TABLE erp.rentals
  ADD CONSTRAINT rentals_customer_review_email_format CHECK (
    customer_review_email_snapshot IS NULL OR (
      customer_review_name_snapshot IS NOT NULL
      AND length(customer_review_email_snapshot) BETWEEN 3 AND 254
      AND customer_review_email_snapshot = lower(btrim(customer_review_email_snapshot))
      AND customer_review_email_snapshot !~ E'[\\r\\n]'
      AND customer_review_email_snapshot ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    )
  );

ALTER TABLE erp.billing_statement_lines
  ADD COLUMN IF NOT EXISTS charge_breakdown jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE erp.billing_statement_lines
  DROP CONSTRAINT IF EXISTS billing_statement_lines_charge_breakdown_shape;
ALTER TABLE erp.billing_statement_lines
  ADD CONSTRAINT billing_statement_lines_charge_breakdown_shape CHECK (
    jsonb_typeof(charge_breakdown) = 'array'
  );

CREATE OR REPLACE FUNCTION erp.resolve_manager_review_recipient(target_company_id text)
RETURNS TABLE(user_id uuid, display_name text, destination text, resolution_code text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = erp, auth, pg_catalog
AS $$
DECLARE
  candidate_count integer;
BEGIN
  IF auth.uid() IS NULL OR target_company_id IS NULL OR target_company_id IS DISTINCT FROM erp.current_company_id() THEN
    RETURN QUERY SELECT NULL::uuid,NULL::text,NULL::text,'MANAGER_REVIEWER_NOT_CONFIGURED'::text;
    RETURN;
  END IF;

  SELECT count(*) INTO candidate_count
  FROM erp.users candidate
  WHERE candidate.company_id=target_company_id AND candidate.status='active'
    AND EXISTS (
      SELECT 1 FROM erp.user_roles ur
      JOIN erp.role_permissions rp ON rp.role_id=ur.role_id
      JOIN erp.app_permissions permission ON permission.id=rp.permission_id
      WHERE ur.user_id=candidate.id AND permission.code='rental.approve'
    );

  IF candidate_count=0 THEN
    RETURN QUERY SELECT NULL::uuid,NULL::text,NULL::text,'MANAGER_REVIEWER_NOT_CONFIGURED'::text;
  ELSIF candidate_count>1 THEN
    RETURN QUERY SELECT NULL::uuid,NULL::text,NULL::text,'MULTIPLE_MANAGER_REVIEWERS'::text;
  ELSE
    RETURN QUERY
    SELECT candidate.id,candidate.display_name,candidate.email,
      CASE WHEN candidate.email IS NULL THEN 'MANAGER_EMAIL_REQUIRED' ELSE 'OK' END
    FROM erp.users candidate
    WHERE candidate.company_id=target_company_id AND candidate.status='active'
      AND EXISTS (
        SELECT 1 FROM erp.user_roles ur
        JOIN erp.role_permissions rp ON rp.role_id=ur.role_id
        JOIN erp.app_permissions permission ON permission.id=rp.permission_id
        WHERE ur.user_id=candidate.id AND permission.code='rental.approve'
      );
  END IF;
END;
$$;

ALTER FUNCTION erp.resolve_manager_review_recipient(text) OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.resolve_manager_review_recipient(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION erp.resolve_manager_review_recipient(text) TO service_role;

CREATE OR REPLACE FUNCTION erp.enforce_customer_review_snapshot_recipient()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = erp, pg_catalog
AS $$
DECLARE target_rental erp.rentals;
BEGIN
  SELECT * INTO target_rental FROM erp.rentals
  WHERE id=NEW.rental_id AND company_id=NEW.company_id;
  IF target_rental.customer_review_email_snapshot IS NULL THEN
    RAISE EXCEPTION 'CUSTOMER_EMAIL_REQUIRED' USING ERRCODE='22023';
  END IF;
  NEW.recipient_name=target_rental.customer_review_name_snapshot;
  NEW.recipient_destination=target_rental.customer_review_email_snapshot;
  RETURN NEW;
END;
$$;
ALTER FUNCTION erp.enforce_customer_review_snapshot_recipient() OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.enforce_customer_review_snapshot_recipient() FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS customer_review_snapshot_recipient ON erp.customer_review_requests;
CREATE TRIGGER customer_review_snapshot_recipient BEFORE INSERT ON erp.customer_review_requests
FOR EACH ROW EXECUTE FUNCTION erp.enforce_customer_review_snapshot_recipient();

CREATE OR REPLACE FUNCTION erp.enforce_manager_review_user_recipient()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = erp, pg_catalog
AS $$
DECLARE resolved record;
BEGIN
  SELECT * INTO resolved FROM erp.resolve_manager_review_recipient(NEW.company_id);
  IF resolved.resolution_code<>'OK' THEN
    RAISE EXCEPTION '%',resolved.resolution_code USING ERRCODE='22023';
  END IF;
  NEW.recipient_user_id=resolved.user_id;
  NEW.recipient_name=resolved.display_name;
  NEW.recipient_destination=resolved.destination;
  RETURN NEW;
END;
$$;
ALTER FUNCTION erp.enforce_manager_review_user_recipient() OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.enforce_manager_review_user_recipient() FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS manager_review_user_recipient ON erp.manager_review_requests;
CREATE TRIGGER manager_review_user_recipient BEFORE INSERT ON erp.manager_review_requests
FOR EACH ROW EXECUTE FUNCTION erp.enforce_manager_review_user_recipient();

-- Canonical recipient authority is resolved inside the trusted command before
-- idempotency and persistence. Triggers above remain defense-in-depth only.
CREATE OR REPLACE FUNCTION command_create_customer_review_request(command jsonb)
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
  IF NOT current_user_has_permission('deur.review') THEN
    RETURN jsonb_build_object('success',false,'code','FORBIDDEN');
  END IF;
  IF jsonb_typeof(command)<>'object' OR EXISTS(
    SELECT 1 FROM jsonb_object_keys(command) key
    WHERE key NOT IN('commandId','idempotencyKey','deurId','rentalLineId','revisionId')
  ) THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;

  SELECT * INTO target FROM deurs
    WHERE id=command->>'deurId' AND company_id=tenant FOR UPDATE;
  SELECT * INTO line FROM rental_equipment_lines
    WHERE id=command->>'rentalLineId' AND company_id=tenant;
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
    OR EXISTS(
      SELECT 1 FROM deur_events started
      WHERE started.deur_id=target.id AND started.action='start'
        AND NOT EXISTS(
          SELECT 1 FROM deur_events finished
          WHERE finished.deur_id=started.deur_id
            AND finished.activity_type=started.activity_type
            AND finished.action='end' AND finished.sequence>started.sequence
        )
    )
    OR EXISTS(
      SELECT 1 FROM customer_correction_requests correction
      WHERE correction.company_id=tenant AND correction.source_revision_id=target.id
        AND correction.status='Open'
    )
  THEN RETURN jsonb_build_object('success',false,'code','INVALID_TRANSITION'); END IF;

  canonical_recipient_name=btrim(rental.customer_review_name_snapshot);
  canonical_recipient_destination=lower(btrim(rental.customer_review_email_snapshot));
  protected_command=command||jsonb_build_object(
    '_canonicalRecipientName',canonical_recipient_name,
    '_canonicalRecipientDestination',canonical_recipient_destination
  );
  idem=begin_operational_command(protected_command,'CREATE_CUSTOMER_REVIEW','DEUR',target.id,tenant,auth.uid()::text);
  IF idem->>'state'='MISMATCH' THEN
    RETURN jsonb_build_object('success',false,'code','IDEMPOTENCY_MISMATCH','retryable',false);
  END IF;
  IF idem->>'state'='REPLAY' THEN
    RETURN (idem->'response')||jsonb_build_object('disposition','REPLAYED');
  END IF;
  IF idem->>'state'<>'NEW' THEN
    RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED');
  END IF;
  payload_hash=idem->>'payloadHash';

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'activity',event_rows.activity_type,'action',event_rows.action,
    'occurredAt',event_rows.occurred_at,'sequence',event_rows.sequence
  ) ORDER BY event_rows.sequence),'[]'::jsonb)
  INTO timeline FROM deur_events event_rows WHERE event_rows.deur_id=target.id;
  SELECT min(occurred_at) FILTER(WHERE activity_type='shift' AND action='start'),
         max(occurred_at) FILTER(WHERE activity_type='shift' AND action='end')
  INTO shift_start,shift_end FROM deur_events WHERE deur_id=target.id;

  review_snapshot=jsonb_build_object(
    'rentalReference',rental.rental_number,
    'customerName',canonical_recipient_name,
    'project',coalesce(project_record.name,rental.project_snapshot),
    'equipment',concat_ws(' - ',equipment_record.asset_no,equipment_record.equipment_name),
    'operator',operator_record.name,
    'workDate',target.work_date,
    'shift',target.shift,
    'shiftStart',shift_start,
    'shiftEnd',shift_end,
    'operationMinutes',target.total_operating_minutes,
    'idleMinutes',target.total_idle_minutes,
    'standbyMinutes',coalesce(target.total_standby_minutes,target.total_meal_break_minutes),
    'breakdownMinutes',target.total_maintenance_minutes,
    'openingMeter',target.opening_meter,
    'closingMeter',target.closing_meter,
    'submittedRevision',concat(coalesce(target.deur_number,'DEUR'),' R',coalesce(target.revision_number,1)),
    'submittedAt',target.submitted_at,
    'timeline',timeline
  );

  UPDATE customer_review_requests
  SET status='Superseded',revoked_at=now_at,superseded_at=now_at
  WHERE company_id=tenant AND status='Pending'
    AND (
      revision_id=target.id
      OR deur_id=target.id
      OR revision_id IN(
        SELECT id FROM deurs
        WHERE company_id=tenant
          AND coalesce(revision_chain_id,id)=coalesce(target.revision_chain_id,target.id)
      )
    );

  raw_token=pg_catalog.encode(extensions.gen_random_bytes(32),'hex');
  INSERT INTO customer_review_requests(
    company_id,rental_id,rental_equipment_line_id,deur_id,revision_id,equipment_id,
    operator_id,customer_id,token_hash,expires_at,created_by,issued_at,
    recipient_name,recipient_destination,permitted_actions,revision_version,snapshot
  ) VALUES(
    tenant,target.rental_id,line.id,target.id,target.id,target.equipment_id,
    target.operator_id,target.customer_id,
    pg_catalog.encode(extensions.digest(raw_token,'sha256'),'hex'),
    now_at+interval '7 days',auth.uid(),now_at,canonical_recipient_name,canonical_recipient_destination,
    ARRAY['ACKNOWLEDGE','REQUEST_CORRECTION'],target.row_version,review_snapshot
  ) RETURNING * INTO request;

  INSERT INTO audit_log(
    id,company_id,aggregate_type,aggregate_id,action,actor_id,occurred_at,
    correlation_id,new_values
  ) VALUES(
    extensions.gen_random_uuid()::text,tenant,'CUSTOMER_REVIEW',request.id::text,
    'CREATE_REQUEST',auth.uid()::text,now_at,command->>'commandId',
    jsonb_build_object('revisionId',request.revision_id,'expiresAt',request.expires_at,
      'recipientDestination',request.recipient_destination,
      'permittedActions',request.permitted_actions,'revisionVersion',request.revision_version)
  );

  safe_response=jsonb_build_object(
    'success',true,'disposition','ACCEPTED','serverOccurredAt',now_at,
    'value',jsonb_build_object('requestId',request.id,'expiresAt',request.expires_at,
      'notification',jsonb_build_object(
        'eventType','CUSTOMER_DEUR_REVIEW_REQUESTED',
        'recipientDestination',request.recipient_destination,
        'customerDisplayName',request.recipient_name,
        'rentalReference',rental.rental_number,
        'equipmentSummary',review_snapshot->>'equipment',
        'expiresAt',request.expires_at
      )
    )
  );
  response=jsonb_set(safe_response,'{value,notification,reviewPath}',
    to_jsonb('/review/deur/'||raw_token),true);
  PERFORM finish_operational_command(
    protected_command,'CREATE_CUSTOMER_REVIEW','DEUR',target.id,tenant,auth.uid()::text,
    payload_hash,safe_response,target.row_version
  );
  RETURN response;
END $$;

ALTER FUNCTION erp.command_create_customer_review_request(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.command_create_customer_review_request(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION erp.command_create_customer_review_request(jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION command_create_manager_review_request(command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,auth,pg_catalog AS $$
DECLARE
  tenant text=current_company_id(); target deurs; rental rentals;
  line rental_equipment_lines; recipient users; equipment_record equipment;
  operator_record operators; project_record projects; raw_token text;
  request manager_review_requests; now_at timestamptz=clock_timestamp();
  idem jsonb; payload_hash text; safe_response jsonb; response jsonb; review_snapshot jsonb;
  correction_history jsonb; review_history jsonb; resolved record; protected_command jsonb;
BEGIN
  IF tenant IS NULL THEN RETURN jsonb_build_object('success',false,'code','UNAUTHENTICATED'); END IF;
  IF NOT current_user_has_permission('rental.approve') THEN
    RETURN jsonb_build_object('success',false,'code','FORBIDDEN');
  END IF;
  IF jsonb_typeof(command)<>'object' OR EXISTS(
    SELECT 1 FROM jsonb_object_keys(command) key
    WHERE key NOT IN('commandId','idempotencyKey','deurId','rentalLineId','revisionId')
  ) THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;

  SELECT * INTO target FROM deurs WHERE id=command->>'deurId' AND company_id=tenant FOR UPDATE;
  SELECT * INTO rental FROM rentals WHERE id=target.rental_id AND company_id=tenant;
  SELECT * INTO line FROM rental_equipment_lines
    WHERE id=command->>'rentalLineId' AND company_id=tenant;
  SELECT * INTO equipment_record FROM equipment
    WHERE id=line.equipment_id AND company_id=tenant;
  SELECT * INTO operator_record FROM operators
    WHERE id=line.operator_id AND company_id=tenant;
  SELECT * INTO project_record FROM projects
    WHERE id=rental.project_id AND company_id=tenant;
  IF target.id IS NULL OR rental.id IS NULL OR line.id IS NULL
    OR equipment_record.id IS NULL OR operator_record.id IS NULL
    OR target.id IS DISTINCT FROM command->>'revisionId'
    OR target.rental_equipment_line_id IS DISTINCT FROM line.id
    OR target.status<>'Submitted' OR target.superseded_by_revision_id IS NOT NULL
    OR target.submitted_at IS NULL OR target.manager_review_status IN('Approved','Rejected','CorrectionRequested')
  THEN RETURN jsonb_build_object('success',false,'code','INVALID_TRANSITION'); END IF;

  SELECT * INTO resolved FROM resolve_manager_review_recipient(tenant);
  IF resolved.resolution_code IS DISTINCT FROM 'OK'
    OR resolved.user_id IS NULL OR nullif(btrim(resolved.display_name),'') IS NULL
    OR resolved.destination IS NULL
    OR resolved.destination !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    OR resolved.destination ~ E'[\\r\\n]'
  THEN
    RETURN jsonb_build_object('success',false,'code',coalesce(resolved.resolution_code,'MANAGER_REVIEWER_NOT_CONFIGURED'));
  END IF;
  SELECT * INTO recipient FROM users WHERE id=resolved.user_id AND company_id=tenant AND status='active';
  IF recipient.id IS NULL THEN RETURN jsonb_build_object('success',false,'code','MANAGER_REVIEWER_NOT_CONFIGURED'); END IF;
  protected_command=command||jsonb_build_object(
    '_canonicalRecipientUserId',resolved.user_id,
    '_canonicalRecipientDestination',lower(btrim(resolved.destination))
  );
  idem=begin_operational_command(protected_command,'CREATE_MANAGER_REVIEW','DEUR',target.id,tenant,auth.uid()::text);
  IF idem->>'state'='MISMATCH' THEN RETURN jsonb_build_object('success',false,'code','IDEMPOTENCY_MISMATCH'); END IF;
  IF idem->>'state'='REPLAY' THEN RETURN (idem->'response')||jsonb_build_object('disposition','REPLAYED'); END IF;
  IF idem->>'state'<>'NEW' THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;
  payload_hash=idem->>'payloadHash';

  UPDATE manager_review_requests SET status='Superseded',revoked_at=now_at,superseded_at=now_at
  WHERE company_id=tenant AND status='Pending' AND revision_id IN(
    SELECT id FROM deurs WHERE company_id=tenant
      AND coalesce(revision_chain_id,id)=coalesce(target.revision_chain_id,target.id)
  );
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'revision',d.revision_number,'reasonCode',d.correction_reason_code,
    'reason',d.correction_reason_details,'correctedAt',d.corrected_at
  ) ORDER BY d.revision_number),'[]'::jsonb)
  INTO correction_history FROM deurs d WHERE d.company_id=tenant
    AND coalesce(d.revision_chain_id,d.id)=coalesce(target.revision_chain_id,target.id);
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'action',h.action,'actor',h.actor_name,'occurredAt',h.occurred_at,'reason',h.reason
  ) ORDER BY h.occurred_at),'[]'::jsonb)
  INTO review_history FROM deur_review_history h WHERE h.company_id=tenant AND h.deur_id=target.id;
  review_snapshot=jsonb_build_object(
    'rentalReference',rental.rental_number,
    'project',coalesce(project_record.name,rental.project_snapshot),
    'equipment',concat_ws(' - ',equipment_record.asset_no,equipment_record.equipment_name),
    'operator',operator_record.name,'workDate',target.work_date,
    'shift',target.shift,'submittedRevision',concat(coalesce(target.deur_number,'DEUR'),' R',coalesce(target.revision_number,1)),
    'operationMinutes',target.total_operating_minutes,'idleMinutes',target.total_idle_minutes,
    'standbyMinutes',target.total_standby_minutes,'breakdownMinutes',target.total_maintenance_minutes,
    'openingMeter',target.opening_meter,'closingMeter',target.closing_meter,
    'correctionHistory',correction_history,'reviewHistory',review_history,
    'billingEligible',target.status='Acknowledged' AND NOT target.billing_locked
  );
  raw_token=pg_catalog.encode(extensions.gen_random_bytes(32),'hex');
  INSERT INTO manager_review_requests(
    company_id,rental_id,rental_equipment_line_id,deur_id,revision_id,recipient_user_id,
    recipient_name,recipient_destination,token_hash,revision_version,snapshot,expires_at,created_by
  ) VALUES(
    tenant,target.rental_id,line.id,target.id,target.id,recipient.id,recipient.display_name,
    lower(btrim(resolved.destination)),pg_catalog.encode(extensions.digest(raw_token,'sha256'),'hex'),
    target.row_version,review_snapshot,now_at+interval '48 hours',auth.uid()
  ) RETURNING * INTO request;
  UPDATE deurs SET manager_review_status='Pending' WHERE id=target.id RETURNING * INTO target;
  INSERT INTO audit_log(id,company_id,aggregate_type,aggregate_id,action,actor_id,occurred_at,correlation_id,new_values)
  VALUES(extensions.gen_random_uuid()::text,tenant,'MANAGER_REVIEW',request.id::text,'CREATE_REQUEST',
    auth.uid()::text,now_at,command->>'commandId',jsonb_build_object(
      'revisionId',request.revision_id,'recipientUserId',request.recipient_user_id,
      'expiresAt',request.expires_at,'permittedActions',request.permitted_actions));
  safe_response=jsonb_build_object('success',true,'disposition','ACCEPTED','serverOccurredAt',now_at,
    'value',jsonb_build_object('expiresAt',request.expires_at,'notification',jsonb_build_object(
      'eventType','MANAGER_DEUR_REVIEW_ISSUED','recipientDestination',request.recipient_destination,
      'managerDisplayName',request.recipient_name,'rentalReference',rental.rental_number,
      'expiresAt',request.expires_at)));
  response=jsonb_set(safe_response,'{value,notification,reviewPath}',to_jsonb('/review/manager/'||raw_token),true);
  PERFORM finish_operational_command(protected_command,'CREATE_MANAGER_REVIEW','DEUR',target.id,tenant,
    auth.uid()::text,payload_hash,safe_response,target.row_version);
  RETURN response;
EXCEPTION WHEN invalid_text_representation THEN
  RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED');
END $$;

ALTER FUNCTION erp.command_create_manager_review_request(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.command_create_manager_review_request(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION erp.command_create_manager_review_request(jsonb) TO authenticated;

COMMIT;
