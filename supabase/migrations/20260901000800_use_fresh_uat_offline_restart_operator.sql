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
  scenario_draft jsonb;
  fresh_operator_id constant text := 'b49ab5f5-0ca0-4c9f-b43a-dc6e9c524a68';
  prior_operator_id constant text := 'c8834f3c-b9be-4f1a-97da-2cb183c93a9e';
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
    IF existing.state='PROVISIONING' AND existing.scenario->>'operatorId'=prior_operator_id THEN
      IF EXISTS (SELECT 1 FROM erp.assignments AS a WHERE a.company_id=tenant AND a.id=existing.scenario->>'assignmentId') THEN
        RETURN jsonb_build_object('success',false,'code','ASSIGNMENT_RESIDUE_CONFLICT');
      END IF;
      UPDATE erp.uat_deur_offline_restart_runtime_scenarios AS restart_state
         SET scenario=jsonb_set(restart_state.scenario,'{operatorId}',to_jsonb(fresh_operator_id)),updated_at=clock_timestamp()
       WHERE restart_state.company_id=tenant AND restart_state.scenario_key=skey
       RETURNING restart_state.* INTO existing;
    END IF;
    RETURN jsonb_build_object('success',true,'state',existing.state,'scenario',existing.scenario);
  END IF;

  scenario_draft := jsonb_build_object(
    'projectId',gen_random_uuid(),'customerId',gen_random_uuid(),'rentalId',gen_random_uuid(),
    'lineId',gen_random_uuid(),'equipmentId',gen_random_uuid(),'assignmentId',gen_random_uuid(),
    'operatorId',fresh_operator_id
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
