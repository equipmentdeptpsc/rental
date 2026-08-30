BEGIN;
SET LOCAL search_path=erp,auth,extensions,pg_catalog;

CREATE OR REPLACE FUNCTION erp.inspect_isolated_uat_exact_application_user(command jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=erp,auth,extensions,pg_catalog AS $$
DECLARE
  target_tenant text := trim(command->>'companyId');
  target_username text := trim(command->>'username');
  target_operator text := trim(command->>'expectedOperatorId');
  matched_count integer;
  user_row jsonb;
  role_names jsonb := '[]'::jsonb;
BEGIN
  IF target_tenant <> 'TENANT-LOCAL-001'
     OR target_username <> 'uat.me.operator.001'
     OR target_operator <> 'e6bf4e8b-8e3a-4c65-a05e-ee4ed281e876'
     OR NOT EXISTS (
       SELECT 1 FROM erp.companies AS company_row
       WHERE company_row.id = target_tenant
         AND company_row.active
         AND company_row.environment_class IN ('compatibility','test')
     )
  THEN
    RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED');
  END IF;

  SELECT count(*) INTO matched_count
  FROM erp.users AS persisted_user
  WHERE persisted_user.company_id = target_tenant
    AND persisted_user.username = target_username;

  IF matched_count <> 1 THEN
    RETURN jsonb_build_object(
      'success',true,
      'usernameCardinality',matched_count,
      'classification',CASE WHEN matched_count = 0 THEN 'USER1_NOT_PERSISTED' ELSE 'USER1_DUPLICATE_USERNAME' END
    );
  END IF;

  SELECT jsonb_build_object(
    'id', persisted_user.id,
    'username', persisted_user.username,
    'display_name', persisted_user.display_name,
    'status', persisted_user.status,
    'company_id', persisted_user.company_id,
    'operator_id', persisted_user.operator_id
  ) INTO user_row
  FROM erp.users AS persisted_user
  WHERE persisted_user.company_id = target_tenant
    AND persisted_user.username = target_username;

  SELECT coalesce(jsonb_agg(app_role.code ORDER BY app_role.code),'[]'::jsonb) INTO role_names
  FROM erp.user_roles AS user_role
  JOIN erp.app_roles AS app_role ON app_role.id = user_role.role_id
  WHERE user_role.user_id = (user_row->>'id')::uuid;

  RETURN jsonb_build_object(
    'success',true,
    'usernameCardinality',1,
    'applicationUserId',user_row->>'id',
    'username',user_row->>'username',
    'displayName',user_row->>'display_name',
    'status',user_row->>'status',
    'companyId',user_row->>'company_id',
    'operatorId',user_row->>'operator_id',
    'operatorLinkClassification',CASE
      WHEN user_row->>'operator_id' IS NULL THEN 'NULL_OPERATOR'
      WHEN user_row->>'operator_id' = target_operator THEN 'EXACT_OPERATOR'
      ELSE 'WRONG_OPERATOR'
    END,
    'roleNames',role_names
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success',false,'code','READ_FAILED');
END $$;

ALTER FUNCTION erp.inspect_isolated_uat_exact_application_user(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.inspect_isolated_uat_exact_application_user(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION erp.inspect_isolated_uat_exact_application_user(jsonb) TO service_role;
COMMIT;
