BEGIN;
SET LOCAL search_path = erp, pg_catalog;

CREATE TABLE erp.user_provisioning_commands (
  idempotency_key text NOT NULL,
  company_id text NOT NULL REFERENCES erp.companies(id),
  actor_id uuid NOT NULL REFERENCES erp.users(id),
  payload_hash text NOT NULL,
  response jsonb,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(company_id,idempotency_key)
);
ALTER TABLE erp.user_provisioning_commands ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON erp.user_provisioning_commands FROM PUBLIC,anon,authenticated;

DROP INDEX IF EXISTS erp.uq_users_username_active;
CREATE UNIQUE INDEX uq_users_company_username ON erp.users(company_id,lower(username));
CREATE UNIQUE INDEX uq_users_company_email ON erp.users(company_id,lower(email)) WHERE email IS NOT NULL;

CREATE FUNCTION erp.lookup_application_user_provisioning_command(command jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,pg_catalog AS $$
DECLARE actor uuid=nullif(command->>'actorId','')::uuid;tenant text=command->>'companyId';idem text=trim(command->>'idempotencyKey');expected_hash text;existing erp.user_provisioning_commands;
BEGIN
 IF actor IS NULL OR tenant IS NULL OR idem='' OR NOT EXISTS(SELECT 1 FROM erp.users u WHERE u.id=actor AND u.company_id=tenant AND u.status='active') OR NOT EXISTS(SELECT 1 FROM erp.effective_user_permissions p WHERE p.user_id=actor AND p.permission_code='users.manage') THEN RETURN jsonb_build_object('success',false,'code','FORBIDDEN');END IF;
 expected_hash=encode(extensions.digest(convert_to(jsonb_build_object('username',lower(trim(command->>'username')),'displayName',trim(command->>'displayName'),'email',lower(trim(command->>'email')),'roleCodes',command->'roleCodes','operatorId',nullif(trim(command->>'operatorId'),''))::text,'UTF8'),'sha256'),'hex');
 SELECT * INTO existing FROM erp.user_provisioning_commands WHERE company_id=tenant AND idempotency_key=idem;
 IF existing.idempotency_key IS NULL THEN RETURN jsonb_build_object('success',true,'state','NEW');END IF;
 IF existing.payload_hash<>expected_hash THEN RETURN jsonb_build_object('success',false,'code','IDEMPOTENCY_MISMATCH','message','The request key was already used for different input.');END IF;
 RETURN jsonb_build_object('success',true,'state','COMPLETED','value',existing.response);
END $$;

CREATE FUNCTION erp.command_provision_application_user(command jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,pg_catalog AS $$
DECLARE
  actor uuid=nullif(command->>'actorId','')::uuid; tenant text=command->>'companyId'; target_id uuid=nullif(command->>'authUserId','')::uuid;
  command_id text=trim(command->>'commandId'); idem text=trim(command->>'idempotencyKey'); username_value text=trim(command->>'username');
  email_value text=lower(trim(command->>'email')); display_value text=trim(command->>'displayName'); operator_value text=nullif(trim(command->>'operatorId'),'');
  roles text[]; payload_hash text; existing erp.user_provisioning_commands; response jsonb; role_code text;
BEGIN
  IF actor IS NULL OR target_id IS NULL OR tenant IS NULL OR command_id='' OR idem='' THEN RETURN jsonb_build_object('success',false,'code','INVALID_COMMAND','message','Invalid provisioning command.');END IF;
  IF NOT EXISTS(SELECT 1 FROM erp.users u JOIN erp.companies c ON c.id=u.company_id AND c.active WHERE u.id=actor AND u.company_id=tenant AND u.status='active')
     OR NOT EXISTS(SELECT 1 FROM erp.effective_user_permissions p WHERE p.user_id=actor AND p.permission_code='users.manage')
  THEN RETURN jsonb_build_object('success',false,'code','FORBIDDEN','message','User provisioning is not authorized.');END IF;
  IF username_value='' OR display_value='' OR email_value='' OR length(username_value)>120 OR length(display_value)>200 OR length(email_value)>320 OR jsonb_typeof(command->'roleCodes') IS DISTINCT FROM 'array'
  THEN RETURN jsonb_build_object('success',false,'code','INVALID_COMMAND','message','Required user identity fields are invalid.');END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(command->'roleCodes') item WHERE jsonb_typeof(item)<>'string' OR trim(item#>>'{}')='') THEN RETURN jsonb_build_object('success',false,'code','INVALID_ROLE','message','Role codes must be non-empty strings.');END IF;
  SELECT coalesce(array_agg(DISTINCT trim(value) ORDER BY trim(value)),'{}'::text[]) INTO roles FROM jsonb_array_elements_text(command->'roleCodes');
  IF cardinality(roles)=0 OR EXISTS(SELECT 1 FROM unnest(roles) requested WHERE NOT EXISTS(SELECT 1 FROM erp.app_roles r WHERE r.code=requested))
  THEN RETURN jsonb_build_object('success',false,'code','INVALID_ROLE','message','One or more selected roles are not available.');END IF;
  IF operator_value IS NOT NULL AND NOT EXISTS(SELECT 1 FROM erp.operators o WHERE o.id=operator_value AND o.company_id=tenant AND o.status='Active' AND o.deleted_at IS NULL)
  THEN RETURN jsonb_build_object('success',false,'code','OPERATOR_NOT_AVAILABLE','message','The selected Operator is not available.');END IF;
  IF operator_value IS NOT NULL AND NOT ('operator'=ANY(roles) OR 'rental-operations'=ANY(roles))
  THEN RETURN jsonb_build_object('success',false,'code','INVALID_OPERATOR_ROLE','message','The selected role cannot be linked to an Operator.');END IF;
  payload_hash=encode(extensions.digest(convert_to(jsonb_build_object('username',lower(username_value),'displayName',display_value,'email',email_value,'roleCodes',command->'roleCodes','operatorId',operator_value)::text,'UTF8'),'sha256'),'hex');
  PERFORM pg_advisory_xact_lock(hashtextextended(tenant||':user-provisioning-idempotency:'||idem,0));
  SELECT * INTO existing FROM erp.user_provisioning_commands WHERE company_id=tenant AND idempotency_key=idem FOR UPDATE;
  IF existing.idempotency_key IS NOT NULL THEN
    IF existing.payload_hash<>payload_hash THEN RETURN jsonb_build_object('success',false,'code','IDEMPOTENCY_MISMATCH','message','The request key was already used for different input.');END IF;
    RETURN jsonb_build_object('success',true,'value',existing.response,'replayed',true);
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(tenant||':user-name:'||lower(username_value),0));
  PERFORM pg_advisory_xact_lock(hashtextextended(tenant||':user-email:'||email_value,0));
  IF operator_value IS NOT NULL THEN PERFORM pg_advisory_xact_lock(hashtextextended(tenant||':user-operator:'||operator_value,0));END IF;
  IF EXISTS(SELECT 1 FROM erp.users u WHERE u.company_id=tenant AND lower(u.username)=lower(username_value)) THEN RETURN jsonb_build_object('success',false,'code','USERNAME_CONFLICT','message','Username already exists.');END IF;
  IF EXISTS(SELECT 1 FROM erp.users u WHERE u.company_id=tenant AND lower(u.email)=email_value) THEN RETURN jsonb_build_object('success',false,'code','EMAIL_CONFLICT','message','Email already exists.');END IF;
  IF operator_value IS NOT NULL AND EXISTS(SELECT 1 FROM erp.users u WHERE u.company_id=tenant AND u.operator_id=operator_value AND u.status='active') THEN RETURN jsonb_build_object('success',false,'code','OPERATOR_CONFLICT','message','This Operator is already linked to another active user.');END IF;
  INSERT INTO erp.users(id,username,display_name,email,status,operator_id,company_id,created_at,updated_at)
  VALUES(target_id,username_value,display_value,email_value,'active',operator_value,tenant,clock_timestamp(),clock_timestamp());
  FOREACH role_code IN ARRAY roles LOOP
    INSERT INTO erp.user_roles(user_id,role_id,assigned_by) SELECT target_id,r.id,actor::text FROM erp.app_roles r WHERE r.code=role_code ON CONFLICT DO NOTHING;
  END LOOP;
  response=jsonb_build_object('id',target_id,'username',username_value,'displayName',display_value,'email',email_value,'companyId',tenant,'status','active','operatorId',operator_value,'systemRoles',to_jsonb(roles),'createdAt',clock_timestamp(),'updatedAt',clock_timestamp());
  INSERT INTO erp.user_provisioning_commands(idempotency_key,company_id,actor_id,payload_hash,response) VALUES(idem,tenant,actor,payload_hash,response);
  INSERT INTO erp.audit_log(id,company_id,aggregate_type,aggregate_id,action,actor_id,occurred_at,correlation_id,new_values) VALUES(extensions.gen_random_uuid()::text,tenant,'User',target_id::text,'USER_CREATED',actor::text,clock_timestamp(),command_id,jsonb_build_object('username',username_value,'roles',to_jsonb(roles),'operatorLinked',operator_value IS NOT NULL));
  FOREACH role_code IN ARRAY roles LOOP INSERT INTO erp.audit_log(id,company_id,aggregate_type,aggregate_id,action,actor_id,occurred_at,correlation_id,new_values) VALUES(extensions.gen_random_uuid()::text,tenant,'User',target_id::text,'USER_ROLE_ASSIGNED',actor::text,clock_timestamp(),command_id,jsonb_build_object('roleCode',role_code));END LOOP;
  RETURN jsonb_build_object('success',true,'value',response);
EXCEPTION WHEN unique_violation THEN
  IF EXISTS(SELECT 1 FROM erp.users u WHERE u.company_id=tenant AND lower(u.username)=lower(username_value)) THEN RETURN jsonb_build_object('success',false,'code','USERNAME_CONFLICT','message','Username already exists.');END IF;
  IF EXISTS(SELECT 1 FROM erp.users u WHERE u.company_id=tenant AND lower(u.email)=email_value) THEN RETURN jsonb_build_object('success',false,'code','EMAIL_CONFLICT','message','Email already exists.');END IF;
  IF operator_value IS NOT NULL AND EXISTS(SELECT 1 FROM erp.users u WHERE u.company_id=tenant AND u.operator_id=operator_value AND u.status='active') THEN RETURN jsonb_build_object('success',false,'code','OPERATOR_CONFLICT','message','This Operator is already linked to another active user.');END IF;
  RETURN jsonb_build_object('success',false,'code','IDENTITY_CONFLICT','message','The user identity conflicts with an existing record.');
END $$;

CREATE FUNCTION erp.record_application_user_password_reset(command jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,pg_catalog AS $$
DECLARE actor uuid=nullif(command->>'actorId','')::uuid;target uuid=nullif(command->>'targetUserId','')::uuid;tenant text=command->>'companyId';command_id text=command->>'commandId';
BEGIN
 IF actor IS NULL OR target IS NULL OR NOT EXISTS(SELECT 1 FROM erp.users u WHERE u.id=actor AND u.company_id=tenant AND u.status='active') OR NOT EXISTS(SELECT 1 FROM erp.effective_user_permissions p WHERE p.user_id=actor AND p.permission_code='users.manage') THEN RETURN jsonb_build_object('success',false,'code','FORBIDDEN');END IF;
 IF NOT EXISTS(SELECT 1 FROM erp.users u WHERE u.id=target AND u.company_id=tenant) THEN RETURN jsonb_build_object('success',false,'code','NOT_FOUND');END IF;
 INSERT INTO erp.audit_log(id,company_id,aggregate_type,aggregate_id,action,actor_id,occurred_at,correlation_id,new_values) VALUES(extensions.gen_random_uuid()::text,tenant,'User',target::text,'USER_ACCESS_RESET',actor::text,clock_timestamp(),command_id,jsonb_build_object('credentialType','SUPABASE_AUTH_WEB_CREDENTIAL'));
 RETURN jsonb_build_object('success',true);
END $$;

REVOKE ALL ON FUNCTION erp.lookup_application_user_provisioning_command(jsonb),erp.command_provision_application_user(jsonb),erp.record_application_user_password_reset(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION erp.lookup_application_user_provisioning_command(jsonb),erp.command_provision_application_user(jsonb),erp.record_application_user_password_reset(jsonb) TO service_role;
COMMIT;
