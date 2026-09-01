BEGIN;
SET LOCAL search_path=erp,auth,extensions,pg_catalog;

CREATE OR REPLACE FUNCTION erp.claim_uat_deur_offline_restart_runtime_scenario(command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=erp,auth,extensions,pg_catalog AS $$
DECLARE
  tenant text := trim(command->>'companyId');
  skey text := trim(command->>'scenarioKey');
  profile text := trim(command->>'profileVersion');
  reference_data jsonb := coalesce(command->'references','{}'::jsonb);
  existing erp.uat_deur_offline_restart_runtime_scenarios;
  baseline jsonb;
  baseline_operator_id text;
  scenario_draft jsonb;
BEGIN
  IF tenant <> 'TENANT-LOCAL-001'
     OR skey <> 'DEUR-OFFLINE-RESTART-RUNTIME-CERT-2026-09-01'
     OR profile <> 'UAT_DEUR_OFFLINE_RESTART_RUNTIME_V1'
     OR nullif(reference_data->>'costCodeId','') IS NULL
     OR nullif(reference_data->>'activityCodeId','') IS NULL
     OR nullif(reference_data->>'workDescriptionId','') IS NULL THEN
    RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(tenant || ':' || skey, 0));
  SELECT restart_state.* INTO existing
    FROM erp.uat_deur_offline_restart_runtime_scenarios AS restart_state
   WHERE restart_state.company_id=tenant AND restart_state.scenario_key=skey FOR UPDATE;
  IF existing.scenario_key IS NOT NULL THEN
    IF existing.profile_version <> profile THEN
      RETURN jsonb_build_object('success',false,'code','SCENARIO_PROFILE_MISMATCH');
    END IF;
    RETURN jsonb_build_object('success',true,'state',existing.state,'scenario',existing.scenario);
  END IF;

  SELECT baseline_source.scenario INTO baseline
    FROM erp.uat_deur_offline_runtime_scenarios AS baseline_source
   WHERE baseline_source.company_id=tenant
     AND baseline_source.scenario_key='DEUR-OFFLINE-RUNTIME-CERT-2026-08-31';
  baseline_operator_id := baseline->>'operatorId';
  IF baseline_operator_id IS NULL OR NOT EXISTS (
    SELECT 1
      FROM erp.operators AS o
      JOIN erp.users AS u ON u.operator_id=o.id
      JOIN auth.users AS identity_user ON identity_user.id=u.id
     WHERE o.id=baseline_operator_id AND o.company_id=tenant AND o.status='Active' AND o.deleted_at IS NULL
       AND u.company_id=tenant AND u.status='active'
  ) THEN
    RETURN jsonb_build_object('success',false,'code','BASELINE_OPERATOR_UNAVAILABLE');
  END IF;

  scenario_draft := jsonb_build_object(
    'projectId',gen_random_uuid(),'customerId',gen_random_uuid(),'rentalId',gen_random_uuid(),
    'lineId',gen_random_uuid(),'equipmentId',gen_random_uuid(),'assignmentId',gen_random_uuid(),
    'operatorId',baseline_operator_id
  );
  INSERT INTO erp.uat_deur_offline_restart_runtime_scenarios
    (company_id,scenario_key,profile_version,state,scenario)
  VALUES (tenant,skey,profile,'PROVISIONING',scenario_draft);
  RETURN jsonb_build_object('success',true,'state','PROVISIONING','scenario',scenario_draft);
END $$;

ALTER FUNCTION erp.claim_uat_deur_offline_restart_runtime_scenario(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.claim_uat_deur_offline_restart_runtime_scenario(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION erp.claim_uat_deur_offline_restart_runtime_scenario(jsonb) TO service_role;
COMMIT;
