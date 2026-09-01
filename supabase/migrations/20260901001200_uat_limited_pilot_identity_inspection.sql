BEGIN;
SET LOCAL search_path=erp,auth,extensions,pg_catalog;
CREATE OR REPLACE FUNCTION erp.inspect_uat_limited_operational_pilot_identities(command jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=erp,auth,extensions,pg_catalog AS $$
DECLARE tenant text:=trim(command->>'companyId'); k text:=trim(command->>'scenarioKey'); p text:=trim(command->>'profileVersion'); s jsonb; old erp.uat_limited_operational_pilot_scenarios; ops jsonb;
BEGIN
 IF tenant<>'TENANT-LOCAL-001' OR k<>'LIMITED-OPERATIONAL-PILOT-2026-09' OR p<>'UAT_LIMITED_PILOT_V1' THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;
 SELECT * INTO old FROM erp.uat_limited_operational_pilot_scenarios x WHERE x.company_id=tenant AND x.scenario_key=k; IF old.scenario_key IS NULL THEN RETURN jsonb_build_object('success',false,'code','SCENARIO_NOT_FOUND'); END IF; s:=old.scenario;
 SELECT coalesce(jsonb_agg(jsonb_build_object('operatorId',o.id,'displayName',o.name,'active',o.status='Active','linkedApplicationUserCount',(SELECT count(*) FROM erp.users u WHERE u.company_id=tenant AND u.operator_id=o.id AND u.status='active'),'authIdentityPresent',EXISTS(SELECT 1 FROM erp.users u JOIN auth.users au ON au.id=u.id WHERE u.company_id=tenant AND u.operator_id=o.id AND u.status='active'),'activeAssignmentCount',(SELECT count(*) FROM erp.assignments a WHERE a.company_id=tenant AND a.operator_id=o.id AND a.status='Active')) ORDER BY o.name),'[]'::jsonb) INTO ops FROM erp.operators o WHERE o.company_id=tenant AND o.id IN(s->>'operator1Id',s->>'operator2Id',s->>'operator3Id');
 RETURN jsonb_build_object('success',true,'state',old.state,'operators',ops,'dispatcherUsers',coalesce((SELECT jsonb_agg(jsonb_build_object('applicationUserId',u.id,'username',u.username,'email',u.email,'displayName',u.display_name,'active',u.status='active','roles',(SELECT coalesce(jsonb_agg(r.code ORDER BY r.code),'[]'::jsonb) FROM erp.user_roles ur JOIN erp.app_roles r ON r.id=ur.role_id WHERE ur.user_id=u.id AND r.active AND r.deprecated_at IS NULL))) FROM erp.users u JOIN erp.user_roles ur0 ON ur0.user_id=u.id JOIN erp.app_roles rr ON rr.id=ur0.role_id WHERE u.company_id=tenant AND u.status='active' AND rr.code='dispatcher'),'[]'::jsonb),'systemAdministratorCount',(SELECT count(*) FROM erp.users u JOIN erp.user_roles ur ON ur.user_id=u.id JOIN erp.app_roles r ON r.id=ur.role_id WHERE u.company_id=tenant AND u.status='active' AND r.code='system-administrator' AND r.active AND r.deprecated_at IS NULL));
END $$;
ALTER FUNCTION erp.inspect_uat_limited_operational_pilot_identities(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.inspect_uat_limited_operational_pilot_identities(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION erp.inspect_uat_limited_operational_pilot_identities(jsonb) TO service_role;
COMMIT;
