BEGIN;
SET LOCAL search_path=erp,auth,extensions,pg_catalog;
CREATE OR REPLACE FUNCTION erp.inspect_isolated_uat_exact_application_user(command jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=erp,auth,extensions,pg_catalog AS $$
DECLARE tenant text:=trim(command->>'companyId'); uname text:=trim(command->>'username'); expected text:=trim(command->>'expectedOperatorId'); n integer; u jsonb; roles jsonb:='[]'::jsonb;
BEGIN
 IF tenant<>'TENANT-LOCAL-001' OR uname<>'uat.me.operator.001' OR expected<>'e6bf4e8b-8e3a-4c65-a05e-ee4ed281e876' OR NOT EXISTS(SELECT 1 FROM companies c WHERE c.id=tenant AND c.active AND c.environment_class IN('compatibility','test')) THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;
 SELECT count(*) INTO n FROM users u WHERE u.company_id=tenant AND u.username=uname;
 IF n<>1 THEN RETURN jsonb_build_object('success',true,'usernameCardinality',n,'classification',CASE WHEN n=0 THEN 'USER1_NOT_PERSISTED' ELSE 'USER1_DUPLICATE_USERNAME' END); END IF;
 SELECT to_jsonb(u) INTO u FROM users u WHERE u.company_id=tenant AND u.username=uname;
 SELECT coalesce(jsonb_agg(ar.code ORDER BY ar.code),'[]'::jsonb) INTO roles FROM user_roles ur JOIN app_roles ar ON ar.id=ur.role_id WHERE ur.user_id=(u->>'id')::uuid;
 RETURN jsonb_build_object('success',true,'usernameCardinality',1,'applicationUserId',u->>'id','username',u->>'username','displayName',u->>'display_name','status',u->>'status','companyId',u->>'company_id','operatorId',u->>'operator_id','operatorLinkClassification',CASE WHEN u->>'operator_id' IS NULL THEN 'NULL_OPERATOR' WHEN u->>'operator_id'=expected THEN 'EXACT_OPERATOR' ELSE 'WRONG_OPERATOR' END,'roleNames',roles);
EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('success',false,'code','READ_FAILED'); END $$;
ALTER FUNCTION erp.inspect_isolated_uat_exact_application_user(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.inspect_isolated_uat_exact_application_user(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION erp.inspect_isolated_uat_exact_application_user(jsonb) TO service_role;
COMMIT;
