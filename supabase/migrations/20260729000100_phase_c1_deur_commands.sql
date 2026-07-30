BEGIN;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
SET search_path TO erp, public;

-- Phase B exposes this projection with user_roles.user_id::uuid. PostgreSQL
-- blocks the underlying text-to-uuid conversion while the view depends on the
-- column, so reproduce the same projection after the canonical type change.
DROP VIEW IF EXISTS effective_user_permissions;
ALTER TABLE user_roles ALTER COLUMN user_id TYPE uuid USING user_id::uuid;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_user_roles_user') THEN
    ALTER TABLE user_roles ADD CONSTRAINT fk_user_roles_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END $$;
CREATE OR REPLACE VIEW effective_user_permissions AS
SELECT ur.user_id, p.code AS permission_code
FROM user_roles ur JOIN app_roles r ON r.id=ur.role_id
JOIN role_permissions rp ON rp.role_id=r.id JOIN app_permissions p ON p.id=rp.permission_id;
GRANT SELECT ON effective_user_permissions TO authenticated;

ALTER TABLE deur_events ADD COLUMN IF NOT EXISTS server_accepted_at timestamptz NOT NULL DEFAULT clock_timestamp();
ALTER TABLE deur_events ADD COLUMN IF NOT EXISTS client_created_at timestamptz;
ALTER TABLE deur_events ADD COLUMN IF NOT EXISTS command_id text;
ALTER TABLE deur_events ADD COLUMN IF NOT EXISTS idempotency_key text;
ALTER TABLE deur_events ADD COLUMN IF NOT EXISTS device_id text;
ALTER TABLE deur_events ADD COLUMN IF NOT EXISTS is_open boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS uq_deur_open_primary_activity
  ON deur_events(deur_id) WHERE is_open AND activity_type <> 'shift';
CREATE UNIQUE INDEX IF NOT EXISTS uq_deur_open_shift
  ON deur_events(deur_id) WHERE is_open AND activity_type = 'shift';
CREATE UNIQUE INDEX IF NOT EXISTS uq_active_deur_line_work_shift
  ON deurs(rental_equipment_line_id,work_date,coalesce(shift,''))
  WHERE status IN ('Draft','In Progress');
CREATE UNIQUE INDEX IF NOT EXISTS uq_active_deur_equipment
  ON deurs(equipment_id) WHERE status IN ('Draft','In Progress');

CREATE TABLE deur_command_idempotency (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key text NOT NULL,
  actor_id uuid NOT NULL REFERENCES auth.users(id),
  command_type text NOT NULL,
  aggregate_id text,
  payload_hash text NOT NULL,
  status text NOT NULL CHECK(status IN ('COMPLETED','REJECTED')),
  response jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL DEFAULT (clock_timestamp() + interval '30 days'),
  UNIQUE(actor_id,idempotency_key)
);
ALTER TABLE deur_command_idempotency ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON deur_command_idempotency FROM anon, authenticated;
ALTER TABLE work_descriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS work_descriptions_authenticated_read ON work_descriptions;
CREATE POLICY work_descriptions_authenticated_read ON work_descriptions FOR SELECT TO authenticated USING (deleted_at IS NULL);
GRANT SELECT ON work_descriptions TO authenticated;

CREATE OR REPLACE FUNCTION current_app_user()
RETURNS users LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=erp,public,auth AS $$
  SELECT u.* FROM users u WHERE u.id=auth.uid() AND u.status='active'
$$;

CREATE OR REPLACE FUNCTION current_user_has_permission(required_permission text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=erp,public,auth AS $$
  SELECT EXISTS(
    SELECT 1 FROM effective_user_permissions p
    WHERE p.user_id=auth.uid() AND p.permission_code=required_permission
  )
$$;

CREATE OR REPLACE FUNCTION validate_deur_command_scope(command jsonb, required_permission text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=erp,public,auth AS $$
DECLARE app_user users; target_operator operators; target_rental rentals;
 target_line rental_equipment_lines; target_assignment assignments;
BEGIN
  IF auth.uid() IS NULL THEN RETURN jsonb_build_object('code','UNAUTHENTICATED'); END IF;
  SELECT * INTO app_user FROM current_app_user();
  IF app_user.id IS NULL THEN RETURN jsonb_build_object('code','USER_INACTIVE'); END IF;
  IF NOT current_user_has_permission(required_permission) THEN RETURN jsonb_build_object('code','FORBIDDEN'); END IF;
  IF app_user.operator_id IS NULL OR app_user.operator_id <> command->>'operatorId' THEN RETURN jsonb_build_object('code','OWNERSHIP_MISMATCH'); END IF;
  SELECT * INTO target_operator FROM operators WHERE id=command->>'operatorId';
  IF target_operator.id IS NULL THEN RETURN jsonb_build_object('code','NOT_FOUND'); END IF;
  IF target_operator.status <> 'Active' THEN RETURN jsonb_build_object('code','OPERATOR_INACTIVE'); END IF;
  SELECT * INTO target_rental FROM rentals WHERE id=command->>'rentalId';
  IF target_rental.id IS NULL THEN RETURN jsonb_build_object('code','NOT_FOUND'); END IF;
  IF target_rental.status NOT IN ('Released','Active') THEN RETURN jsonb_build_object('code','RENTAL_INACTIVE'); END IF;
  SELECT * INTO target_line FROM rental_equipment_lines WHERE id=command->>'rentalLineId';
  IF target_line.id IS NULL THEN RETURN jsonb_build_object('code','NOT_FOUND'); END IF;
  IF target_line.status NOT IN ('Released','Active') OR target_line.deleted_at IS NOT NULL THEN RETURN jsonb_build_object('code','RENTAL_LINE_INACTIVE'); END IF;
  IF target_line.rental_id <> target_rental.id THEN RETURN jsonb_build_object('code','VALIDATION_REJECTED'); END IF;
  IF target_line.equipment_id <> command->>'equipmentId' THEN RETURN jsonb_build_object('code','EQUIPMENT_MISMATCH'); END IF;
  IF target_line.operator_id <> app_user.operator_id THEN RETURN jsonb_build_object('code','OPERATOR_MISMATCH'); END IF;
  IF target_line.assignment_id IS DISTINCT FROM command->>'assignmentId' THEN RETURN jsonb_build_object('code','ASSIGNMENT_MISMATCH'); END IF;
  SELECT * INTO target_assignment FROM assignments WHERE id=command->>'assignmentId';
  IF target_assignment.id IS NULL THEN RETURN jsonb_build_object('code','NOT_FOUND'); END IF;
  IF target_assignment.status <> 'Active' OR target_assignment.deleted_at IS NOT NULL THEN RETURN jsonb_build_object('code','ASSIGNMENT_INACTIVE'); END IF;
  IF target_assignment.equipment_id <> target_line.equipment_id OR target_assignment.operator_id <> target_line.operator_id THEN RETURN jsonb_build_object('code','ASSIGNMENT_MISMATCH'); END IF;
  RETURN jsonb_build_object('code','OK','userId',app_user.id,'operatorId',app_user.operator_id);
END $$;

CREATE OR REPLACE FUNCTION begin_deur_command(command jsonb, command_type text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,public,auth AS $$
DECLARE existing deur_command_idempotency; payload_hash text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text||':'||coalesce(command->>'idempotencyKey',''),0));
  payload_hash=encode(digest((command-'idempotencyKey'-'commandId')::text,'sha256'),'hex');
  SELECT * INTO existing FROM deur_command_idempotency WHERE actor_id=auth.uid() AND idempotency_key=command->>'idempotencyKey' FOR UPDATE;
  IF existing.id IS NULL THEN RETURN jsonb_build_object('state','NEW','payloadHash',payload_hash); END IF;
  IF existing.command_type<>command_type OR existing.payload_hash<>payload_hash THEN RETURN jsonb_build_object('state','MISMATCH'); END IF;
  RETURN jsonb_build_object('state','REPLAY','response',existing.response);
END $$;

CREATE OR REPLACE FUNCTION finish_deur_command(command jsonb, command_type text, aggregate_id text, payload_hash text, response jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,public,auth AS $$
BEGIN
  INSERT INTO deur_command_idempotency(idempotency_key,actor_id,command_type,aggregate_id,payload_hash,status,response)
  VALUES(command->>'idempotencyKey',auth.uid(),command_type,aggregate_id,payload_hash,'COMPLETED',response);
  RETURN response;
END $$;

CREATE OR REPLACE FUNCTION next_deur_number()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,public AS $$
DECLARE sequence_value bigint; sequence_year integer=extract(year from clock_timestamp())::integer;
BEGIN
  INSERT INTO number_sequences(scope,sequence_year,current_value,prefix)
  VALUES('DEUR',sequence_year,1,'DEUR') ON CONFLICT(scope,sequence_year)
  DO UPDATE SET current_value=number_sequences.current_value+1,updated_at=clock_timestamp(),row_version=number_sequences.row_version+1
  RETURNING current_value INTO sequence_value;
  RETURN 'DEUR-'||sequence_year||'-'||lpad(sequence_value::text,6,'0');
END $$;

CREATE OR REPLACE FUNCTION command_start_deur_shift(command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,public,auth AS $$
DECLARE scope jsonb; idem jsonb; now_at timestamptz=clock_timestamp(); new_deur deurs; response jsonb; payload_hash text;
BEGIN
  scope=validate_deur_command_scope(command,'deur.create'); IF scope->>'code'<>'OK' THEN RETURN jsonb_build_object('success',false,'code',scope->>'code'); END IF;
  idem=begin_deur_command(command,'START_SHIFT'); IF idem->>'state'='MISMATCH' THEN RETURN jsonb_build_object('success',false,'code','IDEMPOTENCY_MISMATCH'); END IF;
  IF idem->>'state'='REPLAY' THEN RETURN (idem->'response')||jsonb_build_object('disposition','REPLAYED'); END IF; payload_hash=idem->>'payloadHash';
  INSERT INTO deurs(id,deur_number,rental_id,rental_equipment_line_id,assignment_id,equipment_id,operator_id,project_id,customer_id,work_date,shift,status,
    evidence_mode,opening_meter,operational_metadata,operational_remarks,created_at,created_by,updated_at,updated_by,row_version)
  SELECT command->'draft'->>'id',next_deur_number(),command->>'rentalId',command->>'rentalLineId',command->>'assignmentId',command->>'equipmentId',
    command->>'operatorId',r.project_id,r.customer_id,(command->'draft'->>'workDate')::date,command->'draft'->>'shift','In Progress',
    command->'draft'->>'evidenceMode',nullif(command->'draft'->>'openingMeter','')::numeric,coalesce(command->'draft'->'operationalMetadata','{}'::jsonb),
    command->'draft'->>'operationalRemarks',now_at,auth.uid()::text,now_at,auth.uid()::text,1 FROM rentals r WHERE r.id=command->>'rentalId' RETURNING * INTO new_deur;
  INSERT INTO deur_events(id,deur_id,activity_type,action,occurred_at,sequence,source,actor_id,server_accepted_at,client_created_at,command_id,idempotency_key,device_id,is_open)
  VALUES(gen_random_uuid()::text,new_deur.id,'shift','start',now_at,1,'server',auth.uid()::text,now_at,nullif(command->>'clientCreatedAt','')::timestamptz,command->>'commandId',command->>'idempotencyKey',command->>'deviceId',true),
        (gen_random_uuid()::text,new_deur.id,'operation','start',now_at,2,'server',auth.uid()::text,now_at,nullif(command->>'clientCreatedAt','')::timestamptz,command->>'commandId',command->>'idempotencyKey',command->>'deviceId',true);
  INSERT INTO audit_log(id,aggregate_type,aggregate_id,action,actor_id,occurred_at,correlation_id,new_values)
  VALUES(gen_random_uuid()::text,'DEUR',new_deur.id,'START_SHIFT',auth.uid()::text,now_at,command->>'commandId',to_jsonb(new_deur));
  response=jsonb_build_object('success',true,'disposition','ACCEPTED','record',to_jsonb(new_deur),'version',1,'serverOccurredAt',now_at);
  RETURN finish_deur_command(command,'START_SHIFT',new_deur.id,payload_hash,response);
EXCEPTION WHEN unique_violation THEN RETURN jsonb_build_object('success',false,'code','DUPLICATE_ACTIVE_DEUR');
END $$;

CREATE OR REPLACE FUNCTION command_transition_deur_activity(command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,public,auth AS $$
DECLARE scope jsonb; idem jsonb; now_at timestamptz=clock_timestamp(); current_deur deurs; response jsonb; payload_hash text; next_activity text; next_sequence integer; open_activity text;
BEGIN
  scope=validate_deur_command_scope(command,'deur.create'); IF scope->>'code'<>'OK' THEN RETURN jsonb_build_object('success',false,'code',scope->>'code'); END IF;
  idem=begin_deur_command(command,'ACTIVITY_TRANSITION'); IF idem->>'state'='MISMATCH' THEN RETURN jsonb_build_object('success',false,'code','IDEMPOTENCY_MISMATCH'); END IF;
  IF idem->>'state'='REPLAY' THEN RETURN (idem->'response')||jsonb_build_object('disposition','REPLAYED'); END IF; payload_hash=idem->>'payloadHash';
  SELECT * INTO current_deur FROM deurs WHERE id=command->>'deurId' FOR UPDATE;
  IF current_deur.id IS NULL THEN RETURN jsonb_build_object('success',false,'code','NOT_FOUND'); END IF;
  IF current_deur.rental_equipment_line_id<>command->>'rentalLineId' OR current_deur.operator_id<>command->>'operatorId' THEN RETURN jsonb_build_object('success',false,'code','OWNERSHIP_MISMATCH'); END IF;
  IF current_deur.row_version<>(command->>'expectedVersion')::bigint THEN RETURN jsonb_build_object('success',false,'code','CONFLICT','aggregateId',current_deur.id,'expectedVersion',(command->>'expectedVersion')::bigint,'currentVersion',current_deur.row_version,'refreshRequired',true); END IF;
  IF current_deur.status<>'In Progress' THEN RETURN jsonb_build_object('success',false,'code','INVALID_TRANSITION'); END IF;
  SELECT activity_type INTO open_activity FROM deur_events WHERE deur_id=current_deur.id AND is_open AND activity_type<>'shift' FOR UPDATE;
  UPDATE deur_events SET is_open=false WHERE deur_id=current_deur.id AND is_open AND activity_type<>'shift';
  next_activity=CASE command->>'action' WHEN 'START_OPERATION' THEN 'operation' WHEN 'RESUME_OPERATION' THEN 'operation' WHEN 'START_IDLE' THEN 'idle' WHEN 'START_MEAL_BREAK' THEN 'mealBreak' WHEN 'START_BREAKDOWN' THEN 'breakdown' WHEN 'END_ACTIVITY' THEN NULL ELSE 'INVALID' END;
  IF next_activity='INVALID' THEN RETURN jsonb_build_object('success',false,'code','INVALID_TRANSITION'); END IF;
  SELECT coalesce(max(sequence),0)+1 INTO next_sequence FROM deur_events WHERE deur_id=current_deur.id;
  IF open_activity IS NOT NULL THEN
    INSERT INTO deur_events(id,deur_id,activity_type,action,occurred_at,sequence,source,actor_id,server_accepted_at,client_created_at,command_id,idempotency_key,device_id,is_open)
    VALUES(gen_random_uuid()::text,current_deur.id,open_activity,'end',now_at,next_sequence,'server',auth.uid()::text,now_at,nullif(command->>'clientCreatedAt','')::timestamptz,command->>'commandId',command->>'idempotencyKey',command->>'deviceId',false);
    next_sequence=next_sequence+1;
  END IF;
  IF next_activity IS NOT NULL THEN INSERT INTO deur_events(id,deur_id,activity_type,action,occurred_at,sequence,source,actor_id,server_accepted_at,client_created_at,command_id,idempotency_key,device_id,is_open)
    VALUES(gen_random_uuid()::text,current_deur.id,next_activity,'start',now_at,next_sequence,'server',auth.uid()::text,now_at,nullif(command->>'clientCreatedAt','')::timestamptz,command->>'commandId',command->>'idempotencyKey',command->>'deviceId',true); END IF;
  UPDATE deurs SET updated_at=now_at,updated_by=auth.uid()::text WHERE id=current_deur.id RETURNING * INTO current_deur;
  INSERT INTO audit_log(id,aggregate_type,aggregate_id,action,actor_id,occurred_at,correlation_id,new_values) VALUES(gen_random_uuid()::text,'DEUR',current_deur.id,'ACTIVITY_TRANSITION',auth.uid()::text,now_at,command->>'commandId',jsonb_build_object('action',command->>'action'));
  response=jsonb_build_object('success',true,'disposition','ACCEPTED','record',to_jsonb(current_deur),'version',current_deur.row_version,'serverOccurredAt',now_at);
  RETURN finish_deur_command(command,'ACTIVITY_TRANSITION',current_deur.id,payload_hash,response);
END $$;

CREATE OR REPLACE FUNCTION command_complete_deur_shift(command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,public,auth AS $$
DECLARE scope jsonb; idem jsonb; now_at timestamptz=clock_timestamp(); current_deur deurs; response jsonb; payload_hash text; next_sequence integer; open_activity text;
BEGIN
  scope=validate_deur_command_scope(command,'deur.create'); IF scope->>'code'<>'OK' THEN RETURN jsonb_build_object('success',false,'code',scope->>'code'); END IF;
  idem=begin_deur_command(command,'COMPLETE_SHIFT'); IF idem->>'state'='MISMATCH' THEN RETURN jsonb_build_object('success',false,'code','IDEMPOTENCY_MISMATCH'); END IF;
  IF idem->>'state'='REPLAY' THEN RETURN (idem->'response')||jsonb_build_object('disposition','REPLAYED'); END IF; payload_hash=idem->>'payloadHash';
  SELECT * INTO current_deur FROM deurs WHERE id=command->>'deurId' FOR UPDATE;
  IF current_deur.id IS NULL THEN RETURN jsonb_build_object('success',false,'code','NOT_FOUND'); END IF;
  IF current_deur.operator_id<>command->>'operatorId' THEN RETURN jsonb_build_object('success',false,'code','OWNERSHIP_MISMATCH'); END IF;
  IF current_deur.row_version<>(command->>'expectedVersion')::bigint THEN RETURN jsonb_build_object('success',false,'code','CONFLICT','aggregateId',current_deur.id,'expectedVersion',(command->>'expectedVersion')::bigint,'currentVersion',current_deur.row_version,'refreshRequired',true); END IF;
  IF command->>'meterRequirement' IN ('hourMeter','odometer') AND nullif(command->>'closingMeter','') IS NULL THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;
  SELECT activity_type INTO open_activity FROM deur_events WHERE deur_id=current_deur.id AND is_open AND activity_type<>'shift' FOR UPDATE;
  UPDATE deur_events SET is_open=false WHERE deur_id=current_deur.id AND is_open;
  SELECT coalesce(max(sequence),0)+1 INTO next_sequence FROM deur_events WHERE deur_id=current_deur.id;
  IF open_activity IS NOT NULL THEN
    INSERT INTO deur_events(id,deur_id,activity_type,action,occurred_at,sequence,source,actor_id,server_accepted_at,client_created_at,command_id,idempotency_key,device_id,is_open)
    VALUES(gen_random_uuid()::text,current_deur.id,open_activity,'end',now_at,next_sequence,'server',auth.uid()::text,now_at,nullif(command->>'clientCreatedAt','')::timestamptz,command->>'commandId',command->>'idempotencyKey',command->>'deviceId',false);
    next_sequence=next_sequence+1;
  END IF;
  INSERT INTO deur_events(id,deur_id,activity_type,action,occurred_at,sequence,source,actor_id,server_accepted_at,client_created_at,command_id,idempotency_key,device_id,is_open)
  VALUES(gen_random_uuid()::text,current_deur.id,'shift','end',now_at,next_sequence,'server',auth.uid()::text,now_at,nullif(command->>'clientCreatedAt','')::timestamptz,command->>'commandId',command->>'idempotencyKey',command->>'deviceId',false);
  UPDATE deurs SET closing_meter=coalesce(nullif(command->>'closingMeter','')::numeric,closing_meter),updated_at=now_at,updated_by=auth.uid()::text WHERE id=current_deur.id RETURNING * INTO current_deur;
  INSERT INTO audit_log(id,aggregate_type,aggregate_id,action,actor_id,occurred_at,correlation_id,new_values) VALUES(gen_random_uuid()::text,'DEUR',current_deur.id,'COMPLETE_SHIFT',auth.uid()::text,now_at,command->>'commandId',to_jsonb(current_deur));
  response=jsonb_build_object('success',true,'disposition','ACCEPTED','record',to_jsonb(current_deur),'version',current_deur.row_version,'serverOccurredAt',now_at);
  RETURN finish_deur_command(command,'COMPLETE_SHIFT',current_deur.id,payload_hash,response);
END $$;

CREATE OR REPLACE FUNCTION command_submit_deur(command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,public,auth AS $$
DECLARE scope jsonb; idem jsonb; now_at timestamptz=clock_timestamp(); current_deur deurs; response jsonb; payload_hash text;
BEGIN
  scope=validate_deur_command_scope(command,'deur.review'); IF scope->>'code'<>'OK' THEN RETURN jsonb_build_object('success',false,'code',scope->>'code'); END IF;
  idem=begin_deur_command(command,'SUBMIT_DEUR'); IF idem->>'state'='MISMATCH' THEN RETURN jsonb_build_object('success',false,'code','IDEMPOTENCY_MISMATCH'); END IF;
  IF idem->>'state'='REPLAY' THEN RETURN (idem->'response')||jsonb_build_object('disposition','REPLAYED'); END IF; payload_hash=idem->>'payloadHash';
  SELECT * INTO current_deur FROM deurs WHERE id=command->>'deurId' FOR UPDATE;
  IF current_deur.id IS NULL THEN RETURN jsonb_build_object('success',false,'code','NOT_FOUND'); END IF;
  IF current_deur.operator_id<>command->>'operatorId' THEN RETURN jsonb_build_object('success',false,'code','OWNERSHIP_MISMATCH'); END IF;
  IF current_deur.row_version<>(command->>'expectedVersion')::bigint THEN RETURN jsonb_build_object('success',false,'code','CONFLICT','aggregateId',current_deur.id,'expectedVersion',(command->>'expectedVersion')::bigint,'currentVersion',current_deur.row_version,'refreshRequired',true); END IF;
  IF current_deur.status<>'In Progress' OR EXISTS(SELECT 1 FROM deur_events WHERE deur_id=current_deur.id AND is_open) OR NOT EXISTS(SELECT 1 FROM deur_events WHERE deur_id=current_deur.id AND activity_type='shift' AND action='end') THEN RETURN jsonb_build_object('success',false,'code','INVALID_TRANSITION'); END IF;
  UPDATE deurs SET status='Submitted',submitted_at=now_at,submitted_by=auth.uid()::text,updated_at=now_at,updated_by=auth.uid()::text WHERE id=current_deur.id RETURNING * INTO current_deur;
  INSERT INTO audit_log(id,aggregate_type,aggregate_id,action,actor_id,occurred_at,correlation_id,new_values) VALUES(gen_random_uuid()::text,'DEUR',current_deur.id,'SUBMIT_DEUR',auth.uid()::text,now_at,command->>'commandId',to_jsonb(current_deur));
  response=jsonb_build_object('success',true,'disposition','ACCEPTED','record',to_jsonb(current_deur),'version',current_deur.row_version,'serverOccurredAt',now_at);
  RETURN finish_deur_command(command,'SUBMIT_DEUR',current_deur.id,payload_hash,response);
END $$;

REVOKE ALL ON FUNCTION command_start_deur_shift(jsonb),command_transition_deur_activity(jsonb),command_complete_deur_shift(jsonb),command_submit_deur(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION command_start_deur_shift(jsonb),command_transition_deur_activity(jsonb),command_complete_deur_shift(jsonb),command_submit_deur(jsonb) TO authenticated;
REVOKE INSERT,UPDATE,DELETE ON deurs,deur_events FROM anon,authenticated;

DROP POLICY IF EXISTS deurs_authenticated_read ON deurs;
CREATE POLICY deurs_operator_or_privileged_read ON deurs FOR SELECT TO authenticated USING (
  operator_id=(SELECT operator_id FROM users WHERE id=auth.uid()) OR current_user_has_permission('deur.review')
);
DROP POLICY IF EXISTS deur_events_authenticated_read ON deur_events;
CREATE POLICY deur_events_operator_or_privileged_read ON deur_events FOR SELECT TO authenticated USING (
  EXISTS(SELECT 1 FROM deurs d WHERE d.id=deur_id AND (d.operator_id=(SELECT operator_id FROM users WHERE id=auth.uid()) OR current_user_has_permission('deur.review')))
);
DROP POLICY IF EXISTS rental_equipment_lines_authenticated_read ON rental_equipment_lines;
CREATE POLICY rental_lines_operator_or_privileged_read ON rental_equipment_lines FOR SELECT TO authenticated USING (
  operator_id=(SELECT operator_id FROM users WHERE id=auth.uid()) OR current_user_has_permission('rental.read')
);
DROP POLICY IF EXISTS assignments_authenticated_read ON assignments;
CREATE POLICY assignments_operator_or_privileged_read ON assignments FOR SELECT TO authenticated USING (
  operator_id=(SELECT operator_id FROM users WHERE id=auth.uid()) OR current_user_has_permission('assignment.read')
);

COMMIT;
