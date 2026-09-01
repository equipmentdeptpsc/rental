BEGIN;
SET LOCAL search_path=erp,auth,extensions,pg_catalog;

CREATE TABLE erp.uat_deur_offline_restart_runtime_scenarios (
  company_id text NOT NULL REFERENCES erp.companies(id),
  scenario_key text NOT NULL,
  profile_version text NOT NULL,
  state text NOT NULL CHECK (state IN ('PROVISIONING','DOMAIN_READY','FAILED')),
  scenario jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (company_id, scenario_key)
);

ALTER TABLE erp.uat_deur_offline_restart_runtime_scenarios ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON erp.uat_deur_offline_restart_runtime_scenarios FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION erp.resolve_uat_deur_offline_restart_runtime_references(command jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=erp,auth,extensions,pg_catalog AS $$
DECLARE
  tenant text := trim(command->>'companyId');
  skey text := trim(command->>'scenarioKey');
  profile text := trim(command->>'profileVersion');
  cost_code erp.cost_codes;
  activity_code erp.activity_codes;
  work_description erp.work_descriptions;
BEGIN
  IF tenant <> 'TENANT-LOCAL-001'
     OR skey <> 'DEUR-OFFLINE-RESTART-RUNTIME-CERT-2026-09-01'
     OR profile <> 'UAT_DEUR_OFFLINE_RESTART_RUNTIME_V1' THEN
    RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED');
  END IF;

  SELECT * INTO cost_code FROM erp.cost_codes
   WHERE active AND deleted_at IS NULL
   ORDER BY (code LIKE 'UAT%') DESC, sort_order, code, id LIMIT 1;
  SELECT * INTO activity_code FROM erp.activity_codes
   WHERE active AND deleted_at IS NULL
   ORDER BY (code LIKE 'UAT%') DESC, sort_order, code, id LIMIT 1;
  SELECT * INTO work_description FROM erp.work_descriptions
   WHERE active AND deleted_at IS NULL
   ORDER BY (code LIKE 'UAT%') DESC, sort_order, code, id LIMIT 1;

  RETURN jsonb_build_object(
    'success',cost_code.id IS NOT NULL AND activity_code.id IS NOT NULL AND work_description.id IS NOT NULL,
    'referencesReady',cost_code.id IS NOT NULL AND activity_code.id IS NOT NULL AND work_description.id IS NOT NULL,
    'costCodeId',cost_code.id,'activityCodeId',activity_code.id,'workDescriptionId',work_description.id
  );
END $$;

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
  operator_id text;
  scenario jsonb;
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
  SELECT * INTO existing FROM erp.uat_deur_offline_restart_runtime_scenarios
   WHERE company_id=tenant AND scenario_key=skey FOR UPDATE;
  IF existing.scenario_key IS NOT NULL THEN
    IF existing.profile_version <> profile THEN
      RETURN jsonb_build_object('success',false,'code','SCENARIO_PROFILE_MISMATCH');
    END IF;
    RETURN jsonb_build_object('success',true,'state',existing.state,'scenario',existing.scenario);
  END IF;

  SELECT scenario INTO baseline FROM erp.uat_deur_offline_runtime_scenarios
   WHERE company_id=tenant AND scenario_key='DEUR-OFFLINE-RUNTIME-CERT-2026-08-31';
  operator_id := baseline->>'operatorId';
  IF operator_id IS NULL OR NOT EXISTS (
    SELECT 1
      FROM erp.operators o
      JOIN erp.users u ON u.operator_id=o.id
      JOIN auth.users identity ON identity.id=u.id
     WHERE o.id=operator_id AND o.company_id=tenant AND o.status='Active' AND o.deleted_at IS NULL
       AND u.company_id=tenant AND u.status='active'
  ) THEN
    RETURN jsonb_build_object('success',false,'code','BASELINE_OPERATOR_UNAVAILABLE');
  END IF;

  scenario := jsonb_build_object(
    'projectId',gen_random_uuid(),'customerId',gen_random_uuid(),'rentalId',gen_random_uuid(),
    'lineId',gen_random_uuid(),'equipmentId',gen_random_uuid(),'assignmentId',gen_random_uuid(),
    'operatorId',operator_id
  );
  INSERT INTO erp.uat_deur_offline_restart_runtime_scenarios
    (company_id,scenario_key,profile_version,state,scenario)
  VALUES (tenant,skey,profile,'PROVISIONING',scenario);
  RETURN jsonb_build_object('success',true,'state','PROVISIONING','scenario',scenario);
END $$;

CREATE OR REPLACE FUNCTION erp.complete_uat_deur_offline_restart_runtime_scenario(command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=erp,auth,extensions,pg_catalog AS $$
DECLARE
  tenant text := trim(command->>'companyId');
  skey text := trim(command->>'scenarioKey');
  updated integer;
BEGIN
  IF tenant <> 'TENANT-LOCAL-001' OR skey <> 'DEUR-OFFLINE-RESTART-RUNTIME-CERT-2026-09-01' THEN
    RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED');
  END IF;
  UPDATE erp.uat_deur_offline_restart_runtime_scenarios
     SET state='DOMAIN_READY',updated_at=clock_timestamp()
   WHERE company_id=tenant AND scenario_key=skey AND state='PROVISIONING';
  GET DIAGNOSTICS updated = ROW_COUNT;
  IF updated <> 1 THEN
    RETURN jsonb_build_object('success',false,'code','SCENARIO_NOT_PROVISIONING');
  END IF;
  RETURN jsonb_build_object('success',true,'state','DOMAIN_READY');
END $$;

CREATE OR REPLACE FUNCTION erp.inspect_uat_deur_offline_restart_runtime_scenario(command jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=erp,auth,extensions,pg_catalog AS $$
DECLARE
  tenant text := trim(command->>'companyId');
  skey text := trim(command->>'scenarioKey');
  profile text := trim(command->>'profileVersion');
  work_date date := DATE '2026-09-01';
  stored erp.uat_deur_offline_restart_runtime_scenarios;
  scenario jsonb;
  target_deur erp.deurs;
  scenario_deur_count integer := 0;
  duplicate_daily_deur_count integer := 0;
  active_activity_count integer := 0;
  operational_timeline_count integer := 0;
  lifecycle_event_count integer := 0;
  current_activity text;
BEGIN
  IF tenant <> 'TENANT-LOCAL-001'
     OR skey <> 'DEUR-OFFLINE-RESTART-RUNTIME-CERT-2026-09-01'
     OR profile <> 'UAT_DEUR_OFFLINE_RESTART_RUNTIME_V1' THEN
    RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED');
  END IF;
  SELECT * INTO stored FROM erp.uat_deur_offline_restart_runtime_scenarios
   WHERE company_id=tenant AND scenario_key=skey;
  IF stored.scenario_key IS NULL THEN
    RETURN jsonb_build_object('success',false,'code','SCENARIO_NOT_FOUND');
  END IF;
  scenario := stored.scenario;

  SELECT count(*) INTO scenario_deur_count FROM erp.deurs d
   WHERE d.company_id=tenant AND d.rental_equipment_line_id=scenario->>'lineId' AND d.work_date=work_date;
  SELECT d.* INTO target_deur FROM erp.deurs d
   WHERE d.company_id=tenant AND d.rental_equipment_line_id=scenario->>'lineId' AND d.work_date=work_date
   ORDER BY d.created_at DESC LIMIT 1;
  IF target_deur.id IS NOT NULL THEN
    SELECT count(*) INTO duplicate_daily_deur_count FROM erp.deurs d
     WHERE d.company_id=tenant AND d.rental_equipment_line_id=target_deur.rental_equipment_line_id
       AND d.work_date=work_date AND d.id<>target_deur.id;
    SELECT count(*) INTO active_activity_count FROM erp.deur_events e
     WHERE e.deur_id=target_deur.id AND e.activity_type IN ('operation','idle','standby','mealBreak','breakdown') AND e.is_open;
    SELECT count(*) INTO operational_timeline_count FROM erp.deur_events e
     WHERE e.deur_id=target_deur.id AND e.activity_type IN ('operation','idle','standby','mealBreak','breakdown');
    SELECT count(*) INTO lifecycle_event_count FROM erp.deur_events e
     WHERE e.deur_id=target_deur.id AND e.activity_type='shift';
    SELECT e.activity_type INTO current_activity FROM erp.deur_events e
     WHERE e.deur_id=target_deur.id AND e.activity_type IN ('operation','idle','standby','mealBreak','breakdown') AND e.is_open
     ORDER BY e.sequence DESC LIMIT 1;
  END IF;

  RETURN jsonb_build_object(
    'success',true,'state',stored.state,'scenarioKey',skey,'profileVersion',profile,
    'projectId',scenario->>'projectId','customerId',scenario->>'customerId','rentalId',scenario->>'rentalId',
    'rentalEquipmentLineId',scenario->>'lineId','equipmentId',scenario->>'equipmentId',
    'assignmentId',scenario->>'assignmentId','operatorId',scenario->>'operatorId',
    'operatorActive',EXISTS(SELECT 1 FROM erp.operators o WHERE o.id=scenario->>'operatorId' AND o.company_id=tenant AND o.status='Active' AND o.deleted_at IS NULL),
    'assignmentCount',(SELECT count(*) FROM erp.assignments a WHERE a.id=scenario->>'assignmentId' AND a.company_id=tenant AND a.operator_id=scenario->>'operatorId'),
    'linkedApplicationUserCount',(SELECT count(*) FROM erp.users u WHERE u.company_id=tenant AND u.operator_id=scenario->>'operatorId' AND u.status='active'),
    'authIdentityPresent',EXISTS(SELECT 1 FROM erp.users u JOIN auth.users identity ON identity.id=u.id WHERE u.company_id=tenant AND u.operator_id=scenario->>'operatorId' AND u.status='active'),
    'eligibleWorkCount',(SELECT count(*) FROM erp.rental_equipment_lines l WHERE l.id=scenario->>'lineId' AND l.operator_id=scenario->>'operatorId' AND l.status IN ('Released','Active')),
    'scenarioDeurCount',scenario_deur_count,'duplicateDailyDeurCount',duplicate_daily_deur_count,
    'deurId',target_deur.id,'deurNumber',target_deur.deur_number,'workDate',target_deur.work_date,
    'status',target_deur.status,'version',target_deur.row_version,'currentActivity',current_activity,
    'activeActivityCount',active_activity_count,'operationalTimelineCount',operational_timeline_count,
    'lifecycleEventCount',lifecycle_event_count,
    'billingStatementCount',0,'invoiceCount',0,'reviewCount',0,'notificationCount',0,
    'returnMutationPresent',false,'crossOperatorExposure','[]'::jsonb
  );
END $$;

ALTER FUNCTION erp.resolve_uat_deur_offline_restart_runtime_references(jsonb) OWNER TO postgres;
ALTER FUNCTION erp.claim_uat_deur_offline_restart_runtime_scenario(jsonb) OWNER TO postgres;
ALTER FUNCTION erp.complete_uat_deur_offline_restart_runtime_scenario(jsonb) OWNER TO postgres;
ALTER FUNCTION erp.inspect_uat_deur_offline_restart_runtime_scenario(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.resolve_uat_deur_offline_restart_runtime_references(jsonb),
  erp.claim_uat_deur_offline_restart_runtime_scenario(jsonb),
  erp.complete_uat_deur_offline_restart_runtime_scenario(jsonb),
  erp.inspect_uat_deur_offline_restart_runtime_scenario(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION erp.resolve_uat_deur_offline_restart_runtime_references(jsonb),
  erp.claim_uat_deur_offline_restart_runtime_scenario(jsonb),
  erp.complete_uat_deur_offline_restart_runtime_scenario(jsonb),
  erp.inspect_uat_deur_offline_restart_runtime_scenario(jsonb) TO service_role;
COMMIT;
