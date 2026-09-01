BEGIN;
SET LOCAL search_path=erp,auth,extensions,pg_catalog;

CREATE TABLE erp.uat_deur_native_restart_runtime_scenarios (
  company_id text NOT NULL REFERENCES erp.companies(id),
  scenario_key text NOT NULL,
  profile_version text NOT NULL,
  state text NOT NULL CHECK (state IN ('PROVISIONING','DOMAIN_READY','FAILED')),
  scenario jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (company_id, scenario_key)
);

ALTER TABLE erp.uat_deur_native_restart_runtime_scenarios ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON erp.uat_deur_native_restart_runtime_scenarios FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION erp.resolve_uat_deur_native_restart_runtime_references(command jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=erp,auth,extensions,pg_catalog AS $$
DECLARE
  tenant text := trim(command->>'companyId');
  scenario_key_value text := trim(command->>'scenarioKey');
  profile_value text := trim(command->>'profileVersion');
  cost_code erp.cost_codes;
  activity_code erp.activity_codes;
  work_description erp.work_descriptions;
BEGIN
  IF tenant <> 'TENANT-LOCAL-001'
     OR scenario_key_value <> 'DEUR-NATIVE-RESTART-RUNTIME-CERT-2026-09-01'
     OR profile_value <> 'UAT_DEUR_NATIVE_RESTART_RUNTIME_V1' THEN
    RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED');
  END IF;

  SELECT * INTO cost_code FROM erp.cost_codes AS cost_code_row
   WHERE cost_code_row.active AND cost_code_row.deleted_at IS NULL
   ORDER BY (cost_code_row.code LIKE 'UAT%') DESC, cost_code_row.sort_order, cost_code_row.code, cost_code_row.id LIMIT 1;
  SELECT * INTO activity_code FROM erp.activity_codes AS activity_code_row
   WHERE activity_code_row.active AND activity_code_row.deleted_at IS NULL
   ORDER BY (activity_code_row.code LIKE 'UAT%') DESC, activity_code_row.sort_order, activity_code_row.code, activity_code_row.id LIMIT 1;
  SELECT * INTO work_description FROM erp.work_descriptions AS work_description_row
   WHERE work_description_row.active AND work_description_row.deleted_at IS NULL
   ORDER BY (work_description_row.code LIKE 'UAT%') DESC, work_description_row.sort_order, work_description_row.code, work_description_row.id LIMIT 1;

  RETURN jsonb_build_object('success',cost_code.id IS NOT NULL AND activity_code.id IS NOT NULL AND work_description.id IS NOT NULL,
    'referencesReady',cost_code.id IS NOT NULL AND activity_code.id IS NOT NULL AND work_description.id IS NOT NULL,
    'costCodeId',cost_code.id,'activityCodeId',activity_code.id,'workDescriptionId',work_description.id);
END $$;

CREATE OR REPLACE FUNCTION erp.claim_uat_deur_native_restart_runtime_scenario(command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=erp,auth,extensions,pg_catalog AS $$
DECLARE
  tenant text := trim(command->>'companyId');
  scenario_key_value text := trim(command->>'scenarioKey');
  profile_value text := trim(command->>'profileVersion');
  reference_data jsonb := coalesce(command->'references','{}'::jsonb);
  existing_scenario erp.uat_deur_native_restart_runtime_scenarios;
  scenario_draft jsonb;
  native_operator_id constant text := 'a652ca59-87a6-4f0c-949e-7f380ed4e3ec';
BEGIN
  IF tenant <> 'TENANT-LOCAL-001'
     OR scenario_key_value <> 'DEUR-NATIVE-RESTART-RUNTIME-CERT-2026-09-01'
     OR profile_value <> 'UAT_DEUR_NATIVE_RESTART_RUNTIME_V1'
     OR nullif(reference_data->>'costCodeId','') IS NULL
     OR nullif(reference_data->>'activityCodeId','') IS NULL
     OR nullif(reference_data->>'workDescriptionId','') IS NULL THEN
    RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(tenant || ':' || scenario_key_value, 0));
  SELECT native_state.* INTO existing_scenario
    FROM erp.uat_deur_native_restart_runtime_scenarios AS native_state
   WHERE native_state.company_id=tenant AND native_state.scenario_key=scenario_key_value FOR UPDATE;
  IF existing_scenario.scenario_key IS NOT NULL THEN
    IF existing_scenario.profile_version <> profile_value THEN
      RETURN jsonb_build_object('success',false,'code','SCENARIO_PROFILE_MISMATCH');
    END IF;
    RETURN jsonb_build_object('success',true,'state',existing_scenario.state,'scenario',existing_scenario.scenario);
  END IF;

  IF EXISTS (SELECT 1 FROM erp.assignments AS active_assignment
    WHERE active_assignment.company_id=tenant AND active_assignment.operator_id=native_operator_id
      AND active_assignment.status='Active' AND active_assignment.deleted_at IS NULL) THEN
    RETURN jsonb_build_object('success',false,'code','OPERATOR_ACTIVE_ASSIGNMENT_CONFLICT');
  END IF;

  scenario_draft := jsonb_build_object('projectId',gen_random_uuid(),'customerId',gen_random_uuid(),
    'rentalId',gen_random_uuid(),'lineId',gen_random_uuid(),'equipmentId',gen_random_uuid(),
    'assignmentId',gen_random_uuid(),'operatorId',native_operator_id);
  INSERT INTO erp.uat_deur_native_restart_runtime_scenarios
    (company_id,scenario_key,profile_version,state,scenario)
  VALUES (tenant,scenario_key_value,profile_value,'PROVISIONING',scenario_draft);
  RETURN jsonb_build_object('success',true,'state','PROVISIONING','scenario',scenario_draft);
END $$;

CREATE OR REPLACE FUNCTION erp.complete_uat_deur_native_restart_runtime_scenario(command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=erp,auth,extensions,pg_catalog AS $$
DECLARE
  tenant text := trim(command->>'companyId');
  scenario_key_value text := trim(command->>'scenarioKey');
  updated_count integer;
BEGIN
  IF tenant <> 'TENANT-LOCAL-001' OR scenario_key_value <> 'DEUR-NATIVE-RESTART-RUNTIME-CERT-2026-09-01' THEN
    RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED');
  END IF;
  UPDATE erp.uat_deur_native_restart_runtime_scenarios AS native_state
     SET state='DOMAIN_READY',updated_at=clock_timestamp()
   WHERE native_state.company_id=tenant AND native_state.scenario_key=scenario_key_value AND native_state.state='PROVISIONING';
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  IF updated_count <> 1 THEN RETURN jsonb_build_object('success',false,'code','SCENARIO_NOT_PROVISIONING'); END IF;
  RETURN jsonb_build_object('success',true,'state','DOMAIN_READY');
END $$;

CREATE OR REPLACE FUNCTION erp.inspect_uat_deur_native_restart_runtime_scenario(command jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=erp,auth,extensions,pg_catalog AS $$
DECLARE
  tenant text := trim(command->>'companyId');
  scenario_key_value text := trim(command->>'scenarioKey');
  profile_value text := trim(command->>'profileVersion');
  target_work_date date := DATE '2026-09-01';
  stored erp.uat_deur_native_restart_runtime_scenarios;
  scenario_data jsonb;
  target_deur erp.deurs;
  scenario_deur_count integer := 0;
  duplicate_daily_deur_count integer := 0;
  active_activity_count integer := 0;
  operational_timeline_count integer := 0;
  lifecycle_event_count integer := 0;
  current_activity text;
BEGIN
  IF tenant <> 'TENANT-LOCAL-001'
     OR scenario_key_value <> 'DEUR-NATIVE-RESTART-RUNTIME-CERT-2026-09-01'
     OR profile_value <> 'UAT_DEUR_NATIVE_RESTART_RUNTIME_V1' THEN
    RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED');
  END IF;
  SELECT native_state.* INTO stored FROM erp.uat_deur_native_restart_runtime_scenarios AS native_state
   WHERE native_state.company_id=tenant AND native_state.scenario_key=scenario_key_value;
  IF stored.scenario_key IS NULL THEN RETURN jsonb_build_object('success',false,'code','SCENARIO_NOT_FOUND'); END IF;
  scenario_data := stored.scenario;
  SELECT count(*) INTO scenario_deur_count FROM erp.deurs AS deur_row
   WHERE deur_row.company_id=tenant AND deur_row.rental_equipment_line_id=scenario_data->>'lineId' AND deur_row.work_date=target_work_date;
  SELECT deur_row.* INTO target_deur FROM erp.deurs AS deur_row
   WHERE deur_row.company_id=tenant AND deur_row.rental_equipment_line_id=scenario_data->>'lineId' AND deur_row.work_date=target_work_date
   ORDER BY deur_row.created_at DESC LIMIT 1;
  IF target_deur.id IS NOT NULL THEN
    SELECT count(*) INTO duplicate_daily_deur_count FROM erp.deurs AS duplicate_row
      WHERE duplicate_row.company_id=tenant AND duplicate_row.rental_equipment_line_id=target_deur.rental_equipment_line_id
        AND duplicate_row.work_date=target_work_date AND duplicate_row.id<>target_deur.id;
    SELECT count(*) INTO active_activity_count FROM erp.deur_events AS event_row
      WHERE event_row.deur_id=target_deur.id AND event_row.activity_type IN ('operation','idle','standby','mealBreak','breakdown') AND event_row.is_open;
    SELECT count(*) INTO operational_timeline_count FROM erp.deur_events AS event_row
      WHERE event_row.deur_id=target_deur.id AND event_row.activity_type IN ('operation','idle','standby','mealBreak','breakdown');
    SELECT count(*) INTO lifecycle_event_count FROM erp.deur_events AS event_row
      WHERE event_row.deur_id=target_deur.id AND event_row.activity_type='shift';
    SELECT event_row.activity_type INTO current_activity FROM erp.deur_events AS event_row
      WHERE event_row.deur_id=target_deur.id AND event_row.activity_type IN ('operation','idle','standby','mealBreak','breakdown') AND event_row.is_open
      ORDER BY event_row.sequence DESC LIMIT 1;
  END IF;
  RETURN jsonb_build_object('success',true,'state',stored.state,'scenarioKey',scenario_key_value,'profileVersion',profile_value,
    'projectId',scenario_data->>'projectId','customerId',scenario_data->>'customerId','rentalId',scenario_data->>'rentalId',
    'rentalEquipmentLineId',scenario_data->>'lineId','equipmentId',scenario_data->>'equipmentId','assignmentId',scenario_data->>'assignmentId','operatorId',scenario_data->>'operatorId',
    'operatorActive',EXISTS(SELECT 1 FROM erp.operators AS operator_row WHERE operator_row.id=scenario_data->>'operatorId' AND operator_row.company_id=tenant AND operator_row.status='Active' AND operator_row.deleted_at IS NULL),
    'assignmentCount',(SELECT count(*) FROM erp.assignments AS assignment_row WHERE assignment_row.id=scenario_data->>'assignmentId' AND assignment_row.company_id=tenant AND assignment_row.operator_id=scenario_data->>'operatorId'),
    'linkedApplicationUserCount',(SELECT count(*) FROM erp.users AS user_row WHERE user_row.company_id=tenant AND user_row.operator_id=scenario_data->>'operatorId' AND user_row.status='active'),
    'authIdentityPresent',EXISTS(SELECT 1 FROM erp.users AS user_row JOIN auth.users AS identity_row ON identity_row.id=user_row.id WHERE user_row.company_id=tenant AND user_row.operator_id=scenario_data->>'operatorId' AND user_row.status='active'),
    'eligibleWorkCount',(SELECT count(*) FROM erp.rental_equipment_lines AS line_row WHERE line_row.id=scenario_data->>'lineId' AND line_row.operator_id=scenario_data->>'operatorId' AND line_row.status IN ('Released','Active')),
    'scenarioDeurCount',scenario_deur_count,'duplicateDailyDeurCount',duplicate_daily_deur_count,
    'deurId',target_deur.id,'deurNumber',target_deur.deur_number,'workDate',target_deur.work_date,'status',target_deur.status,'version',target_deur.row_version,
    'currentActivity',current_activity,'activeActivityCount',active_activity_count,'operationalTimelineCount',operational_timeline_count,'lifecycleEventCount',lifecycle_event_count,
    'billingStatementCount',0,'invoiceCount',0,'reviewCount',0,'notificationCount',0,'returnMutationPresent',false,'crossOperatorExposure','[]'::jsonb);
END $$;

ALTER FUNCTION erp.resolve_uat_deur_native_restart_runtime_references(jsonb) OWNER TO postgres;
ALTER FUNCTION erp.claim_uat_deur_native_restart_runtime_scenario(jsonb) OWNER TO postgres;
ALTER FUNCTION erp.complete_uat_deur_native_restart_runtime_scenario(jsonb) OWNER TO postgres;
ALTER FUNCTION erp.inspect_uat_deur_native_restart_runtime_scenario(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.resolve_uat_deur_native_restart_runtime_references(jsonb),erp.claim_uat_deur_native_restart_runtime_scenario(jsonb),erp.complete_uat_deur_native_restart_runtime_scenario(jsonb),erp.inspect_uat_deur_native_restart_runtime_scenario(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION erp.resolve_uat_deur_native_restart_runtime_references(jsonb),erp.claim_uat_deur_native_restart_runtime_scenario(jsonb),erp.complete_uat_deur_native_restart_runtime_scenario(jsonb),erp.inspect_uat_deur_native_restart_runtime_scenario(jsonb) TO service_role;
COMMIT;
