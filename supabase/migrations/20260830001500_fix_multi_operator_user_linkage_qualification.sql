BEGIN;
SET LOCAL search_path=erp,auth,extensions,pg_catalog;

CREATE OR REPLACE FUNCTION erp.inspect_isolated_uat_multi_operator_user_linkage(command jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=erp,auth,extensions,pg_catalog AS $$
DECLARE
  target_tenant text := trim(command->>'companyId');
  target_scenario text := trim(command->>'scenarioKey');
  target_profile text := trim(command->>'profileVersion');
  expected_operators constant text[] := ARRAY[
    'e6bf4e8b-8e3a-4c65-a05e-ee4ed281e876',
    'cac542f6-2d18-4275-8c26-0728d858c912',
    '584df24a-c104-4001-b175-c141903f12d5'
  ];
  supplied_operators text[];
  current_operator text;
  linked_count integer;
  persisted_user jsonb;
  projections jsonb := '[]'::jsonb;
BEGIN
  supplied_operators := ARRAY(SELECT jsonb_array_elements_text(coalesce(command->'operatorIds','[]'::jsonb)));
  IF target_scenario <> 'MULTI-EQUIPMENT-RUNTIME-CERT-2026-08-29'
     OR target_profile <> 'UAT_MULTI_EQUIPMENT_PER_WORKDAY_V1'
     OR target_tenant IS NULL
     OR supplied_operators <> expected_operators
     OR NOT EXISTS (
       SELECT 1 FROM erp.companies AS company_row
       WHERE company_row.id = target_tenant AND company_row.active
         AND company_row.environment_class IN ('compatibility','test')
     )
     OR NOT EXISTS (
       SELECT 1 FROM erp.uat_multi_equipment_provisioning_scenarios AS scenario_row
       WHERE scenario_row.company_id = target_tenant
         AND scenario_row.scenario_key = target_scenario
     )
  THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;

  FOREACH current_operator IN ARRAY expected_operators LOOP
    SELECT count(*) INTO linked_count
    FROM erp.users AS persisted_user_row
    WHERE persisted_user_row.company_id = target_tenant
      AND persisted_user_row.operator_id::text = current_operator;

    IF linked_count = 1 THEN
      SELECT jsonb_build_object(
        'id', persisted_user_row.id, 'username', persisted_user_row.username,
        'display_name', persisted_user_row.display_name, 'status', persisted_user_row.status,
        'company_id', persisted_user_row.company_id, 'operator_id', persisted_user_row.operator_id
      ) INTO persisted_user
      FROM erp.users AS persisted_user_row
      WHERE persisted_user_row.company_id = target_tenant
        AND persisted_user_row.operator_id::text = current_operator;
    ELSE persisted_user := NULL; END IF;

    projections := projections || jsonb_build_array(jsonb_build_object(
      'operatorId', current_operator,
      'linkedApplicationUserCount', linked_count,
      'classification', CASE
        WHEN linked_count = 0 THEN 'NO_LINKED_USER'
        WHEN linked_count > 1 THEN 'MULTIPLE_LINKED_USERS'
        WHEN persisted_user->>'status' <> 'active' THEN 'INACTIVE_APPLICATION_USER'
        WHEN persisted_user->>'company_id' <> target_tenant THEN 'TENANT_MISMATCH'
        ELSE 'ONE_LINKED_USER' END,
      'applicationUserId', CASE WHEN linked_count = 1 THEN persisted_user->>'id' END,
      'username', CASE WHEN linked_count = 1 THEN persisted_user->>'username' END,
      'displayName', CASE WHEN linked_count = 1 THEN persisted_user->>'display_name' END,
      'status', CASE WHEN linked_count = 1 THEN persisted_user->>'status' END,
      'companyId', CASE WHEN linked_count = 1 THEN persisted_user->>'company_id' END
    ));
  END LOOP;
  RETURN jsonb_build_object('success',true,'readStatus','SUCCESS','operators',projections);
EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('success',false,'code','READ_FAILED');
END $$;

ALTER FUNCTION erp.inspect_isolated_uat_multi_operator_user_linkage(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.inspect_isolated_uat_multi_operator_user_linkage(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION erp.inspect_isolated_uat_multi_operator_user_linkage(jsonb) TO service_role;
COMMIT;
