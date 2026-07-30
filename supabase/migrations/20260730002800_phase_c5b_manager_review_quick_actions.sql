BEGIN;
SET search_path TO erp, auth, pg_catalog;

ALTER TABLE deurs
  ADD COLUMN manager_review_status text
    CHECK(manager_review_status IS NULL OR manager_review_status IN('Pending','Approved','Rejected','CorrectionRequested')),
  ADD COLUMN manager_reviewed_at timestamptz,
  ADD COLUMN manager_reviewed_by uuid REFERENCES auth.users(id),
  ADD COLUMN manager_review_reason text;

CREATE TABLE manager_review_requests (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  company_id text NOT NULL REFERENCES companies(id),
  rental_id text NOT NULL,
  rental_equipment_line_id text NOT NULL,
  deur_id text NOT NULL,
  revision_id text NOT NULL,
  recipient_user_id uuid NOT NULL REFERENCES auth.users(id),
  recipient_name text NOT NULL,
  recipient_destination text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  permitted_actions text[] NOT NULL DEFAULT ARRAY['APPROVE','REJECT','REQUEST_CORRECTION']::text[],
  status text NOT NULL DEFAULT 'Pending'
    CHECK(status IN('Pending','Approved','Rejected','CorrectionRequested','Revoked','Expired','Superseded')),
  revision_version bigint NOT NULL,
  snapshot jsonb NOT NULL,
  issued_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  revoked_at timestamptz,
  superseded_at timestamptz,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  row_version bigint NOT NULL DEFAULT 1,
  CONSTRAINT manager_review_request_actions CHECK(
    permitted_actions=ARRAY['APPROVE','REJECT','REQUEST_CORRECTION']::text[]
  ),
  CONSTRAINT manager_review_request_rental_fk FOREIGN KEY(company_id,rental_id)
    REFERENCES rentals(company_id,id),
  CONSTRAINT manager_review_request_deur_fk FOREIGN KEY(company_id,deur_id)
    REFERENCES deurs(company_id,id),
  CONSTRAINT manager_review_request_revision_fk FOREIGN KEY(company_id,revision_id)
    REFERENCES deurs(company_id,id)
);
CREATE UNIQUE INDEX uq_manager_review_active_revision
  ON manager_review_requests(company_id,revision_id) WHERE status='Pending';

CREATE TABLE manager_review_outcomes (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  company_id text NOT NULL REFERENCES companies(id),
  review_request_id uuid NOT NULL UNIQUE REFERENCES manager_review_requests(id),
  rental_id text NOT NULL,
  deur_id text NOT NULL,
  revision_id text NOT NULL,
  reviewer_user_id uuid NOT NULL REFERENCES auth.users(id),
  reviewer_name text NOT NULL,
  action text NOT NULL CHECK(action IN('APPROVE','REJECT','REQUEST_CORRECTION')),
  reason text,
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT manager_review_outcome_reason CHECK(
    (action='APPROVE' AND reason IS NULL)
    OR (action IN('REJECT','REQUEST_CORRECTION') AND length(reason) BETWEEN 10 AND 1000)
  ),
  CONSTRAINT manager_review_outcome_rental_fk FOREIGN KEY(company_id,rental_id)
    REFERENCES rentals(company_id,id),
  CONSTRAINT manager_review_outcome_deur_fk FOREIGN KEY(company_id,deur_id)
    REFERENCES deurs(company_id,id),
  CONSTRAINT manager_review_outcome_revision_fk FOREIGN KEY(company_id,revision_id)
    REFERENCES deurs(company_id,id)
);

CREATE TABLE manager_correction_requests (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  company_id text NOT NULL REFERENCES companies(id),
  review_request_id uuid NOT NULL UNIQUE REFERENCES manager_review_requests(id),
  source_revision_id text NOT NULL,
  reason text NOT NULL CHECK(length(reason) BETWEEN 10 AND 1000),
  status text NOT NULL DEFAULT 'Open' CHECK(status IN('Open','Resolved','Cancelled')),
  resulting_revision_id text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  resolved_at timestamptz,
  CONSTRAINT manager_correction_source_fk FOREIGN KEY(company_id,source_revision_id)
    REFERENCES deurs(company_id,id),
  CONSTRAINT manager_correction_result_fk FOREIGN KEY(company_id,resulting_revision_id)
    REFERENCES deurs(company_id,id),
  CONSTRAINT manager_correction_resolution CHECK(
    (status='Open' AND resulting_revision_id IS NULL AND resolved_at IS NULL)
    OR (status<>'Open' AND resolved_at IS NOT NULL)
  )
);
CREATE INDEX ix_manager_correction_open
  ON manager_correction_requests(company_id,status,created_at) WHERE status='Open';

CREATE FUNCTION reject_manager_review_outcome_change()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
  RAISE EXCEPTION 'manager review evidence is immutable' USING ERRCODE='55000';
END $$;
CREATE TRIGGER manager_review_outcomes_immutable
  BEFORE UPDATE OR DELETE ON manager_review_outcomes
  FOR EACH ROW EXECUTE FUNCTION reject_manager_review_outcome_change();

CREATE FUNCTION protect_manager_correction_source()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
  IF OLD.company_id IS DISTINCT FROM NEW.company_id
    OR OLD.review_request_id IS DISTINCT FROM NEW.review_request_id
    OR OLD.source_revision_id IS DISTINCT FROM NEW.source_revision_id
    OR OLD.reason IS DISTINCT FROM NEW.reason
    OR OLD.created_at IS DISTINCT FROM NEW.created_at
  THEN RAISE EXCEPTION 'manager correction source evidence is immutable' USING ERRCODE='55000';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER manager_correction_source_immutable
  BEFORE UPDATE ON manager_correction_requests
  FOR EACH ROW EXECUTE FUNCTION protect_manager_correction_source();

CREATE FUNCTION reset_and_link_manager_review_on_correction()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,pg_catalog AS $$
BEGIN
  IF TG_OP='INSERT' AND NEW.previous_revision_id IS NOT NULL THEN
    NEW.manager_review_status=NULL;
    NEW.manager_reviewed_at=NULL;
    NEW.manager_reviewed_by=NULL;
    NEW.manager_review_reason=NULL;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER a_reset_manager_review_on_correction
  BEFORE INSERT ON deurs
  FOR EACH ROW EXECUTE FUNCTION reset_and_link_manager_review_on_correction();

CREATE FUNCTION link_manager_correction_work_item()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,pg_catalog AS $$
BEGIN
  IF NEW.previous_revision_id IS NOT NULL THEN
    UPDATE manager_correction_requests
    SET status='Resolved',resulting_revision_id=NEW.id,resolved_at=clock_timestamp()
    WHERE company_id=NEW.company_id AND source_revision_id=NEW.previous_revision_id AND status='Open';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER link_manager_correction_after_revision
  AFTER INSERT ON deurs
  FOR EACH ROW EXECUTE FUNCTION link_manager_correction_work_item();

ALTER TABLE manager_review_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE manager_review_outcomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE manager_correction_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON manager_review_requests,manager_review_outcomes,manager_correction_requests
  FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION command_create_manager_review_request(command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,auth,pg_catalog AS $$
DECLARE
  tenant text=current_company_id(); target deurs; rental rentals;
  line rental_equipment_lines; recipient users; equipment_record equipment;
  operator_record operators; project_record projects; raw_token text;
  request manager_review_requests; now_at timestamptz=clock_timestamp();
  idem jsonb; payload_hash text; safe_response jsonb; response jsonb; review_snapshot jsonb;
  correction_history jsonb; review_history jsonb;
BEGIN
  IF tenant IS NULL THEN RETURN jsonb_build_object('success',false,'code','UNAUTHENTICATED'); END IF;
  IF NOT current_user_has_permission('rental.approve') THEN
    RETURN jsonb_build_object('success',false,'code','FORBIDDEN');
  END IF;
  IF jsonb_typeof(command)<>'object' OR EXISTS(
    SELECT 1 FROM jsonb_object_keys(command) key
    WHERE key NOT IN('commandId','idempotencyKey','deurId','rentalLineId','revisionId','recipientUserId')
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
  SELECT * INTO recipient FROM users
    WHERE id=(command->>'recipientUserId')::uuid AND company_id=tenant AND status='active';
  IF target.id IS NULL OR rental.id IS NULL OR line.id IS NULL OR recipient.id IS NULL
    OR equipment_record.id IS NULL OR operator_record.id IS NULL
    OR target.id IS DISTINCT FROM command->>'revisionId'
    OR target.rental_equipment_line_id IS DISTINCT FROM line.id
    OR target.status<>'Submitted' OR target.superseded_by_revision_id IS NOT NULL
    OR target.submitted_at IS NULL OR target.manager_review_status IN('Approved','Rejected','CorrectionRequested')
    OR recipient.username !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    OR NOT EXISTS(
      SELECT 1 FROM user_roles ur
      JOIN role_permissions rp ON rp.role_id=ur.role_id
      JOIN app_permissions permission ON permission.id=rp.permission_id
      WHERE ur.user_id=recipient.id AND permission.code='rental.approve'
    )
  THEN RETURN jsonb_build_object('success',false,'code','INVALID_TRANSITION'); END IF;

  idem=begin_operational_command(command,'CREATE_MANAGER_REVIEW','DEUR',target.id,tenant,auth.uid()::text);
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
    lower(recipient.username),pg_catalog.encode(extensions.digest(raw_token,'sha256'),'hex'),
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
  PERFORM finish_operational_command(command,'CREATE_MANAGER_REVIEW','DEUR',target.id,tenant,
    auth.uid()::text,payload_hash,safe_response,target.row_version);
  RETURN response;
EXCEPTION WHEN invalid_text_representation THEN
  RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED');
END $$;

CREATE FUNCTION get_manager_review(command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,pg_catalog AS $$
DECLARE request manager_review_requests; target deurs;
BEGIN
  IF jsonb_typeof(command)<>'object' OR (SELECT count(*) FROM jsonb_object_keys(command))<>1
    OR nullif(command->>'token','') IS NULL
  THEN RETURN jsonb_build_object('success',false,'code','INVALID_OR_UNAVAILABLE'); END IF;
  SELECT * INTO request FROM manager_review_requests
    WHERE token_hash=pg_catalog.encode(extensions.digest(command->>'token','sha256'),'hex');
  IF request.id IS NULL THEN RETURN jsonb_build_object('success',false,'code','INVALID_OR_UNAVAILABLE'); END IF;
  IF request.status IN('Approved','Rejected','CorrectionRequested') OR request.consumed_at IS NOT NULL THEN
    RETURN jsonb_build_object('success',true,'disposition','ALREADY_COMPLETED',
      'value',jsonb_build_object('reviewStatus',request.status,'availableActions','[]'::jsonb));
  END IF;
  IF request.expires_at<=clock_timestamp() THEN RETURN jsonb_build_object('success',false,'code','EXPIRED'); END IF;
  IF request.status='Superseded' OR request.superseded_at IS NOT NULL THEN
    RETURN jsonb_build_object('success',false,'code','SUPERSEDED'); END IF;
  IF request.status<>'Pending' OR request.revoked_at IS NOT NULL THEN
    RETURN jsonb_build_object('success',false,'code','INVALID_OR_UNAVAILABLE'); END IF;
  SELECT * INTO target FROM deurs WHERE id=request.revision_id AND company_id=request.company_id;
  IF target.id IS NULL OR target.id IS DISTINCT FROM request.deur_id
    OR target.row_version IS DISTINCT FROM request.revision_version+1
    OR target.status<>'Submitted' OR target.superseded_by_revision_id IS NOT NULL
    OR target.manager_review_status<>'Pending'
  THEN RETURN jsonb_build_object('success',false,'code','SUPERSEDED'); END IF;
  RETURN jsonb_build_object('success',true,'disposition','AVAILABLE','value',
    request.snapshot||jsonb_build_object('reviewStatus','Pending',
      'availableActions',to_jsonb(request.permitted_actions),'expiresAt',request.expires_at));
END $$;

CREATE FUNCTION decide_manager_review(command jsonb, requested_action text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,pg_catalog AS $$
DECLARE
  request manager_review_requests; target deurs; now_at timestamptz=clock_timestamp();
  reason text=btrim(coalesce(command->>'reason','')); allowed_keys text[];
  idem jsonb; payload_hash text; response jsonb; next_status text;
BEGIN
  allowed_keys=CASE requested_action
    WHEN 'APPROVE' THEN ARRAY['token','commandId','idempotencyKey']
    ELSE ARRAY['token','commandId','idempotencyKey','reason'] END;
  IF requested_action NOT IN('APPROVE','REJECT','REQUEST_CORRECTION')
    OR jsonb_typeof(command)<>'object'
    OR nullif(command->>'token','') IS NULL OR nullif(command->>'commandId','') IS NULL
    OR nullif(command->>'idempotencyKey','') IS NULL
    OR EXISTS(SELECT 1 FROM jsonb_object_keys(command) key WHERE NOT key=ANY(allowed_keys))
    OR (requested_action<>'APPROVE' AND length(reason) NOT BETWEEN 10 AND 1000)
    OR (requested_action='APPROVE' AND command ? 'reason')
  THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;
  SELECT * INTO request FROM manager_review_requests
    WHERE token_hash=pg_catalog.encode(extensions.digest(command->>'token','sha256'),'hex') FOR UPDATE;
  IF request.id IS NULL THEN RETURN jsonb_build_object('success',false,'code','INVALID_OR_UNAVAILABLE'); END IF;
  idem=begin_operational_command(command,'MANAGER_REVIEW_'||requested_action,'MANAGER_REVIEW',
    request.id::text,request.company_id,'manager-review:'||request.id::text);
  IF idem->>'state'='MISMATCH' THEN RETURN jsonb_build_object('success',false,'code','IDEMPOTENCY_MISMATCH'); END IF;
  IF idem->>'state'='REPLAY' THEN RETURN (idem->'response')||jsonb_build_object('disposition','REPLAYED'); END IF;
  IF request.status IN('Approved','Rejected','CorrectionRequested') OR request.consumed_at IS NOT NULL THEN
    RETURN jsonb_build_object('success',false,'code','ALREADY_COMPLETED'); END IF;
  IF request.expires_at<=now_at THEN RETURN jsonb_build_object('success',false,'code','EXPIRED'); END IF;
  IF request.status='Superseded' OR request.superseded_at IS NOT NULL THEN
    RETURN jsonb_build_object('success',false,'code','SUPERSEDED'); END IF;
  IF request.status<>'Pending' OR request.revoked_at IS NOT NULL
    OR NOT requested_action=ANY(request.permitted_actions)
  THEN RETURN jsonb_build_object('success',false,'code','INVALID_OR_UNAVAILABLE'); END IF;
  SELECT * INTO target FROM deurs WHERE id=request.revision_id AND company_id=request.company_id FOR UPDATE;
  IF target.id IS NULL OR target.id IS DISTINCT FROM request.deur_id
    OR target.row_version IS DISTINCT FROM request.revision_version+1
    OR target.status<>'Submitted' OR target.superseded_by_revision_id IS NOT NULL
    OR target.manager_review_status<>'Pending'
  THEN RETURN jsonb_build_object('success',false,'code','SUPERSEDED'); END IF;
  payload_hash=idem->>'payloadHash';
  next_status=CASE requested_action WHEN 'APPROVE' THEN 'Approved'
    WHEN 'REJECT' THEN 'Rejected' ELSE 'CorrectionRequested' END;
  INSERT INTO manager_review_outcomes(
    company_id,review_request_id,rental_id,deur_id,revision_id,reviewer_user_id,
    reviewer_name,action,reason,occurred_at
  ) VALUES(request.company_id,request.id,request.rental_id,request.deur_id,request.revision_id,
    request.recipient_user_id,request.recipient_name,requested_action,
    CASE WHEN requested_action='APPROVE' THEN NULL ELSE reason END,now_at);
  IF requested_action='REQUEST_CORRECTION' THEN
    INSERT INTO manager_correction_requests(company_id,review_request_id,source_revision_id,reason)
    VALUES(request.company_id,request.id,request.revision_id,reason);
  END IF;
  UPDATE manager_review_requests SET status=next_status,consumed_at=now_at,row_version=row_version+1
    WHERE id=request.id;
  UPDATE deurs SET manager_review_status=next_status,manager_reviewed_at=now_at,
    manager_reviewed_by=request.recipient_user_id,
    manager_review_reason=CASE WHEN requested_action='APPROVE' THEN NULL ELSE reason END
    WHERE id=target.id RETURNING * INTO target;
  INSERT INTO audit_log(id,company_id,aggregate_type,aggregate_id,action,actor_id,occurred_at,correlation_id,new_values)
  VALUES(extensions.gen_random_uuid()::text,request.company_id,'MANAGER_REVIEW',request.id::text,
    requested_action,request.recipient_user_id::text,now_at,command->>'commandId',
    jsonb_build_object('revisionId',request.revision_id,'reason',
      CASE WHEN requested_action='APPROVE' THEN NULL ELSE reason END));
  response=jsonb_build_object('success',true,'disposition','ACCEPTED','serverOccurredAt',now_at,
    'value',jsonb_build_object('reviewStatus',next_status,'eventType',
      CASE requested_action WHEN 'APPROVE' THEN 'MANAGER_DEUR_APPROVED'
        WHEN 'REJECT' THEN 'MANAGER_DEUR_REJECTED' ELSE 'MANAGER_DEUR_CORRECTION_REQUESTED' END));
  RETURN finish_operational_command(command,'MANAGER_REVIEW_'||requested_action,'MANAGER_REVIEW',
    request.id::text,request.company_id,'manager-review:'||request.id::text,payload_hash,response,target.row_version);
EXCEPTION WHEN unique_violation THEN
  RETURN jsonb_build_object('success',false,'code','ALREADY_COMPLETED');
END $$;

CREATE FUNCTION approve_manager_review(command jsonb)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=erp,pg_catalog AS $$
  SELECT decide_manager_review(command,'APPROVE')
$$;
CREATE FUNCTION reject_manager_review(command jsonb)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=erp,pg_catalog AS $$
  SELECT decide_manager_review(command,'REJECT')
$$;
CREATE FUNCTION request_manager_correction(command jsonb)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=erp,pg_catalog AS $$
  SELECT decide_manager_review(command,'REQUEST_CORRECTION')
$$;

REVOKE ALL ON FUNCTION
  reject_manager_review_outcome_change(),protect_manager_correction_source(),
  reset_and_link_manager_review_on_correction(),link_manager_correction_work_item(),
  decide_manager_review(jsonb,text)
FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION command_create_manager_review_request(jsonb)
  FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION command_create_manager_review_request(jsonb) TO authenticated;
REVOKE ALL ON FUNCTION
  get_manager_review(jsonb),approve_manager_review(jsonb),reject_manager_review(jsonb),
  request_manager_correction(jsonb)
FROM PUBLIC,authenticated,service_role;
GRANT EXECUTE ON FUNCTION
  get_manager_review(jsonb),approve_manager_review(jsonb),reject_manager_review(jsonb),
  request_manager_correction(jsonb)
TO anon;

COMMIT;
