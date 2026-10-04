BEGIN;
SET LOCAL search_path = erp, pg_catalog;
CREATE OR REPLACE FUNCTION erp.command_relink_operator_pin_user(command jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,pg_catalog AS $$
DECLARE
  actor uuid=nullif(command->>'actorId','')::uuid;
  tenant text=nullif(trim(command->>'companyId'),'');
  target uuid=nullif(command->>'targetUserId','')::uuid;
  next_operator text=nullif(trim(command->>'operatorId'),'');
  command_id text=trim(command->>'commandId');
  idem text=trim(command->>'idempotencyKey');
  target_user erp.users;
  existing erp.user_operator_relink_commands;
  payload_hash text;
  response jsonb;
BEGIN
  IF actor IS NULL OR tenant IS NULL OR target IS NULL OR next_operator IS NULL OR command_id='' OR idem='' THEN
    RETURN jsonb_build_object('success',false,'code','INVALID_COMMAND','message','A complete relink command is required.');
  END IF;
  IF NOT EXISTS(SELECT 1 FROM erp.users u WHERE u.id=actor AND u.company_id=tenant AND u.status='active')
     OR NOT EXISTS(SELECT 1 FROM erp.effective_user_permissions p WHERE p.user_id=actor AND p.permission_code='users.create')
     OR NOT EXISTS(SELECT 1 FROM erp.effective_user_permissions p WHERE p.user_id=actor AND p.permission_code='roles.assign') THEN
    RETURN jsonb_build_object('success',false,'code','FORBIDDEN','message','User relinking is not authorized.');
  END IF;
  payload_hash=encode(extensions.digest(convert_to(jsonb_build_object('targetUserId',target,'operatorId',next_operator)::text,'UTF8'),'sha256'),'hex');
  PERFORM pg_advisory_xact_lock(hashtextextended(tenant||':user-operator-relink:'||idem,0));
  SELECT * INTO existing FROM erp.user_operator_relink_commands WHERE company_id=tenant AND idempotency_key=idem FOR UPDATE;
  IF existing.idempotency_key IS NOT NULL THEN
    IF existing.payload_hash<>payload_hash THEN RETURN jsonb_build_object('success',false,'code','IDEMPOTENCY_MISMATCH','message','The request key was already used for different input.'); END IF;
    RETURN jsonb_build_object('success',true,'value',existing.response,'replayed',true);
  END IF;
  SELECT * INTO target_user FROM erp.users WHERE id=target AND company_id=tenant AND status='active' FOR UPDATE;
  IF target_user.id IS NULL THEN RETURN jsonb_build_object('success',false,'code','NOT_FOUND','message','User is not available.'); END IF;
  IF target_user.credential_mode<>'OPERATOR_PIN' OR NOT EXISTS(SELECT 1 FROM erp.user_roles ur JOIN erp.app_roles r ON r.id=ur.role_id WHERE ur.user_id=target AND r.code='operator')
     OR EXISTS(SELECT 1 FROM erp.user_roles ur JOIN erp.app_roles r ON r.id=ur.role_id WHERE ur.user_id=target AND r.code<>'operator') THEN
    RETURN jsonb_build_object('success',false,'code','INVALID_OPERATOR_PIN_CONTRACT','message','Only active Operator-only PIN users can be relinked.');
  END IF;
  IF NOT EXISTS(SELECT 1 FROM erp.operators o WHERE o.id=next_operator AND o.company_id=tenant AND o.status='Active' AND o.deleted_at IS NULL) THEN
    RETURN jsonb_build_object('success',false,'code','OPERATOR_NOT_AVAILABLE','message','The selected Operator is not available.');
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(tenant||':user-operator:'||next_operator,0));
  IF EXISTS(SELECT 1 FROM erp.users u WHERE u.company_id=tenant AND u.operator_id=next_operator AND u.status='active' AND u.id<>target) THEN
    RETURN jsonb_build_object('success',false,'code','OPERATOR_CONFLICT','message','This Operator is already linked to another active user.');
  END IF;
  UPDATE erp.users SET operator_id=next_operator,updated_at=clock_timestamp() WHERE id=target AND company_id=tenant;
  response=jsonb_build_object('id',target,'operatorId',next_operator,'credentialMode',target_user.credential_mode,'status',target_user.status);
  INSERT INTO erp.user_operator_relink_commands(company_id,idempotency_key,payload_hash,response) VALUES(tenant,idem,payload_hash,response);
  INSERT INTO erp.audit_log(id,company_id,aggregate_type,aggregate_id,action,actor_id,occurred_at,correlation_id,previous_values,new_values)
  VALUES(extensions.gen_random_uuid()::text,tenant,'User',target::text,'USER_OPERATOR_RELINKED',actor::text,clock_timestamp(),command_id,jsonb_build_object('operatorId',target_user.operator_id),jsonb_build_object('operatorId',next_operator));
  RETURN jsonb_build_object('success',true,'value',response);
END $$;
ALTER FUNCTION erp.command_relink_operator_pin_user(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.command_relink_operator_pin_user(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION erp.command_relink_operator_pin_user(jsonb) TO service_role;
COMMIT;
