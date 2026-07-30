BEGIN;
SET search_path TO erp, auth, pg_catalog;

ALTER TABLE customer_review_requests
  ADD COLUMN issued_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  ADD COLUMN recipient_name text,
  ADD COLUMN recipient_destination text,
  ADD COLUMN permitted_actions text[] NOT NULL DEFAULT ARRAY['ACKNOWLEDGE','REQUEST_CORRECTION']::text[],
  ADD COLUMN revision_version bigint,
  ADD COLUMN snapshot jsonb,
  ADD COLUMN superseded_at timestamptz,
  ADD COLUMN superseded_by_request_id uuid REFERENCES customer_review_requests(id);

UPDATE customer_review_requests r
SET recipient_name=coalesce(r.customer_name,c.name),
    recipient_destination=c.email,
    revision_version=d.row_version,
    snapshot=jsonb_build_object(
      'rentalReference',rt.rental_number,
      'customerName',c.name,
      'project',rt.project_snapshot,
      'equipment',concat_ws(' ',e.asset_no,e.equipment_name),
      'operator',o.name,
      'workDate',d.work_date,
      'shift',d.shift,
      'operationMinutes',d.total_operating_minutes,
      'idleMinutes',d.total_idle_minutes,
      'standbyMinutes',coalesce(d.total_standby_minutes,d.total_meal_break_minutes),
      'breakdownMinutes',d.total_maintenance_minutes,
      'openingMeter',d.opening_meter,
      'closingMeter',d.closing_meter,
      'submittedRevision',concat(coalesce(d.deur_number,'DEUR'),' R',coalesce(d.revision_number,1)),
      'submittedAt',d.submitted_at
    )
FROM customers c, deurs d, rentals rt, equipment e, operators o
WHERE c.id=r.customer_id AND c.company_id=r.company_id
  AND d.id=r.revision_id AND d.company_id=r.company_id
  AND rt.id=r.rental_id AND rt.company_id=r.company_id
  AND e.id=r.equipment_id AND e.company_id=r.company_id
  AND o.id=r.operator_id AND o.company_id=r.company_id
  AND (r.recipient_name IS NULL OR r.recipient_destination IS NULL
    OR r.revision_version IS NULL OR r.snapshot IS NULL);

ALTER TABLE customer_review_requests
  DROP CONSTRAINT customer_review_requests_status_check;
ALTER TABLE customer_review_requests
  ADD CONSTRAINT customer_review_requests_status_check
  CHECK(status IN('Pending','Acknowledged','CorrectionRequested','Revoked','Expired','Superseded'));
ALTER TABLE customer_review_requests
  ADD CONSTRAINT customer_review_requests_permitted_actions_check
  CHECK(permitted_actions=ARRAY['ACKNOWLEDGE','REQUEST_CORRECTION']::text[]),
  ADD CONSTRAINT customer_review_requests_recipient_check
  CHECK(recipient_name IS NULL OR length(btrim(recipient_name)) BETWEEN 1 AND 200),
  ADD CONSTRAINT customer_review_requests_destination_check
  CHECK(recipient_destination IS NULL OR length(recipient_destination) BETWEEN 3 AND 320);

CREATE TABLE customer_review_outcomes (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  company_id text NOT NULL REFERENCES companies(id),
  review_request_id uuid NOT NULL UNIQUE REFERENCES customer_review_requests(id),
  rental_id text NOT NULL,
  deur_id text NOT NULL,
  revision_id text NOT NULL,
  action text NOT NULL CHECK(action IN('ACKNOWLEDGE','REQUEST_CORRECTION')),
  customer_reason text,
  recipient_name text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT customer_review_outcomes_reason_check CHECK(
    (action='ACKNOWLEDGE' AND customer_reason IS NULL)
    OR (action='REQUEST_CORRECTION' AND length(customer_reason) BETWEEN 10 AND 1000)
  ),
  CONSTRAINT customer_review_outcomes_rental_fk FOREIGN KEY(company_id,rental_id)
    REFERENCES rentals(company_id,id),
  CONSTRAINT customer_review_outcomes_deur_fk FOREIGN KEY(company_id,deur_id)
    REFERENCES deurs(company_id,id),
  CONSTRAINT customer_review_outcomes_revision_fk FOREIGN KEY(company_id,revision_id)
    REFERENCES deurs(company_id,id)
);

CREATE TABLE customer_correction_requests (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  company_id text NOT NULL REFERENCES companies(id),
  review_request_id uuid NOT NULL UNIQUE REFERENCES customer_review_requests(id),
  source_revision_id text NOT NULL,
  customer_reason text NOT NULL CHECK(length(customer_reason) BETWEEN 10 AND 1000),
  status text NOT NULL DEFAULT 'Open' CHECK(status IN('Open','Resolved','Cancelled')),
  resulting_revision_id text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  resolved_at timestamptz,
  CONSTRAINT customer_correction_source_fk FOREIGN KEY(company_id,source_revision_id)
    REFERENCES deurs(company_id,id),
  CONSTRAINT customer_correction_result_fk FOREIGN KEY(company_id,resulting_revision_id)
    REFERENCES deurs(company_id,id),
  CONSTRAINT customer_correction_resolution_check CHECK(
    (status='Open' AND resulting_revision_id IS NULL AND resolved_at IS NULL)
    OR (status<>'Open' AND resolved_at IS NOT NULL)
  )
);
CREATE INDEX ix_customer_correction_open
  ON customer_correction_requests(company_id,status,created_at) WHERE status='Open';

CREATE FUNCTION reject_customer_review_evidence_change()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
  RAISE EXCEPTION 'customer review evidence is immutable' USING ERRCODE='55000';
END $$;
CREATE TRIGGER customer_review_outcomes_immutable
  BEFORE UPDATE OR DELETE ON customer_review_outcomes
  FOR EACH ROW EXECUTE FUNCTION reject_customer_review_evidence_change();

CREATE FUNCTION protect_customer_correction_evidence()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
  IF OLD.company_id IS DISTINCT FROM NEW.company_id
    OR OLD.review_request_id IS DISTINCT FROM NEW.review_request_id
    OR OLD.source_revision_id IS DISTINCT FROM NEW.source_revision_id
    OR OLD.customer_reason IS DISTINCT FROM NEW.customer_reason
    OR OLD.created_at IS DISTINCT FROM NEW.created_at
  THEN RAISE EXCEPTION 'customer correction source evidence is immutable' USING ERRCODE='55000';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER customer_correction_source_immutable
  BEFORE UPDATE ON customer_correction_requests
  FOR EACH ROW EXECUTE FUNCTION protect_customer_correction_evidence();

ALTER TABLE customer_review_outcomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_correction_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON customer_review_outcomes,customer_correction_requests
  FROM PUBLIC,anon,authenticated,service_role;

DROP FUNCTION public_reject_customer_review(jsonb);
DROP FUNCTION public_acknowledge_customer_review(jsonb);
DROP FUNCTION decide_public_customer_review(jsonb,text);

CREATE OR REPLACE FUNCTION command_create_customer_review_request(command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,auth,pg_catalog AS $$
DECLARE
  tenant text=current_company_id(); target deurs; line rental_equipment_lines;
  rental rentals; customer customers; equipment_record equipment; operator_record operators;
  project_record projects; raw_token text; request customer_review_requests;
  now_at timestamptz=clock_timestamp();
  idem jsonb; payload_hash text; response jsonb; safe_response jsonb; review_snapshot jsonb;
  timeline jsonb; shift_start timestamptz; shift_end timestamptz;
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
  SELECT * INTO customer FROM customers WHERE id=target.customer_id AND company_id=tenant;
  SELECT * INTO equipment_record FROM equipment WHERE id=target.equipment_id AND company_id=tenant;
  SELECT * INTO operator_record FROM operators WHERE id=target.operator_id AND company_id=tenant;
  SELECT * INTO project_record FROM projects WHERE id=target.project_id AND company_id=tenant;

  IF target.id IS NULL OR line.id IS NULL OR rental.id IS NULL
    OR target.id IS DISTINCT FROM command->>'revisionId'
    OR target.rental_equipment_line_id IS DISTINCT FROM line.id
    OR target.status<>'Submitted' OR target.superseded_by_revision_id IS NOT NULL
    OR target.submitted_at IS NULL OR customer.id IS NULL OR NOT customer.active
    OR nullif(btrim(customer.name),'') IS NULL
    OR customer.email IS NULL
    OR customer.email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
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

  idem=begin_operational_command(command,'CREATE_CUSTOMER_REVIEW','DEUR',target.id,tenant,auth.uid()::text);
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
    'customerName',customer.name,
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
    now_at+interval '7 days',auth.uid(),now_at,customer.name,lower(customer.email),
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
    command,'CREATE_CUSTOMER_REVIEW','DEUR',target.id,tenant,auth.uid()::text,
    payload_hash,safe_response,target.row_version
  );
  RETURN response;
END $$;

CREATE OR REPLACE FUNCTION get_public_customer_review(command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,pg_catalog AS $$
DECLARE request customer_review_requests; target deurs;
BEGIN
  IF jsonb_typeof(command)<>'object'
    OR (SELECT count(*) FROM jsonb_object_keys(command))<>1
    OR nullif(command->>'token','') IS NULL
  THEN RETURN jsonb_build_object('success',false,'code','INVALID_OR_UNAVAILABLE'); END IF;
  SELECT * INTO request FROM customer_review_requests
  WHERE token_hash=pg_catalog.encode(extensions.digest(command->>'token','sha256'),'hex');
  IF request.id IS NULL THEN
    RETURN jsonb_build_object('success',false,'code','INVALID_OR_UNAVAILABLE');
  END IF;
  IF request.status IN('Acknowledged','CorrectionRequested') OR request.consumed_at IS NOT NULL THEN
    RETURN jsonb_build_object('success',true,'disposition','ALREADY_COMPLETED',
      'value',jsonb_build_object('reviewStatus',request.status,'availableActions','[]'::jsonb));
  END IF;
  IF request.expires_at<=clock_timestamp() THEN
    RETURN jsonb_build_object('success',false,'code','EXPIRED');
  END IF;
  IF request.status='Superseded' OR request.superseded_at IS NOT NULL THEN
    RETURN jsonb_build_object('success',false,'code','SUPERSEDED');
  END IF;
  IF request.status<>'Pending' OR request.revoked_at IS NOT NULL THEN
    RETURN jsonb_build_object('success',false,'code','INVALID_OR_UNAVAILABLE');
  END IF;
  SELECT * INTO target FROM deurs
    WHERE id=request.revision_id AND company_id=request.company_id;
  IF target.id IS NULL OR target.id IS DISTINCT FROM request.deur_id
    OR target.rental_id IS DISTINCT FROM request.rental_id
    OR target.rental_equipment_line_id IS DISTINCT FROM request.rental_equipment_line_id
    OR target.status<>'Submitted' OR target.superseded_by_revision_id IS NOT NULL
    OR target.row_version IS DISTINCT FROM request.revision_version
    OR request.permitted_actions IS DISTINCT FROM ARRAY['ACKNOWLEDGE','REQUEST_CORRECTION']::text[]
    OR EXISTS(
      SELECT 1 FROM customer_correction_requests correction
      WHERE correction.review_request_id=request.id AND correction.status='Open'
    )
  THEN RETURN jsonb_build_object('success',false,'code','SUPERSEDED'); END IF;
  RETURN jsonb_build_object('success',true,'disposition','AVAILABLE',
    'value',request.snapshot||jsonb_build_object(
      'reviewStatus','Pending',
      'availableActions',to_jsonb(request.permitted_actions),
      'expiresAt',request.expires_at
    ));
END $$;

CREATE FUNCTION decide_public_customer_review_v2(command jsonb, requested_action text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,pg_catalog AS $$
DECLARE
  request customer_review_requests; target deurs; now_at timestamptz=clock_timestamp();
  idem jsonb; payload_hash text; response jsonb; reason text=btrim(coalesce(command->>'reason',''));
  allowed_keys text[];
BEGIN
  allowed_keys=CASE requested_action
    WHEN 'ACKNOWLEDGE' THEN ARRAY['token','commandId','idempotencyKey']
    WHEN 'REQUEST_CORRECTION' THEN ARRAY['token','commandId','idempotencyKey','reason']
    ELSE ARRAY[]::text[]
  END;
  IF requested_action NOT IN('ACKNOWLEDGE','REQUEST_CORRECTION')
    OR jsonb_typeof(command)<>'object'
    OR nullif(command->>'token','') IS NULL
    OR nullif(command->>'commandId','') IS NULL
    OR nullif(command->>'idempotencyKey','') IS NULL
    OR EXISTS(SELECT 1 FROM jsonb_object_keys(command) key WHERE NOT key=ANY(allowed_keys))
    OR (requested_action='REQUEST_CORRECTION' AND length(reason) NOT BETWEEN 10 AND 1000)
    OR (requested_action='ACKNOWLEDGE' AND command ? 'reason')
  THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;

  SELECT * INTO request FROM customer_review_requests
  WHERE token_hash=pg_catalog.encode(extensions.digest(command->>'token','sha256'),'hex')
  FOR UPDATE;
  IF request.id IS NULL THEN
    RETURN jsonb_build_object('success',false,'code','INVALID_OR_UNAVAILABLE');
  END IF;
  idem=begin_operational_command(
    command,'PUBLIC_REVIEW_'||requested_action,'CUSTOMER_REVIEW',request.id::text,
    request.company_id,'public-review:'||request.id::text
  );
  IF idem->>'state'='MISMATCH' THEN
    RETURN jsonb_build_object('success',false,'code','IDEMPOTENCY_MISMATCH');
  END IF;
  IF idem->>'state'='REPLAY' THEN
    RETURN (idem->'response')||jsonb_build_object('disposition','REPLAYED');
  END IF;
  IF request.status IN('Acknowledged','CorrectionRequested') OR request.consumed_at IS NOT NULL THEN
    RETURN jsonb_build_object('success',false,'code','ALREADY_COMPLETED');
  END IF;
  IF request.expires_at<=now_at THEN
    RETURN jsonb_build_object('success',false,'code','EXPIRED');
  END IF;
  IF request.status='Superseded' OR request.superseded_at IS NOT NULL THEN
    RETURN jsonb_build_object('success',false,'code','SUPERSEDED');
  END IF;
  IF request.status<>'Pending' OR request.revoked_at IS NOT NULL
    OR NOT requested_action=ANY(request.permitted_actions)
  THEN RETURN jsonb_build_object('success',false,'code','INVALID_OR_UNAVAILABLE'); END IF;

  SELECT * INTO target FROM deurs
    WHERE id=request.revision_id AND company_id=request.company_id FOR UPDATE;
  IF target.id IS NULL OR target.id IS DISTINCT FROM request.deur_id
    OR target.rental_id IS DISTINCT FROM request.rental_id
    OR target.rental_equipment_line_id IS DISTINCT FROM request.rental_equipment_line_id
    OR target.status<>'Submitted' OR target.superseded_by_revision_id IS NOT NULL
    OR target.row_version IS DISTINCT FROM request.revision_version
  THEN RETURN jsonb_build_object('success',false,'code','SUPERSEDED'); END IF;
  payload_hash=idem->>'payloadHash';

  INSERT INTO customer_review_outcomes(
    company_id,review_request_id,rental_id,deur_id,revision_id,action,
    customer_reason,recipient_name,occurred_at
  ) VALUES(
    request.company_id,request.id,request.rental_id,request.deur_id,request.revision_id,
    requested_action,CASE WHEN requested_action='REQUEST_CORRECTION' THEN reason END,
    request.recipient_name,now_at
  );

  IF requested_action='ACKNOWLEDGE' THEN
    UPDATE deurs SET status='Acknowledged',acknowledged_at=now_at,
      acknowledged_by=request.recipient_name,acknowledgement_remarks=NULL
    WHERE id=target.id RETURNING * INTO target;
    INSERT INTO deur_review_history(
      id,deur_id,action,actor_name,occurred_at,company_id
    ) VALUES(
      extensions.gen_random_uuid()::text,target.id,'acknowledged',
      request.recipient_name,now_at,request.company_id
    );
    UPDATE customer_review_requests
      SET status='Acknowledged',consumed_at=now_at,row_version=row_version+1
      WHERE id=request.id;
  ELSE
    INSERT INTO customer_correction_requests(
      company_id,review_request_id,source_revision_id,customer_reason
    ) VALUES(request.company_id,request.id,request.revision_id,reason);
    UPDATE customer_review_requests
      SET status='CorrectionRequested',consumed_at=now_at,customer_comment=reason,
        row_version=row_version+1
      WHERE id=request.id;
  END IF;

  INSERT INTO audit_log(
    id,company_id,aggregate_type,aggregate_id,action,actor_id,occurred_at,
    correlation_id,new_values
  ) VALUES(
    extensions.gen_random_uuid()::text,request.company_id,'CUSTOMER_REVIEW',
    request.id::text,requested_action,NULL,now_at,command->>'commandId',
    jsonb_build_object('revisionId',request.revision_id,
      'reason',CASE WHEN requested_action='REQUEST_CORRECTION' THEN reason END)
  );
  response=jsonb_build_object(
    'success',true,'disposition','ACCEPTED','serverOccurredAt',now_at,
    'value',jsonb_build_object('reviewStatus',
      CASE requested_action WHEN 'ACKNOWLEDGE' THEN 'Acknowledged'
        ELSE 'CorrectionRequested' END)
  );
  RETURN finish_operational_command(
    command,'PUBLIC_REVIEW_'||requested_action,'CUSTOMER_REVIEW',request.id::text,
    request.company_id,'public-review:'||request.id::text,payload_hash,response,target.row_version
  );
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('success',false,'code','ALREADY_COMPLETED');
END $$;

CREATE FUNCTION public_acknowledge_customer_review(command jsonb)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=erp,pg_catalog AS $$
  SELECT decide_public_customer_review_v2(command,'ACKNOWLEDGE')
$$;
CREATE FUNCTION public_request_customer_correction(command jsonb)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=erp,pg_catalog AS $$
  SELECT decide_public_customer_review_v2(command,'REQUEST_CORRECTION')
$$;

REVOKE ALL ON FUNCTION
  reject_customer_review_evidence_change(),
  protect_customer_correction_evidence(),
  decide_public_customer_review_v2(jsonb,text)
FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION command_create_customer_review_request(jsonb)
  FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION command_create_customer_review_request(jsonb) TO authenticated;
REVOKE ALL ON FUNCTION
  get_public_customer_review(jsonb),
  public_acknowledge_customer_review(jsonb),
  public_request_customer_correction(jsonb)
FROM PUBLIC,authenticated,service_role;
GRANT EXECUTE ON FUNCTION
  get_public_customer_review(jsonb),
  public_acknowledge_customer_review(jsonb),
  public_request_customer_correction(jsonb)
TO anon;

COMMENT ON TABLE customer_review_outcomes IS
  'Immutable C5A public review outcome evidence; no raw credential or token hash.';
COMMENT ON TABLE customer_correction_requests IS
  'Rental Operations work-item boundary created by a customer correction request.';
COMMENT ON FUNCTION public_request_customer_correction(jsonb) IS
  'Anonymous opaque-credential boundary. Reason is plain text evidence, never executable markup.';

COMMIT;
