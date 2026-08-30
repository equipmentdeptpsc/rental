BEGIN;
SET LOCAL search_path=erp,auth,extensions,pg_catalog;

-- A turnover is custody of an existing DEUR, never a replacement of its
-- immutable primary operator or its Rental Equipment Line identity.
CREATE TABLE erp.deur_turnovers (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  company_id text NOT NULL REFERENCES erp.companies(id),
  deur_id text NOT NULL REFERENCES erp.deurs(id) ON DELETE RESTRICT,
  from_operator_id text NOT NULL REFERENCES erp.operators(id),
  to_operator_id text NOT NULL REFERENCES erp.operators(id),
  initiated_by_application_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  accepted_by_application_user_id uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  status text NOT NULL CHECK (status IN ('PENDING','ACCEPTED','CANCELLED','EXPIRED')),
  initiated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  accepted_at timestamptz,
  cancelled_at timestamptz,
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT ck_deur_turnover_distinct_operators CHECK (from_operator_id<>to_operator_id),
  CONSTRAINT ck_deur_turnover_acceptance CHECK (
    (status='ACCEPTED' AND accepted_at IS NOT NULL AND accepted_by_application_user_id IS NOT NULL)
    OR (status<>'ACCEPTED' AND accepted_at IS NULL AND accepted_by_application_user_id IS NULL)
  ),
  CONSTRAINT ck_deur_turnover_cancellation CHECK (
    (status='CANCELLED' AND cancelled_at IS NOT NULL) OR (status<>'CANCELLED' AND cancelled_at IS NULL)
  )
);
CREATE UNIQUE INDEX uq_deur_turnovers_one_pending_per_deur
  ON erp.deur_turnovers(deur_id) WHERE status='PENDING';
CREATE UNIQUE INDEX uq_deur_turnovers_company_actor_idempotency
  ON erp.deur_turnovers(company_id,initiated_by_application_user_id,idempotency_key);
CREATE INDEX ix_deur_turnovers_current_custody
  ON erp.deur_turnovers(company_id,deur_id,accepted_at DESC) WHERE status='ACCEPTED';
CREATE INDEX ix_deur_turnovers_pending_target
  ON erp.deur_turnovers(company_id,to_operator_id,initiated_at) WHERE status='PENDING';
ALTER TABLE erp.deur_turnovers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON erp.deur_turnovers FROM PUBLIC,anon,authenticated;

ALTER TABLE erp.deur_events DROP CONSTRAINT IF EXISTS ck_deur_event_activity;
ALTER TABLE erp.deur_events ADD CONSTRAINT ck_deur_event_activity
  CHECK (activity_type IN ('shift','operation','idle','standby','mealBreak','breakdown','turnover'));
ALTER TABLE erp.deur_events DROP CONSTRAINT IF EXISTS ck_deur_event_action;
ALTER TABLE erp.deur_events ADD CONSTRAINT ck_deur_event_action
  CHECK (action IN ('start','end','initiate','accept'));

CREATE OR REPLACE FUNCTION erp.resolve_deur_authorized_operator(target_deur_id text, target_company_id text)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=erp,auth,extensions,pg_catalog AS $$
  SELECT coalesce(
    (
      SELECT turnover.to_operator_id
      FROM erp.deur_turnovers AS turnover
      WHERE turnover.company_id=target_company_id
        AND turnover.deur_id=target_deur_id
        AND turnover.status='ACCEPTED'
      ORDER BY turnover.accepted_at DESC,turnover.created_at DESC,turnover.id DESC
      LIMIT 1
    ),
    (
      SELECT deur.operator_id
      FROM erp.deurs AS deur
      WHERE deur.id=target_deur_id AND deur.company_id=target_company_id
    )
  )
$$;

CREATE OR REPLACE FUNCTION erp.current_deur_authorized_operator(target_deur_id text)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=erp,auth,extensions,pg_catalog AS $$
  SELECT erp.resolve_deur_authorized_operator(target_deur_id,erp.current_company_id())
$$;

CREATE OR REPLACE FUNCTION erp.validate_deur_custody_command_scope(command jsonb, required_permission text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=erp,auth,extensions,pg_catalog AS $$
DECLARE
  tenant text:=erp.current_company_id();
  application_user erp.users%ROWTYPE;
  target_deur erp.deurs%ROWTYPE;
  target_line erp.rental_equipment_lines%ROWTYPE;
  target_assignment erp.assignments%ROWTYPE;
  authorized_operator text;
BEGIN
  IF auth.uid() IS NULL OR tenant IS NULL THEN RETURN jsonb_build_object('code','UNAUTHENTICATED'); END IF;
  SELECT * INTO application_user FROM erp.users AS user_record
    WHERE user_record.id=auth.uid() AND user_record.company_id=tenant AND user_record.status='active';
  IF application_user.id IS NULL THEN RETURN jsonb_build_object('code','USER_INACTIVE'); END IF;
  IF application_user.operator_id IS NULL OR application_user.operator_id<>command->>'operatorId' THEN
    RETURN jsonb_build_object('code','OWNERSHIP_MISMATCH');
  END IF;
  IF NOT erp.current_user_has_permission(required_permission) THEN RETURN jsonb_build_object('code','FORBIDDEN'); END IF;
  SELECT * INTO target_deur FROM erp.deurs AS deur_record
    WHERE deur_record.id=command->>'deurId' AND deur_record.company_id=tenant;
  IF target_deur.id IS NULL THEN RETURN jsonb_build_object('code','NOT_FOUND'); END IF;
  SELECT * INTO target_line FROM erp.rental_equipment_lines AS line_record
    WHERE line_record.id=target_deur.rental_equipment_line_id
      AND line_record.company_id=tenant AND line_record.deleted_at IS NULL;
  SELECT * INTO target_assignment FROM erp.assignments AS assignment_record
    WHERE assignment_record.id=target_deur.assignment_id AND assignment_record.company_id=tenant;
  IF target_line.id IS NULL OR target_assignment.id IS NULL
    OR target_deur.rental_id<>command->>'rentalId'
    OR target_deur.rental_equipment_line_id<>command->>'rentalLineId'
    OR target_deur.equipment_id<>command->>'equipmentId'
    OR target_deur.assignment_id IS DISTINCT FROM command->>'assignmentId'
    OR target_line.rental_id<>target_deur.rental_id
    OR target_line.equipment_id<>target_deur.equipment_id
    OR target_line.assignment_id IS DISTINCT FROM target_deur.assignment_id
    OR target_assignment.equipment_id<>target_line.equipment_id
    OR target_assignment.operator_id<>target_line.operator_id
  THEN RETURN jsonb_build_object('code','RELATIONSHIP_MISMATCH'); END IF;
  authorized_operator:=erp.current_deur_authorized_operator(target_deur.id);
  IF authorized_operator IS DISTINCT FROM application_user.operator_id THEN
    RETURN jsonb_build_object('code','OWNERSHIP_MISMATCH');
  END IF;
  RETURN jsonb_build_object('code','OK','companyId',tenant,'userId',application_user.id,
    'operatorId',application_user.operator_id,'primaryOperatorId',target_deur.operator_id,
    'currentAuthorizedOperatorId',authorized_operator);
END $$;

CREATE OR REPLACE FUNCTION erp.operator_has_conflicting_open_deur_custody(target_operator_id text, excluded_deur_id text DEFAULT NULL)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=erp,auth,extensions,pg_catalog AS $$
  SELECT EXISTS(
    SELECT 1
    FROM erp.deurs AS deur_record
    LEFT JOIN LATERAL (
      SELECT turnover.to_operator_id
      FROM erp.deur_turnovers AS turnover
      WHERE turnover.company_id=erp.current_company_id()
        AND turnover.deur_id=deur_record.id AND turnover.status='ACCEPTED'
      ORDER BY turnover.accepted_at DESC,turnover.created_at DESC,turnover.id DESC LIMIT 1
    ) AS latest_turnover ON true
    WHERE deur_record.company_id=erp.current_company_id()
      AND deur_record.status='In Progress'
      AND deur_record.id IS DISTINCT FROM excluded_deur_id
      AND coalesce(latest_turnover.to_operator_id,deur_record.operator_id)=target_operator_id
      AND EXISTS(SELECT 1 FROM erp.deur_events AS event_record
        WHERE event_record.deur_id=deur_record.id AND event_record.activity_type='shift' AND event_record.is_open)
  )
$$;

CREATE OR REPLACE FUNCTION erp.command_initiate_deur_turnover(command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=erp,auth,extensions,pg_catalog AS $$
DECLARE
  tenant text:=erp.current_company_id(); scope jsonb; idem jsonb; payload_hash text;
  now_at timestamptz:=erp.deur_operational_clock(); target_deur erp.deurs%ROWTYPE;
  target_operator erp.operators%ROWTYPE; current_operator text; next_sequence integer;
  created_turnover erp.deur_turnovers%ROWTYPE; response jsonb;
BEGIN
  IF command ?| ARRAY['companyId','company_id','tenantId','tenant_id','actorId','actor_id','status','fromOperatorId']
    OR nullif(btrim(command->>'targetOperatorId'),'') IS NULL
  THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;
  scope:=erp.validate_deur_custody_command_scope(command,'deur.update');
  IF scope->>'code'<>'OK' THEN RETURN jsonb_build_object('success',false,'code',scope->>'code'); END IF;
  idem:=erp.begin_deur_command(command,'INITIATE_DEUR_TURNOVER');
  IF idem->>'state'='MISMATCH' THEN RETURN jsonb_build_object('success',false,'code','IDEMPOTENCY_MISMATCH'); END IF;
  IF idem->>'state'='REPLAY' THEN RETURN (idem->'response')||jsonb_build_object('disposition','REPLAYED'); END IF;
  payload_hash:=idem->>'payloadHash';
  SELECT * INTO target_deur FROM erp.deurs AS deur_record
    WHERE deur_record.id=command->>'deurId' AND deur_record.company_id=tenant FOR UPDATE;
  SELECT * INTO target_operator FROM erp.operators AS operator_record
    WHERE operator_record.id=command->>'targetOperatorId' AND operator_record.company_id=tenant FOR UPDATE;
  IF target_operator.id IS NULL OR target_operator.status<>'Active' THEN RETURN jsonb_build_object('success',false,'code','TARGET_OPERATOR_UNAVAILABLE'); END IF;
  current_operator:=erp.current_deur_authorized_operator(target_deur.id);
  IF target_deur.status<>'In Progress' OR current_operator IS DISTINCT FROM command->>'operatorId'
    OR NOT EXISTS(SELECT 1 FROM erp.deur_events AS event_record WHERE event_record.deur_id=target_deur.id AND event_record.activity_type='shift' AND event_record.is_open)
  THEN RETURN jsonb_build_object('success',false,'code','INVALID_TRANSITION'); END IF;
  IF target_operator.id=current_operator THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;
  IF NOT EXISTS(SELECT 1 FROM erp.users AS user_record WHERE user_record.company_id=tenant
    AND user_record.operator_id=target_operator.id AND user_record.status='active') THEN
    RETURN jsonb_build_object('success',false,'code','TARGET_OPERATOR_NOT_LOGIN_READY');
  END IF;
  IF erp.operator_has_conflicting_open_deur_custody(target_operator.id,target_deur.id)
    OR EXISTS(SELECT 1 FROM erp.deur_turnovers AS turnover WHERE turnover.company_id=tenant AND turnover.to_operator_id=target_operator.id AND turnover.status='PENDING')
  THEN RETURN jsonb_build_object('success',false,'code','TARGET_OPERATOR_CONFLICT'); END IF;
  IF EXISTS(SELECT 1 FROM erp.deur_turnovers AS turnover WHERE turnover.deur_id=target_deur.id AND turnover.status='PENDING') THEN
    RETURN jsonb_build_object('success',false,'code','TURNOVER_PENDING');
  END IF;
  INSERT INTO erp.deur_turnovers(company_id,deur_id,from_operator_id,to_operator_id,initiated_by_application_user_id,status,idempotency_key,initiated_at)
  VALUES(tenant,target_deur.id,current_operator,target_operator.id,auth.uid(),'PENDING',command->>'idempotencyKey',now_at)
  RETURNING * INTO created_turnover;
  SELECT coalesce(max(event_record.sequence),0)+1 INTO next_sequence FROM erp.deur_events AS event_record WHERE event_record.deur_id=target_deur.id;
  INSERT INTO erp.deur_events(id,deur_id,activity_type,action,occurred_at,sequence,source,actor_id,server_accepted_at,client_created_at,command_id,idempotency_key,device_id,is_open,company_id)
  VALUES(extensions.gen_random_uuid()::text,target_deur.id,'turnover','initiate',now_at,next_sequence,'server',auth.uid()::text,now_at,
    nullif(command->>'clientCreatedAt','')::timestamptz,command->>'commandId',command->>'idempotencyKey',command->>'deviceId',false,tenant);
  INSERT INTO erp.audit_log(id,company_id,aggregate_type,aggregate_id,action,actor_id,occurred_at,correlation_id,new_values)
  VALUES(extensions.gen_random_uuid()::text,tenant,'DEUR',target_deur.id,'DEUR_TURNOVER_INITIATED',auth.uid()::text,now_at,command->>'commandId',
    jsonb_build_object('turnoverId',created_turnover.id,'fromOperatorId',current_operator,'toOperatorId',target_operator.id));
  response:=jsonb_build_object('success',true,'disposition','ACCEPTED','serverOccurredAt',now_at,
    'value',jsonb_build_object('turnoverId',created_turnover.id,'deurId',target_deur.id,'primaryOperatorId',target_deur.operator_id,
      'currentAuthorizedOperatorId',current_operator,'pendingOperatorId',target_operator.id,'status','PENDING','version',target_deur.row_version));
  RETURN erp.finish_deur_command(command,'INITIATE_DEUR_TURNOVER',target_deur.id,payload_hash,response);
END $$;

CREATE OR REPLACE FUNCTION erp.command_accept_deur_turnover(command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=erp,auth,extensions,pg_catalog AS $$
DECLARE
  tenant text:=erp.current_company_id(); application_user erp.users%ROWTYPE; idem jsonb; payload_hash text;
  now_at timestamptz:=erp.deur_operational_clock(); target_deur erp.deurs%ROWTYPE;
  target_operator erp.operators%ROWTYPE; target_turnover erp.deur_turnovers%ROWTYPE; next_sequence integer; response jsonb;
BEGIN
  IF command ?| ARRAY['companyId','company_id','tenantId','tenant_id','actorId','actor_id','status','fromOperatorId','toOperatorId']
    OR nullif(btrim(command->>'turnoverId'),'') IS NULL OR nullif(btrim(command->>'operatorId'),'') IS NULL
  THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;
  IF auth.uid() IS NULL OR tenant IS NULL OR NOT erp.current_user_has_permission('deur.update') THEN RETURN jsonb_build_object('success',false,'code','FORBIDDEN'); END IF;
  SELECT * INTO application_user FROM erp.users AS user_record
    WHERE user_record.id=auth.uid() AND user_record.company_id=tenant AND user_record.status='active';
  IF application_user.id IS NULL OR application_user.operator_id IS NULL OR application_user.operator_id<>command->>'operatorId' THEN RETURN jsonb_build_object('success',false,'code','OWNERSHIP_MISMATCH'); END IF;
  idem:=erp.begin_deur_command(command,'ACCEPT_DEUR_TURNOVER');
  IF idem->>'state'='MISMATCH' THEN RETURN jsonb_build_object('success',false,'code','IDEMPOTENCY_MISMATCH'); END IF;
  IF idem->>'state'='REPLAY' THEN RETURN (idem->'response')||jsonb_build_object('disposition','REPLAYED'); END IF;
  payload_hash:=idem->>'payloadHash';
  SELECT * INTO target_turnover FROM erp.deur_turnovers AS turnover
    WHERE turnover.id=(command->>'turnoverId')::uuid AND turnover.company_id=tenant FOR UPDATE;
  IF target_turnover.id IS NULL THEN RETURN jsonb_build_object('success',false,'code','NOT_FOUND'); END IF;
  SELECT * INTO target_deur FROM erp.deurs AS deur_record
    WHERE deur_record.id=target_turnover.deur_id AND deur_record.company_id=tenant FOR UPDATE;
  SELECT * INTO target_operator FROM erp.operators AS operator_record
    WHERE operator_record.id=application_user.operator_id AND operator_record.company_id=tenant FOR UPDATE;
  IF target_turnover.status<>'PENDING' OR target_turnover.to_operator_id<>application_user.operator_id
    OR target_operator.id IS NULL OR target_operator.status<>'Active'
    OR target_deur.status<>'In Progress'
    OR erp.current_deur_authorized_operator(target_deur.id) IS DISTINCT FROM target_turnover.from_operator_id
    OR NOT EXISTS(SELECT 1 FROM erp.deur_events AS event_record WHERE event_record.deur_id=target_deur.id AND event_record.activity_type='shift' AND event_record.is_open)
    OR erp.operator_has_conflicting_open_deur_custody(application_user.operator_id,target_deur.id)
  THEN RETURN jsonb_build_object('success',false,'code','INVALID_TRANSITION'); END IF;
  UPDATE erp.deur_turnovers AS turnover SET status='ACCEPTED',accepted_at=now_at,accepted_by_application_user_id=auth.uid()
    WHERE turnover.id=target_turnover.id RETURNING * INTO target_turnover;
  SELECT coalesce(max(event_record.sequence),0)+1 INTO next_sequence FROM erp.deur_events AS event_record WHERE event_record.deur_id=target_deur.id;
  INSERT INTO erp.deur_events(id,deur_id,activity_type,action,occurred_at,sequence,source,actor_id,server_accepted_at,client_created_at,command_id,idempotency_key,device_id,is_open,company_id)
  VALUES(extensions.gen_random_uuid()::text,target_deur.id,'turnover','accept',now_at,next_sequence,'server',auth.uid()::text,now_at,
    nullif(command->>'clientCreatedAt','')::timestamptz,command->>'commandId',command->>'idempotencyKey',command->>'deviceId',false,tenant);
  INSERT INTO erp.audit_log(id,company_id,aggregate_type,aggregate_id,action,actor_id,occurred_at,correlation_id,new_values)
  VALUES(extensions.gen_random_uuid()::text,tenant,'DEUR',target_deur.id,'DEUR_TURNOVER_ACCEPTED',auth.uid()::text,now_at,command->>'commandId',
    jsonb_build_object('turnoverId',target_turnover.id,'fromOperatorId',target_turnover.from_operator_id,'toOperatorId',target_turnover.to_operator_id));
  response:=jsonb_build_object('success',true,'disposition','ACCEPTED','serverOccurredAt',now_at,
    'value',jsonb_build_object('turnoverId',target_turnover.id,'deurId',target_deur.id,'primaryOperatorId',target_deur.operator_id,
      'currentAuthorizedOperatorId',target_turnover.to_operator_id,'status','ACCEPTED','version',target_deur.row_version));
  RETURN erp.finish_deur_command(command,'ACCEPT_DEUR_TURNOVER',target_deur.id,payload_hash,response);
END $$;

CREATE OR REPLACE FUNCTION erp.command_transition_deur_activity(command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,auth,extensions,pg_catalog AS $$
DECLARE
  tenant text:=erp.current_company_id(); scope jsonb; idem jsonb; now_at timestamptz:=erp.deur_operational_clock();
  current_deur erp.deurs%ROWTYPE; response jsonb; payload_hash text; next_activity text; next_sequence integer; open_activity text;
BEGIN
  scope:=erp.validate_deur_custody_command_scope(command,'deur.create');
  IF scope->>'code'<>'OK' THEN RETURN jsonb_build_object('success',false,'code',scope->>'code'); END IF;
  idem:=erp.begin_deur_command(command,'ACTIVITY_TRANSITION');
  IF idem->>'state'='MISMATCH' THEN RETURN jsonb_build_object('success',false,'code','IDEMPOTENCY_MISMATCH'); END IF;
  IF idem->>'state'='REPLAY' THEN RETURN (idem->'response')||jsonb_build_object('disposition','REPLAYED'); END IF;
  payload_hash:=idem->>'payloadHash';
  SELECT * INTO current_deur FROM erp.deurs AS deur_record WHERE deur_record.id=(command->>'deurId') AND deur_record.company_id=tenant FOR UPDATE;
  IF current_deur.id IS NULL THEN RETURN jsonb_build_object('success',false,'code','NOT_FOUND'); END IF;
  IF current_deur.rental_equipment_line_id<>command->>'rentalLineId' OR erp.current_deur_authorized_operator(current_deur.id)<>command->>'operatorId' THEN RETURN jsonb_build_object('success',false,'code','OWNERSHIP_MISMATCH'); END IF;
  IF current_deur.row_version<>(command->>'expectedVersion')::bigint THEN RETURN jsonb_build_object('success',false,'code','CONFLICT','aggregateId',current_deur.id,'expectedVersion',(command->>'expectedVersion')::bigint,'currentVersion',current_deur.row_version,'refreshRequired',true); END IF;
  IF current_deur.status<>'In Progress' THEN RETURN jsonb_build_object('success',false,'code','INVALID_TRANSITION'); END IF;
  SELECT event_record.activity_type INTO open_activity FROM erp.deur_events AS event_record WHERE event_record.deur_id=current_deur.id AND event_record.is_open AND event_record.activity_type<>'shift' FOR UPDATE;
  next_activity:=CASE command->>'action' WHEN 'START_OPERATION' THEN 'operation' WHEN 'RESUME_OPERATION' THEN 'operation' WHEN 'START_IDLE' THEN 'idle' WHEN 'START_STANDBY' THEN 'standby' WHEN 'START_MEAL_BREAK' THEN 'mealBreak' WHEN 'START_BREAKDOWN' THEN 'breakdown' WHEN 'END_ACTIVITY' THEN NULL ELSE 'INVALID' END;
  IF next_activity='INVALID' OR next_activity IS NOT DISTINCT FROM open_activity THEN RETURN jsonb_build_object('success',false,'code','INVALID_TRANSITION'); END IF;
  UPDATE erp.deur_events AS event_record SET is_open=false WHERE event_record.deur_id=current_deur.id AND event_record.is_open AND event_record.activity_type<>'shift';
  SELECT coalesce(max(event_record.sequence),0)+1 INTO next_sequence FROM erp.deur_events AS event_record WHERE event_record.deur_id=current_deur.id;
  IF open_activity IS NOT NULL THEN INSERT INTO erp.deur_events(id,deur_id,activity_type,action,occurred_at,sequence,source,actor_id,server_accepted_at,client_created_at,command_id,idempotency_key,device_id,is_open,company_id) VALUES(extensions.gen_random_uuid()::text,current_deur.id,open_activity,'end',now_at,next_sequence,'server',auth.uid()::text,now_at,nullif(command->>'clientCreatedAt','')::timestamptz,command->>'commandId',command->>'idempotencyKey',command->>'deviceId',false,tenant); next_sequence:=next_sequence+1; END IF;
  IF next_activity IS NOT NULL THEN INSERT INTO erp.deur_events(id,deur_id,activity_type,action,occurred_at,sequence,source,actor_id,server_accepted_at,client_created_at,command_id,idempotency_key,device_id,is_open,company_id) VALUES(extensions.gen_random_uuid()::text,current_deur.id,next_activity,'start',now_at,next_sequence,'server',auth.uid()::text,now_at,nullif(command->>'clientCreatedAt','')::timestamptz,command->>'commandId',command->>'idempotencyKey',command->>'deviceId',true,tenant); END IF;
  UPDATE erp.deurs AS deur_record SET updated_at=now_at,updated_by=auth.uid()::text WHERE deur_record.id=current_deur.id RETURNING * INTO current_deur;
  INSERT INTO erp.audit_log(id,aggregate_type,aggregate_id,action,actor_id,occurred_at,correlation_id,new_values,company_id) VALUES(extensions.gen_random_uuid()::text,'DEUR',current_deur.id,'ACTIVITY_TRANSITION',auth.uid()::text,now_at,command->>'commandId',jsonb_build_object('action',command->>'action','currentAuthorizedOperatorId',command->>'operatorId'),tenant);
  response:=jsonb_build_object('success',true,'disposition','ACCEPTED','record',to_jsonb(current_deur),'version',current_deur.row_version,'serverOccurredAt',now_at);
  RETURN erp.finish_deur_command(command,'ACTIVITY_TRANSITION',current_deur.id,payload_hash,response);
END $$;

CREATE OR REPLACE FUNCTION erp.command_complete_deur_shift(command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,auth,extensions,pg_catalog AS $$
DECLARE tenant text:=erp.current_company_id(); scope jsonb; idem jsonb; now_at timestamptz:=erp.deur_operational_clock(); current_deur erp.deurs%ROWTYPE; response jsonb; payload_hash text; next_sequence integer; open_activity text;
BEGIN
  scope:=erp.validate_deur_custody_command_scope(command,'deur.create'); IF scope->>'code'<>'OK' THEN RETURN jsonb_build_object('success',false,'code',scope->>'code'); END IF;
  idem:=erp.begin_deur_command(command,'COMPLETE_SHIFT'); IF idem->>'state'='MISMATCH' THEN RETURN jsonb_build_object('success',false,'code','IDEMPOTENCY_MISMATCH'); END IF; IF idem->>'state'='REPLAY' THEN RETURN (idem->'response')||jsonb_build_object('disposition','REPLAYED'); END IF; payload_hash:=idem->>'payloadHash';
  SELECT * INTO current_deur FROM erp.deurs AS deur_record WHERE deur_record.id=(command->>'deurId') AND deur_record.company_id=tenant FOR UPDATE;
  IF current_deur.id IS NULL THEN RETURN jsonb_build_object('success',false,'code','NOT_FOUND'); END IF;
  IF erp.current_deur_authorized_operator(current_deur.id)<>command->>'operatorId' THEN RETURN jsonb_build_object('success',false,'code','OWNERSHIP_MISMATCH'); END IF;
  IF current_deur.row_version<>(command->>'expectedVersion')::bigint THEN RETURN jsonb_build_object('success',false,'code','CONFLICT','aggregateId',current_deur.id,'expectedVersion',(command->>'expectedVersion')::bigint,'currentVersion',current_deur.row_version,'refreshRequired',true); END IF;
  IF current_deur.status<>'In Progress' THEN RETURN jsonb_build_object('success',false,'code','INVALID_TRANSITION'); END IF;
  IF command->>'meterRequirement' IN ('hourMeter','odometer') AND nullif(command->>'closingMeter','') IS NULL THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;
  SELECT event_record.activity_type INTO open_activity FROM erp.deur_events AS event_record WHERE event_record.deur_id=current_deur.id AND event_record.is_open AND event_record.activity_type<>'shift' FOR UPDATE;
  UPDATE erp.deur_events AS event_record SET is_open=false WHERE event_record.deur_id=current_deur.id AND event_record.is_open;
  SELECT coalesce(max(event_record.sequence),0)+1 INTO next_sequence FROM erp.deur_events AS event_record WHERE event_record.deur_id=current_deur.id;
  IF open_activity IS NOT NULL THEN INSERT INTO erp.deur_events(id,deur_id,activity_type,action,occurred_at,sequence,source,actor_id,server_accepted_at,client_created_at,command_id,idempotency_key,device_id,is_open,company_id) VALUES(extensions.gen_random_uuid()::text,current_deur.id,open_activity,'end',now_at,next_sequence,'server',auth.uid()::text,now_at,nullif(command->>'clientCreatedAt','')::timestamptz,command->>'commandId',command->>'idempotencyKey',command->>'deviceId',false,tenant); next_sequence:=next_sequence+1; END IF;
  INSERT INTO erp.deur_events(id,deur_id,activity_type,action,occurred_at,sequence,source,actor_id,server_accepted_at,client_created_at,command_id,idempotency_key,device_id,is_open,company_id) VALUES(extensions.gen_random_uuid()::text,current_deur.id,'shift','end',now_at,next_sequence,'server',auth.uid()::text,now_at,nullif(command->>'clientCreatedAt','')::timestamptz,command->>'commandId',command->>'idempotencyKey',command->>'deviceId',false,tenant);
  UPDATE erp.deurs AS deur_record SET closing_meter=coalesce(nullif(command->>'closingMeter','')::numeric,deur_record.closing_meter),updated_at=now_at,updated_by=auth.uid()::text WHERE deur_record.id=current_deur.id RETURNING * INTO current_deur;
  INSERT INTO erp.audit_log(id,aggregate_type,aggregate_id,action,actor_id,occurred_at,correlation_id,new_values,company_id) VALUES(extensions.gen_random_uuid()::text,'DEUR',current_deur.id,'COMPLETE_SHIFT',auth.uid()::text,now_at,command->>'commandId',to_jsonb(current_deur),tenant);
  response:=jsonb_build_object('success',true,'disposition','ACCEPTED','record',to_jsonb(current_deur),'version',current_deur.row_version,'serverOccurredAt',now_at);
  RETURN erp.finish_deur_command(command,'COMPLETE_SHIFT',current_deur.id,payload_hash,response);
END $$;

CREATE OR REPLACE FUNCTION erp.command_submit_deur(command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,auth,extensions,pg_catalog AS $$
DECLARE scope jsonb; idem jsonb; now_at timestamptz:=clock_timestamp(); current_deur erp.deurs%ROWTYPE; response jsonb; payload_hash text; corrected_complete boolean:=false;
BEGIN
  scope:=erp.validate_deur_custody_command_scope(command,'deur.create'); IF scope->>'code'<>'OK' THEN RETURN jsonb_build_object('success',false,'code',scope->>'code'); END IF;
  idem:=erp.begin_deur_command(command,'SUBMIT_DEUR'); IF idem->>'state'='MISMATCH' THEN RETURN jsonb_build_object('success',false,'code','IDEMPOTENCY_MISMATCH'); END IF; IF idem->>'state'='REPLAY' THEN RETURN (idem->'response')||jsonb_build_object('disposition','REPLAYED'); END IF; payload_hash:=idem->>'payloadHash';
  SELECT * INTO current_deur FROM erp.deurs AS deur_record WHERE deur_record.id=(command->>'deurId') AND deur_record.company_id=erp.current_company_id() FOR UPDATE;
  IF current_deur.id IS NULL THEN RETURN jsonb_build_object('success',false,'code','NOT_FOUND'); END IF;
  IF erp.current_deur_authorized_operator(current_deur.id)<>command->>'operatorId' THEN RETURN jsonb_build_object('success',false,'code','OWNERSHIP_MISMATCH'); END IF;
  IF current_deur.row_version<>(command->>'expectedVersion')::bigint THEN RETURN jsonb_build_object('success',false,'code','CONFLICT','aggregateId',current_deur.id,'expectedVersion',(command->>'expectedVersion')::bigint,'currentVersion',current_deur.row_version,'refreshRequired',true); END IF;
  corrected_complete:=current_deur.status='Draft' AND current_deur.previous_revision_id IS NOT NULL AND EXISTS(SELECT 1 FROM erp.deur_events AS event_record WHERE event_record.deur_id=current_deur.id AND event_record.source='correction' AND event_record.activity_type='shift' AND event_record.action='end') AND NOT EXISTS(SELECT 1 FROM erp.deur_events AS event_record WHERE event_record.deur_id=current_deur.id AND event_record.source<>'correction');
  IF (current_deur.status<>'In Progress' AND NOT corrected_complete) OR EXISTS(SELECT 1 FROM erp.deur_events AS event_record WHERE event_record.deur_id=current_deur.id AND event_record.is_open) OR NOT EXISTS(SELECT 1 FROM erp.deur_events AS event_record WHERE event_record.deur_id=current_deur.id AND event_record.activity_type='shift' AND event_record.action='end') THEN RETURN jsonb_build_object('success',false,'code','INVALID_TRANSITION'); END IF;
  UPDATE erp.deurs AS deur_record SET status='Submitted',submitted_at=now_at,submitted_by=auth.uid()::text,updated_at=now_at,updated_by=auth.uid()::text WHERE deur_record.id=current_deur.id RETURNING * INTO current_deur;
  INSERT INTO erp.audit_log(id,aggregate_type,aggregate_id,action,actor_id,occurred_at,correlation_id,new_values,company_id) VALUES(extensions.gen_random_uuid()::text,'DEUR',current_deur.id,'SUBMIT_DEUR',auth.uid()::text,now_at,command->>'commandId',to_jsonb(current_deur),current_deur.company_id);
  response:=jsonb_build_object('success',true,'disposition','ACCEPTED','record',to_jsonb(current_deur),'version',current_deur.row_version,'serverOccurredAt',now_at);
  RETURN erp.finish_deur_command(command,'SUBMIT_DEUR',current_deur.id,payload_hash,response);
END $$;

ALTER FUNCTION erp.current_deur_authorized_operator(text) OWNER TO postgres;
ALTER FUNCTION erp.resolve_deur_authorized_operator(text,text) OWNER TO postgres;
ALTER FUNCTION erp.validate_deur_custody_command_scope(jsonb,text) OWNER TO postgres;
ALTER FUNCTION erp.operator_has_conflicting_open_deur_custody(text,text) OWNER TO postgres;
ALTER FUNCTION erp.command_initiate_deur_turnover(jsonb) OWNER TO postgres;
ALTER FUNCTION erp.command_accept_deur_turnover(jsonb) OWNER TO postgres;
ALTER FUNCTION erp.command_transition_deur_activity(jsonb) OWNER TO postgres;
ALTER FUNCTION erp.command_complete_deur_shift(jsonb) OWNER TO postgres;
ALTER FUNCTION erp.command_submit_deur(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.current_deur_authorized_operator(text),erp.resolve_deur_authorized_operator(text,text),erp.validate_deur_custody_command_scope(jsonb,text),erp.operator_has_conflicting_open_deur_custody(text,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION erp.command_initiate_deur_turnover(jsonb),erp.command_accept_deur_turnover(jsonb) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION erp.command_initiate_deur_turnover(jsonb),erp.command_accept_deur_turnover(jsonb) TO authenticated;
REVOKE ALL ON FUNCTION erp.command_transition_deur_activity(jsonb),erp.command_complete_deur_shift(jsonb),erp.command_submit_deur(jsonb) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION erp.command_transition_deur_activity(jsonb),erp.command_complete_deur_shift(jsonb),erp.command_submit_deur(jsonb) TO authenticated;

COMMIT;
