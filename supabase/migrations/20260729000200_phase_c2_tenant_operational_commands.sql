BEGIN;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
SET search_path TO erp, public;

CREATE TABLE companies (
  id text PRIMARY KEY,
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
INSERT INTO companies(id,code,name) VALUES('TENANT-LOCAL-001','LOCAL','Local compatibility tenant')
ON CONFLICT(id) DO NOTHING;

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'users','operators','customers','projects','equipment','assignments','rentals',
    'rental_equipment_lines','deurs','deur_events','billing_statements','audit_log',
    'number_sequences','deur_command_idempotency'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS company_id text REFERENCES companies(id)',table_name);
    EXECUTE format('UPDATE %I SET company_id=%L WHERE company_id IS NULL',table_name,'TENANT-LOCAL-001');
    EXECUTE format('ALTER TABLE %I ALTER COLUMN company_id SET NOT NULL',table_name);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I(company_id)', 'ix_'||table_name||'_company', table_name);
  END LOOP;
END $$;

ALTER TABLE number_sequences DROP CONSTRAINT IF EXISTS number_sequences_scope_sequence_year_key;
CREATE UNIQUE INDEX IF NOT EXISTS uq_number_sequences_company_scope_year
  ON number_sequences(company_id,scope,sequence_year);
DROP INDEX IF EXISTS uq_deur_revision;
CREATE UNIQUE INDEX uq_deur_revision ON deurs(company_id,revision_chain_id,revision_number)
  WHERE revision_chain_id IS NOT NULL;
ALTER TABLE deur_command_idempotency DROP CONSTRAINT IF EXISTS deur_command_idempotency_actor_id_idempotency_key_key;
CREATE UNIQUE INDEX IF NOT EXISTS uq_deur_idempotency_company_actor_key
  ON deur_command_idempotency(company_id,actor_id,idempotency_key);

CREATE TABLE customer_review_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id text NOT NULL REFERENCES companies(id),
  rental_id text NOT NULL REFERENCES rentals(id),
  rental_equipment_line_id text NOT NULL REFERENCES rental_equipment_lines(id),
  deur_id text NOT NULL REFERENCES deurs(id),
  revision_id text NOT NULL REFERENCES deurs(id),
  equipment_id text NOT NULL REFERENCES equipment(id),
  operator_id text NOT NULL REFERENCES operators(id),
  customer_id text NOT NULL REFERENCES customers(id),
  token_hash text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'Pending' CHECK(status IN('Pending','Acknowledged','Rejected','Revoked','Expired')),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  revoked_at timestamptz,
  customer_name text,
  customer_comment text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  created_by uuid REFERENCES auth.users(id),
  row_version bigint NOT NULL DEFAULT 1
);
CREATE UNIQUE INDEX uq_customer_review_active_revision
  ON customer_review_requests(company_id,revision_id) WHERE status='Pending';

CREATE TABLE deur_meter_checkpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id text NOT NULL REFERENCES companies(id),
  deur_id text NOT NULL REFERENCES deurs(id),
  rental_equipment_line_id text NOT NULL REFERENCES rental_equipment_lines(id),
  equipment_id text NOT NULL REFERENCES equipment(id),
  operator_id text NOT NULL REFERENCES operators(id),
  kind text NOT NULL CHECK(kind IN('opening','closing','checkpoint')),
  reading numeric(19,4) NOT NULL CHECK(reading>=0),
  client_occurred_at timestamptz,
  server_accepted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  location jsonb,
  created_by uuid NOT NULL REFERENCES auth.users(id)
);
CREATE INDEX ix_deur_meter_checkpoint_scope ON deur_meter_checkpoints(company_id,deur_id,server_accepted_at);

CREATE OR REPLACE FUNCTION current_company_id() RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=erp,public,auth AS $$
  SELECT company_id FROM users WHERE id=auth.uid() AND status='active'
$$;

CREATE OR REPLACE FUNCTION validate_operational_scope(command jsonb, permission_code text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=erp,public,auth AS $$
DECLARE tenant text; target_tenant text;
BEGIN
  tenant=current_company_id();
  IF tenant IS NULL THEN RETURN jsonb_build_object('success',false,'code','UNAUTHENTICATED'); END IF;
  IF NOT current_user_has_permission(permission_code) THEN RETURN jsonb_build_object('success',false,'code','FORBIDDEN'); END IF;
  SELECT company_id INTO target_tenant FROM rentals WHERE id=command->>'rentalId';
  IF target_tenant IS NULL AND command ? 'deurId' THEN SELECT company_id INTO target_tenant FROM deurs WHERE id=command->>'deurId'; END IF;
  IF target_tenant IS DISTINCT FROM tenant THEN RETURN jsonb_build_object('success',false,'code','TENANT_MISMATCH'); END IF;
  RETURN jsonb_build_object('success',true,'companyId',tenant);
END $$;

CREATE OR REPLACE FUNCTION command_create_customer_review_request(command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,public,auth AS $$
DECLARE tenant text; target deurs; line rental_equipment_lines; rental rentals; raw_token text; request customer_review_requests; now_at timestamptz=clock_timestamp(); idem jsonb; payload_hash text; response jsonb;
BEGIN
  tenant=current_company_id();
  IF tenant IS NULL THEN RETURN jsonb_build_object('success',false,'code','UNAUTHENTICATED'); END IF;
  IF NOT current_user_has_permission('deur.review') THEN RETURN jsonb_build_object('success',false,'code','FORBIDDEN'); END IF;
  SELECT * INTO target FROM deurs WHERE id=command->>'deurId' AND company_id=tenant FOR UPDATE;
  SELECT * INTO line FROM rental_equipment_lines WHERE id=command->>'rentalLineId' AND company_id=tenant;
  SELECT * INTO rental FROM rentals WHERE id=target.rental_id AND company_id=tenant;
  IF target.id IS NULL OR line.id IS NULL OR rental.id IS NULL OR target.rental_equipment_line_id<>line.id
    OR target.status<>'Submitted' OR coalesce(target.superseded_by_revision_id,'')<>'' THEN
    RETURN jsonb_build_object('success',false,'code','INVALID_TRANSITION');
  END IF;
  idem=begin_operational_command(command,'CREATE_CUSTOMER_REVIEW','DEUR',target.id,tenant,auth.uid()::text);
  IF idem->>'state'='MISMATCH' THEN RETURN jsonb_build_object('success',false,'code','IDEMPOTENCY_MISMATCH','message','Idempotency key payload mismatch.','retryable',false,'refreshRequired',false); END IF;
  IF idem->>'state'='REPLAY' THEN RETURN (idem->'response')||jsonb_build_object('disposition','REPLAYED'); END IF;
  IF idem->>'state'<>'NEW' THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED','message','Command identity is required.','retryable',false,'refreshRequired',false); END IF;
  payload_hash=idem->>'payloadHash';
  IF EXISTS(SELECT 1 FROM customer_review_requests WHERE company_id=tenant AND revision_id=command->>'revisionId' AND status='Pending') THEN
    RETURN jsonb_build_object('success',false,'code','CONFLICT','message','An active review request already exists.');
  END IF;
  raw_token=pg_catalog.encode(extensions.gen_random_bytes(32),'hex');
  INSERT INTO customer_review_requests(company_id,rental_id,rental_equipment_line_id,deur_id,revision_id,equipment_id,operator_id,customer_id,token_hash,expires_at,created_by)
  VALUES(tenant,target.rental_id,line.id,target.id,command->>'revisionId',target.equipment_id,target.operator_id,target.customer_id,
    pg_catalog.encode(extensions.digest(raw_token,'sha256'),'hex'),now_at+interval '7 days',auth.uid()) RETURNING * INTO request;
  INSERT INTO audit_log(id,company_id,aggregate_type,aggregate_id,action,actor_id,occurred_at,correlation_id,new_values)
  VALUES(gen_random_uuid()::text,tenant,'CUSTOMER_REVIEW',request.id::text,'CREATE_REQUEST',auth.uid()::text,now_at,command->>'commandId',jsonb_build_object('revisionId',request.revision_id,'expiresAt',request.expires_at));
  response=jsonb_build_object('success',true,'disposition','ACCEPTED','serverOccurredAt',now_at,'refresh',jsonb_build_array(target.id,line.id),
    'value',jsonb_build_object('requestId',request.id,'deurId',target.id,'rentalLineId',line.id,'revisionId',request.revision_id,'expiresAt',request.expires_at,'rawToken',raw_token));
  PERFORM finish_operational_command(
    command,'CREATE_CUSTOMER_REVIEW','DEUR',target.id,tenant,auth.uid()::text,payload_hash,
    response #- '{value,rawToken}',target.row_version
  );
  RETURN response;
END $$;

CREATE OR REPLACE FUNCTION resolve_public_review(raw_token text)
RETURNS customer_review_requests LANGUAGE sql SECURITY DEFINER SET search_path=erp,public AS $$
  SELECT r FROM customer_review_requests r
  WHERE r.token_hash=pg_catalog.encode(extensions.digest(raw_token,'sha256'),'hex') AND r.status='Pending'
    AND r.expires_at>clock_timestamp() AND r.revoked_at IS NULL AND r.consumed_at IS NULL
$$;

CREATE OR REPLACE FUNCTION get_public_customer_review(command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,public AS $$
DECLARE request customer_review_requests; target deurs; rental rentals; line rental_equipment_lines;
BEGIN
  SELECT * INTO request FROM resolve_public_review(command->>'token');
  IF request.id IS NULL THEN RETURN jsonb_build_object('success',false,'code','INVALID_TOKEN','message','The review link is invalid or expired.'); END IF;
  SELECT * INTO target FROM deurs WHERE id=request.revision_id AND company_id=request.company_id;
  SELECT * INTO rental FROM rentals WHERE id=request.rental_id AND company_id=request.company_id;
  SELECT * INTO line FROM rental_equipment_lines WHERE id=request.rental_equipment_line_id AND company_id=request.company_id;
  IF target.id IS NULL OR target.superseded_by_revision_id IS NOT NULL THEN RETURN jsonb_build_object('success',false,'code','INVALID_TOKEN','message','The review link is invalid or expired.'); END IF;
  RETURN jsonb_build_object('success',true,'value',jsonb_build_object(
    'rentalNumber',rental.rental_number,'project',rental.project_snapshot,'equipmentId',line.equipment_id,
    'workDate',target.work_date,'shift',target.shift,'operationMinutes',target.total_operating_minutes,
    'idleMinutes',target.total_idle_minutes,'standbyMinutes',target.total_meal_break_minutes,'breakdownMinutes',target.total_maintenance_minutes));
END $$;

CREATE OR REPLACE FUNCTION decide_public_customer_review(command jsonb, decision text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,public AS $$
DECLARE request customer_review_requests; target deurs; now_at timestamptz=clock_timestamp(); next_status text; idem jsonb; payload_hash text; response jsonb;
BEGIN
  SELECT * INTO request FROM customer_review_requests
  WHERE token_hash=pg_catalog.encode(extensions.digest(command->>'token','sha256'),'hex') FOR UPDATE;
  IF request.id IS NULL THEN RETURN jsonb_build_object('success',false,'code','INVALID_TOKEN','message','The review link is invalid or expired.'); END IF;
  idem=begin_operational_command(command,'PUBLIC_REVIEW_'||upper(decision),'CUSTOMER_REVIEW',request.id::text,request.company_id,'public-review:'||request.id::text);
  IF idem->>'state'='MISMATCH' THEN RETURN jsonb_build_object('success',false,'code','IDEMPOTENCY_MISMATCH','message','The review request could not be processed.','retryable',false,'refreshRequired',false); END IF;
  IF idem->>'state'='REPLAY' THEN RETURN (idem->'response')||jsonb_build_object('disposition','REPLAYED'); END IF;
  IF request.status<>'Pending' OR request.expires_at<=now_at OR request.revoked_at IS NOT NULL OR request.consumed_at IS NOT NULL THEN RETURN jsonb_build_object('success',false,'code','INVALID_TOKEN','message','The review link is invalid or expired.'); END IF;
  payload_hash=idem->>'payloadHash';
  SELECT * INTO target FROM deurs WHERE id=request.revision_id AND company_id=request.company_id FOR UPDATE;
  IF target.id IS NULL OR target.status<>'Submitted' OR target.superseded_by_revision_id IS NOT NULL THEN RETURN jsonb_build_object('success',false,'code','INVALID_TOKEN','message','The review link is invalid or expired.'); END IF;
  IF decision='Rejected' AND length(trim(coalesce(command->>'comment','')))=0 THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;
  next_status=CASE decision WHEN 'Acknowledged' THEN 'Acknowledged' ELSE 'Rejected' END;
  UPDATE customer_review_requests SET status=next_status,consumed_at=now_at,customer_name=trim(command->>'customerName'),customer_comment=nullif(trim(command->>'comment'),'') WHERE id=request.id;
  UPDATE deurs SET status=next_status::deur_status,acknowledged_at=CASE WHEN next_status='Acknowledged' THEN now_at END,
    rejected_at=CASE WHEN next_status='Rejected' THEN now_at END,rejection_reason=CASE WHEN next_status='Rejected' THEN command->>'comment' END WHERE id=target.id;
  INSERT INTO audit_log(id,company_id,aggregate_type,aggregate_id,action,actor_id,occurred_at,new_values)
  VALUES(gen_random_uuid()::text,request.company_id,'CUSTOMER_REVIEW',request.id::text,upper(next_status),null,now_at,jsonb_build_object('revisionId',request.revision_id));
  response=jsonb_build_object('success',true,'disposition','ACCEPTED','serverOccurredAt',now_at,'refresh',jsonb_build_array(request.revision_id,request.rental_equipment_line_id),
    'value',jsonb_build_object('requestId',request.id,'status',next_status));
  RETURN finish_operational_command(command,'PUBLIC_REVIEW_'||upper(decision),'CUSTOMER_REVIEW',request.id::text,request.company_id,'public-review:'||request.id::text,payload_hash,response,target.row_version);
END $$;
CREATE OR REPLACE FUNCTION public_acknowledge_customer_review(command jsonb) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=erp,public AS $$ SELECT decide_public_customer_review(command,'Acknowledged') $$;
CREATE OR REPLACE FUNCTION public_reject_customer_review(command jsonb) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=erp,public AS $$ SELECT decide_public_customer_review(command,'Rejected') $$;

CREATE OR REPLACE FUNCTION get_rental_closure_readiness(command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,public,auth AS $$
DECLARE tenant text=current_company_id(); rental_id text=command->>'rentalId'; blockers jsonb;
BEGIN
  IF tenant IS NULL OR NOT EXISTS(SELECT 1 FROM rentals WHERE id=rental_id AND company_id=tenant) THEN RETURN jsonb_build_object('success',false,'code','NOT_FOUND'); END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('code',code,'message',message,'rentalLineId',line_id)),'[]'::jsonb) INTO blockers
  FROM (
    SELECT 'LINE_NOT_RETURNED' code,'Equipment line is not returned.' message,l.id line_id FROM rental_equipment_lines l WHERE l.rental_id=rental_id AND l.company_id=tenant AND l.status NOT IN('Returned','Closed','Cancelled')
    UNION ALL SELECT 'DEUR_INCOMPLETE','Daily operations are not finalized.',d.rental_equipment_line_id FROM deurs d WHERE d.rental_id=rental_id AND d.company_id=tenant AND d.status IN('Draft','In Progress','Submitted','Pending Acknowledgement','Rejected')
    UNION ALL SELECT 'ASSIGNMENT_ACTIVE','Equipment assignment is still active.',l.id FROM rental_equipment_lines l JOIN assignments a ON a.id=l.assignment_id AND a.company_id=l.company_id WHERE l.rental_id=rental_id AND l.company_id=tenant AND a.status='Active'
  ) b;
  RETURN jsonb_build_object('success',true,'disposition','ACCEPTED','serverOccurredAt',clock_timestamp(),'refresh','[]'::jsonb,
    'value',jsonb_build_object('rentalId',rental_id,'ready',jsonb_array_length(blockers)=0,'lines','[]'::jsonb,'blockers',blockers));
END $$;

ALTER TABLE customer_review_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE deur_meter_checkpoints ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON customer_review_requests,deur_meter_checkpoints FROM anon,authenticated;
REVOKE ALL ON FUNCTION resolve_public_review(text),decide_public_customer_review(jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION get_public_customer_review(jsonb),public_acknowledge_customer_review(jsonb),public_reject_customer_review(jsonb) TO anon,authenticated;
GRANT EXECUTE ON FUNCTION command_create_customer_review_request(jsonb),get_rental_closure_readiness(jsonb) TO authenticated;

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['users','operators','customers','projects','equipment','assignments','rentals','rental_equipment_lines','deurs','deur_events','billing_statements','audit_log','number_sequences'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',table_name);
    EXECUTE format('DROP POLICY IF EXISTS tenant_read ON %I',table_name);
    EXECUTE format('CREATE POLICY tenant_read ON %I FOR SELECT TO authenticated USING (company_id=current_company_id())',table_name);
  END LOOP;
END $$;
REVOKE INSERT,UPDATE,DELETE ON rentals,rental_equipment_lines,deurs,deur_events,customer_review_requests,deur_meter_checkpoints FROM anon,authenticated;
COMMIT;
