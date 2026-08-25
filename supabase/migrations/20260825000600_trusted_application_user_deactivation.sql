BEGIN;
SET LOCAL search_path = erp, pg_catalog;

CREATE OR REPLACE VIEW erp.effective_user_permissions
WITH (security_invoker=true) AS
SELECT assignment.user_id, permission.code AS permission_code
FROM erp.user_roles assignment
JOIN erp.users application_user ON application_user.id=assignment.user_id AND application_user.status='active'
JOIN erp.app_roles role ON role.id=assignment.role_id AND role.active
JOIN erp.role_permissions mapping ON mapping.role_id=role.id
JOIN erp.app_permissions permission ON permission.id=mapping.permission_id AND permission.active;

COMMENT ON VIEW erp.effective_user_permissions IS
  'Security-invoker projection: direct authenticated reads are constrained by user_roles RLS and inactive application users resolve no effective permissions.';

CREATE FUNCTION erp.command_deactivate_application_user(command jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,pg_catalog AS $$
DECLARE
  actor uuid=nullif(command->>'actorId','')::uuid;
  target uuid=nullif(command->>'targetUserId','')::uuid;
  tenant text=command->>'companyId';
  command_id text=trim(command->>'commandId');
  idem text=trim(command->>'idempotencyKey');
  payload_hash text;
  existing erp.user_provisioning_commands;
  target_user erp.users;
  response jsonb;
BEGIN
  IF actor IS NULL OR target IS NULL OR tenant IS NULL OR command_id='' OR idem='' THEN
    RETURN jsonb_build_object('success',false,'code','INVALID_COMMAND','message','Invalid user deactivation command.');
  END IF;
  IF actor=target THEN
    RETURN jsonb_build_object('success',false,'code','SELF_DEACTIVATION','message','You cannot deactivate your own active account.');
  END IF;
  IF NOT EXISTS(
    SELECT 1 FROM erp.users u JOIN erp.companies c ON c.id=u.company_id AND c.active
    WHERE u.id=actor AND u.company_id=tenant AND u.status='active'
  ) OR NOT EXISTS(
    SELECT 1 FROM erp.effective_user_permissions p
    WHERE p.user_id=actor AND p.permission_code='users.deactivate'
  ) THEN
    RETURN jsonb_build_object('success',false,'code','FORBIDDEN','message','User deactivation is not authorized.');
  END IF;

  payload_hash=encode(extensions.digest(convert_to(jsonb_build_object('action','DEACTIVATE_USER','targetUserId',target)::text,'UTF8'),'sha256'),'hex');
  PERFORM pg_advisory_xact_lock(hashtextextended(tenant||':user-provisioning-idempotency:'||idem,0));
  SELECT * INTO existing FROM erp.user_provisioning_commands WHERE company_id=tenant AND idempotency_key=idem FOR UPDATE;
  IF existing.idempotency_key IS NOT NULL THEN
    IF existing.payload_hash<>payload_hash THEN
      RETURN jsonb_build_object('success',false,'code','IDEMPOTENCY_MISMATCH','message','The request key was already used for different input.');
    END IF;
    RETURN jsonb_build_object('success',true,'value',existing.response,'replayed',true);
  END IF;

  SELECT * INTO target_user FROM erp.users WHERE id=target AND company_id=tenant FOR UPDATE;
  IF target_user.id IS NULL THEN
    RETURN jsonb_build_object('success',false,'code','NOT_FOUND','message','User is not available.');
  END IF;
  IF target_user.status<>'active' THEN
    RETURN jsonb_build_object('success',false,'code','ALREADY_INACTIVE','message','User is already inactive.');
  END IF;
  IF EXISTS(
    SELECT 1 FROM erp.user_roles ur JOIN erp.app_roles r ON r.id=ur.role_id
    WHERE ur.user_id=target AND r.code='system-administrator'
  ) THEN
    RETURN jsonb_build_object('success',false,'code','PROTECTED_ACCOUNT','message','System Administrator deactivation requires the protected governance flow.');
  END IF;

  UPDATE erp.users SET status='inactive',updated_at=clock_timestamp(),row_version=row_version+1 WHERE id=target;
  SELECT jsonb_build_object(
    'id',u.id,'username',u.username,'displayName',u.display_name,'email',u.email,
    'companyId',u.company_id,'status',u.status,'operatorId',u.operator_id,
    'systemRoles',coalesce((SELECT jsonb_agg(r.code ORDER BY r.code) FROM erp.user_roles ur JOIN erp.app_roles r ON r.id=ur.role_id WHERE ur.user_id=u.id),'[]'::jsonb),
    'createdAt',u.created_at,'updatedAt',u.updated_at
  ) INTO response FROM erp.users u WHERE u.id=target;
  INSERT INTO erp.user_provisioning_commands(idempotency_key,company_id,actor_id,payload_hash,response)
  VALUES(idem,tenant,actor,payload_hash,response);
  INSERT INTO erp.audit_log(id,company_id,aggregate_type,aggregate_id,action,actor_id,occurred_at,correlation_id,new_values)
  VALUES(extensions.gen_random_uuid()::text,tenant,'User',target::text,'USER_DEACTIVATED',actor::text,clock_timestamp(),command_id,jsonb_build_object('status','inactive'));
  RETURN jsonb_build_object('success',true,'value',response);
END $$;

REVOKE ALL ON FUNCTION erp.command_deactivate_application_user(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION erp.command_deactivate_application_user(jsonb) TO service_role;

COMMIT;
