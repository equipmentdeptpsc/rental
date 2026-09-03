BEGIN;
SET LOCAL search_path = erp, auth, pg_catalog;

-- Supabase Auth remains the sole credential store. This mode is only a
-- tenant-scoped application routing decision for linked Operators.
ALTER TABLE erp.users
  ADD COLUMN IF NOT EXISTS credential_mode text NOT NULL DEFAULT 'PASSWORD',
  ADD CONSTRAINT users_credential_mode_check CHECK (credential_mode IN ('PASSWORD','OPERATOR_PIN')),
  ADD CONSTRAINT users_non_operator_password_credential_check CHECK (operator_id IS NOT NULL OR credential_mode = 'PASSWORD');

ALTER TABLE erp.user_password_reset_commands
  ADD COLUMN IF NOT EXISTS credential_type text NOT NULL DEFAULT 'SUPABASE_AUTH_WEB_CREDENTIAL',
  ADD CONSTRAINT user_password_reset_commands_credential_type_check CHECK (credential_type IN ('SUPABASE_AUTH_WEB_CREDENTIAL','OPERATOR_PIN'));

CREATE OR REPLACE FUNCTION erp.prepare_operator_pin_reset(command jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = erp, pg_catalog
AS $$
DECLARE
  actor uuid = nullif(command->>'actorId','')::uuid;
  target uuid = nullif(command->>'targetUserId','')::uuid;
  tenant text = nullif(trim(command->>'companyId'),'');
  command_id text = nullif(trim(command->>'commandId'),'');
  idem text = nullif(trim(command->>'idempotencyKey'),'');
  expected_hash text;
  existing erp.user_password_reset_commands;
BEGIN
  IF actor IS NULL OR target IS NULL OR tenant IS NULL OR command_id IS NULL OR idem IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM erp.users u
       WHERE u.id = actor AND u.company_id = tenant AND u.status = 'active'
     )
     OR NOT EXISTS (
       SELECT 1 FROM erp.effective_user_permissions p
       WHERE p.user_id = actor AND p.permission_code = 'users.password.reset'
     )
  THEN
    RETURN jsonb_build_object('success',false,'code','FORBIDDEN');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM erp.users u
    JOIN erp.operators o ON o.id = u.operator_id AND o.company_id = u.company_id AND o.status = 'Active'
    WHERE u.id = target AND u.company_id = tenant AND u.status = 'active'
  ) THEN
    RETURN jsonb_build_object('success',false,'code','NOT_FOUND');
  END IF;

  expected_hash = encode(extensions.digest(convert_to(jsonb_build_object(
    'targetUserId',target,'credentialType','OPERATOR_PIN'
  )::text,'UTF8'),'sha256'),'hex');
  PERFORM pg_advisory_xact_lock(hashtextextended(tenant||':operator-pin-reset:'||idem,0));
  SELECT * INTO existing
  FROM erp.user_password_reset_commands
  WHERE company_id = tenant AND idempotency_key = idem
  FOR UPDATE;
  IF existing.idempotency_key IS NOT NULL THEN
    IF existing.payload_hash <> expected_hash OR existing.command_id <> command_id
       OR existing.actor_id <> actor OR existing.credential_type <> 'OPERATOR_PIN'
    THEN
      RETURN jsonb_build_object('success',false,'code','IDEMPOTENCY_MISMATCH','message','The request key was already used for different input.');
    END IF;
    RETURN jsonb_build_object('success',true,'state',existing.state);
  END IF;

  INSERT INTO erp.user_password_reset_commands(
    company_id,idempotency_key,command_id,actor_id,target_user_id,payload_hash,credential_type,state
  ) VALUES (
    tenant,idem,command_id,actor,target,expected_hash,'OPERATOR_PIN','PENDING'
  );
  RETURN jsonb_build_object('success',true,'state','NEW');
END $$;

CREATE OR REPLACE FUNCTION erp.complete_operator_pin_reset(command jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = erp, pg_catalog
AS $$
DECLARE
  actor uuid = nullif(command->>'actorId','')::uuid;
  target uuid = nullif(command->>'targetUserId','')::uuid;
  tenant text = nullif(trim(command->>'companyId'),'');
  command_id text = nullif(trim(command->>'commandId'),'');
  idem text = nullif(trim(command->>'idempotencyKey'),'');
  existing erp.user_password_reset_commands;
BEGIN
  SELECT * INTO existing
  FROM erp.user_password_reset_commands
  WHERE company_id = tenant AND idempotency_key = idem
  FOR UPDATE;
  IF existing.idempotency_key IS NULL OR existing.actor_id <> actor
     OR existing.target_user_id <> target OR existing.command_id <> command_id
     OR existing.credential_type <> 'OPERATOR_PIN'
  THEN
    RETURN jsonb_build_object('success',false,'code','NOT_FOUND');
  END IF;
  IF existing.state = 'COMPLETED' THEN
    RETURN jsonb_build_object('success',true,'state','COMPLETED');
  END IF;
  IF existing.state <> 'PENDING' THEN
    RETURN jsonb_build_object('success',false,'code','INVALID_STATE');
  END IF;

  UPDATE erp.users
  SET credential_mode = 'OPERATOR_PIN', updated_at = clock_timestamp(), row_version = row_version + 1
  WHERE id = target AND company_id = tenant AND status = 'active' AND operator_id IS NOT NULL;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success',false,'code','NOT_FOUND');
  END IF;
  INSERT INTO erp.audit_log(
    id,company_id,aggregate_type,aggregate_id,action,actor_id,occurred_at,correlation_id,new_values
  ) VALUES (
    extensions.gen_random_uuid()::text,tenant,'User',target::text,'OPERATOR_PIN_RESET',actor::text,
    clock_timestamp(),command_id,jsonb_build_object('credentialType','OPERATOR_PIN')
  );
  UPDATE erp.user_password_reset_commands
  SET state = 'COMPLETED', completed_at = clock_timestamp()
  WHERE company_id = tenant AND idempotency_key = idem;
  RETURN jsonb_build_object('success',true,'state','COMPLETED');
END $$;

CREATE OR REPLACE FUNCTION erp.fail_operator_pin_reset(command jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = erp, pg_catalog
AS $$
BEGIN
  UPDATE erp.user_password_reset_commands
  SET state = 'FAILED'
  WHERE company_id = command->>'companyId' AND idempotency_key = command->>'idempotencyKey'
    AND command_id = command->>'commandId' AND actor_id = nullif(command->>'actorId','')::uuid
    AND target_user_id = nullif(command->>'targetUserId','')::uuid
    AND credential_type = 'OPERATOR_PIN' AND state = 'PENDING';
  RETURN jsonb_build_object('success',FOUND);
END $$;

CREATE OR REPLACE FUNCTION erp.resolve_active_operator_pin_login(identifier text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = erp, auth, pg_catalog
AS $$
DECLARE
  normalized_identifier text := lower(btrim(identifier));
  match_count integer;
  resolved_email text;
BEGIN
  IF normalized_identifier = '' OR length(normalized_identifier) > 120 THEN
    RETURN jsonb_build_object('success',false);
  END IF;
  SELECT count(*)::integer, min(lower(auth_user.email))
  INTO match_count, resolved_email
  FROM erp.users application_user
  JOIN erp.companies company ON company.id = application_user.company_id AND company.active
  JOIN erp.operators operator_record
    ON operator_record.id = application_user.operator_id
   AND operator_record.company_id = application_user.company_id
   AND operator_record.status = 'Active'
  JOIN auth.users auth_user ON auth_user.id = application_user.id
  WHERE application_user.status = 'active'
    AND application_user.credential_mode = 'OPERATOR_PIN'
    AND lower(application_user.username) = normalized_identifier
    AND auth_user.email IS NOT NULL;
  IF match_count <> 1 THEN
    RETURN jsonb_build_object('success',false);
  END IF;
  RETURN jsonb_build_object('success',true,'email',resolved_email);
END $$;

REVOKE ALL ON FUNCTION erp.prepare_operator_pin_reset(jsonb),erp.complete_operator_pin_reset(jsonb),erp.fail_operator_pin_reset(jsonb),erp.resolve_active_operator_pin_login(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION erp.prepare_operator_pin_reset(jsonb),erp.complete_operator_pin_reset(jsonb),erp.fail_operator_pin_reset(jsonb),erp.resolve_active_operator_pin_login(text) TO service_role;

COMMIT;
