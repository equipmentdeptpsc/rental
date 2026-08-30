BEGIN;
SET LOCAL search_path=erp,auth,extensions,pg_catalog;
CREATE OR REPLACE FUNCTION erp.inspect_isolated_uat_multi_operator_user_linkage(command jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=erp,auth,extensions,pg_catalog AS $$
DECLARE tenant text:=trim(command->>'companyId'); scenario_key text:=trim(command->>'scenarioKey'); profile text:=trim(command->>'profileVersion');
  expected constant text[]:=ARRAY['e6bf4e8b-8e3a-4c65-a05e-ee4ed281e876','cac542f6-2d18-4275-8c26-0728d858c912','584df24a-c104-4001-b175-c141903f12d5'];
  supplied text[]; target_operator_id text; users_count integer; rowv jsonb; rows jsonb:='[]'::jsonb;
BEGIN
  supplied:=ARRAY(SELECT jsonb_array_elements_text(coalesce(command->'operatorIds','[]'::jsonb)));
  IF scenario_key<>'MULTI-EQUIPMENT-RUNTIME-CERT-2026-08-29' OR profile<>'UAT_MULTI_EQUIPMENT_PER_WORKDAY_V1' OR tenant IS NULL OR supplied<>expected OR NOT EXISTS(SELECT 1 FROM companies c WHERE c.id=tenant AND c.active AND c.environment_class IN('compatibility','test')) OR NOT EXISTS(SELECT 1 FROM uat_multi_equipment_provisioning_scenarios s WHERE s.company_id=tenant AND s.scenario_key=scenario_key) THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;
  FOREACH target_operator_id IN ARRAY expected LOOP
    SELECT count(*) INTO users_count FROM users AS u WHERE u.company_id=tenant AND u.operator_id=target_operator_id;
    SELECT to_jsonb(u) INTO rowv FROM users AS u WHERE u.company_id=tenant AND u.operator_id=target_operator_id;
    rows:=rows||jsonb_build_array(jsonb_build_object('operatorId',target_operator_id,'linkedApplicationUserCount',users_count,'classification',CASE WHEN users_count=0 THEN 'NO_LINKED_USER' WHEN users_count>1 THEN 'MULTIPLE_LINKED_USERS' WHEN rowv->>'status'<>'active' THEN 'INACTIVE_APPLICATION_USER' ELSE 'ONE_LINKED_USER' END,'applicationUserId',CASE WHEN users_count=1 THEN rowv->>'id' END,'username',CASE WHEN users_count=1 THEN rowv->>'username' END,'displayName',CASE WHEN users_count=1 THEN rowv->>'display_name' END,'status',CASE WHEN users_count=1 THEN rowv->>'status' END,'companyId',CASE WHEN users_count=1 THEN rowv->>'company_id' END));
  END LOOP;
  RETURN jsonb_build_object('success',true,'readStatus','SUCCESS','operators',rows);
EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('success',false,'code','READ_FAILED'); END $$;
ALTER FUNCTION erp.inspect_isolated_uat_multi_operator_user_linkage(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.inspect_isolated_uat_multi_operator_user_linkage(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION erp.inspect_isolated_uat_multi_operator_user_linkage(jsonb) TO service_role;
COMMIT;
