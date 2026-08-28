BEGIN;

CREATE TABLE erp.user_password_reset_commands (
  company_id text NOT NULL,
  idempotency_key text NOT NULL,
  command_id text NOT NULL,
  actor_id uuid NOT NULL,
  target_user_id uuid NOT NULL,
  payload_hash text NOT NULL,
  state text NOT NULL CHECK (state IN ('PENDING','COMPLETED','FAILED')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  completed_at timestamptz,
  PRIMARY KEY (company_id,idempotency_key)
);

REVOKE ALL ON erp.user_password_reset_commands FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION erp.prepare_application_user_password_reset(command jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,pg_catalog AS $$
DECLARE
  actor uuid=nullif(command->>'actorId','')::uuid;
  target uuid=nullif(command->>'targetUserId','')::uuid;
  tenant text=nullif(trim(command->>'companyId'),'');
  command_id text=nullif(trim(command->>'commandId'),'');
  idem text=nullif(trim(command->>'idempotencyKey'),'');
  expected_hash text;
  existing erp.user_password_reset_commands;
BEGIN
  IF actor IS NULL OR target IS NULL OR tenant IS NULL OR command_id IS NULL OR idem IS NULL
     OR NOT EXISTS(SELECT 1 FROM erp.users u WHERE u.id=actor AND u.company_id=tenant AND u.status='active')
     OR NOT EXISTS(SELECT 1 FROM erp.effective_user_permissions p WHERE p.user_id=actor AND p.permission_code='users.password.reset')
  THEN RETURN jsonb_build_object('success',false,'code','FORBIDDEN');END IF;
  IF NOT EXISTS(SELECT 1 FROM erp.users u WHERE u.id=target AND u.company_id=tenant AND u.status='active')
  THEN RETURN jsonb_build_object('success',false,'code','NOT_FOUND');END IF;
  expected_hash=encode(extensions.digest(convert_to(jsonb_build_object('targetUserId',target)::text,'UTF8'),'sha256'),'hex');
  PERFORM pg_advisory_xact_lock(hashtextextended(tenant||':user-password-reset:'||idem,0));
  SELECT * INTO existing FROM erp.user_password_reset_commands WHERE company_id=tenant AND idempotency_key=idem FOR UPDATE;
  IF existing.idempotency_key IS NOT NULL THEN
    IF existing.payload_hash<>expected_hash OR existing.command_id<>command_id OR existing.actor_id<>actor
    THEN RETURN jsonb_build_object('success',false,'code','IDEMPOTENCY_MISMATCH','message','The request key was already used for different input.');END IF;
    RETURN jsonb_build_object('success',true,'state',existing.state);
  END IF;
  INSERT INTO erp.user_password_reset_commands(company_id,idempotency_key,command_id,actor_id,target_user_id,payload_hash,state)
  VALUES(tenant,idem,command_id,actor,target,expected_hash,'PENDING');
  RETURN jsonb_build_object('success',true,'state','NEW');
END $$;

CREATE FUNCTION erp.complete_application_user_password_reset(command jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,pg_catalog AS $$
DECLARE
  actor uuid=nullif(command->>'actorId','')::uuid;
  target uuid=nullif(command->>'targetUserId','')::uuid;
  tenant text=nullif(trim(command->>'companyId'),'');
  command_id text=nullif(trim(command->>'commandId'),'');
  idem text=nullif(trim(command->>'idempotencyKey'),'');
  existing erp.user_password_reset_commands;
BEGIN
  SELECT * INTO existing FROM erp.user_password_reset_commands WHERE company_id=tenant AND idempotency_key=idem FOR UPDATE;
  IF existing.idempotency_key IS NULL OR existing.actor_id<>actor OR existing.target_user_id<>target OR existing.command_id<>command_id
  THEN RETURN jsonb_build_object('success',false,'code','NOT_FOUND');END IF;
  IF existing.state='COMPLETED' THEN RETURN jsonb_build_object('success',true,'state','COMPLETED');END IF;
  IF existing.state<>'PENDING' THEN RETURN jsonb_build_object('success',false,'code','INVALID_STATE');END IF;
  INSERT INTO erp.audit_log(id,company_id,aggregate_type,aggregate_id,action,actor_id,occurred_at,correlation_id,new_values)
  VALUES(extensions.gen_random_uuid()::text,tenant,'User',target::text,'USER_ACCESS_RESET',actor::text,clock_timestamp(),command_id,jsonb_build_object('credentialType','SUPABASE_AUTH_WEB_CREDENTIAL'));
  UPDATE erp.user_password_reset_commands SET state='COMPLETED',completed_at=clock_timestamp() WHERE company_id=tenant AND idempotency_key=idem;
  RETURN jsonb_build_object('success',true,'state','COMPLETED');
END $$;

CREATE FUNCTION erp.fail_application_user_password_reset(command jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,pg_catalog AS $$
BEGIN
  UPDATE erp.user_password_reset_commands SET state='FAILED'
  WHERE company_id=command->>'companyId' AND idempotency_key=command->>'idempotencyKey'
    AND command_id=command->>'commandId' AND actor_id=nullif(command->>'actorId','')::uuid
    AND target_user_id=nullif(command->>'targetUserId','')::uuid AND state='PENDING';
  RETURN jsonb_build_object('success',FOUND);
END $$;

REVOKE ALL ON FUNCTION erp.prepare_application_user_password_reset(jsonb),erp.complete_application_user_password_reset(jsonb),erp.fail_application_user_password_reset(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION erp.prepare_application_user_password_reset(jsonb),erp.complete_application_user_password_reset(jsonb),erp.fail_application_user_password_reset(jsonb) TO service_role;

COMMIT;
