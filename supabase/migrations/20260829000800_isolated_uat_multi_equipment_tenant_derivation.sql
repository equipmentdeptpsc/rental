BEGIN;
SET LOCAL search_path=erp,auth,extensions,pg_catalog;

CREATE OR REPLACE FUNCTION erp.claim_isolated_uat_multi_equipment_provisioning(command jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,auth,extensions,pg_catalog AS $$
DECLARE tenant text=trim(command->>'companyId'); scenario_key_value text=trim(command->>'scenarioKey'); profile_value text=trim(command->>'profileVersion'); actor uuid=nullif(command->>'actorId','')::uuid; existing erp.uat_multi_equipment_provisioning_scenarios;
BEGIN
 IF scenario_key_value<>'MULTI-EQUIPMENT-RUNTIME-CERT-2026-08-29' OR profile_value<>'UAT_MULTI_EQUIPMENT_PER_WORKDAY_V1' OR actor IS NULL OR jsonb_typeof(command->'scenario')<>'object'
 OR NOT EXISTS(SELECT 1 FROM erp.companies c WHERE c.id=tenant AND c.active AND c.environment_class='compatibility')
 OR NOT EXISTS(SELECT 1 FROM erp.users u WHERE u.id=actor AND u.company_id=tenant AND u.status='active')
 THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(tenant||':uat-multi-equipment:'||scenario_key_value,0));
 SELECT * INTO existing FROM erp.uat_multi_equipment_provisioning_scenarios WHERE company_id=tenant AND scenario_key=scenario_key_value FOR UPDATE;
 IF existing.scenario_key IS NOT NULL THEN
   IF existing.profile_version<>profile_value THEN RETURN jsonb_build_object('success',false,'code','SCENARIO_PROFILE_MISMATCH'); END IF;
   RETURN jsonb_build_object('success',true,'state',existing.state,'scenario',existing.scenario);
 END IF;
 INSERT INTO erp.uat_multi_equipment_provisioning_scenarios(company_id,scenario_key,profile_version,state,actor_id,scenario)
 VALUES(tenant,scenario_key_value,profile_value,'PROVISIONING',actor,command->'scenario');
 RETURN jsonb_build_object('success',true,'state','PROVISIONING','scenario',command->'scenario');
END $$;

CREATE OR REPLACE FUNCTION erp.complete_isolated_uat_multi_equipment_provisioning(command jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,auth,extensions,pg_catalog AS $$
DECLARE tenant text=trim(command->>'companyId'); scenario_key_value text=trim(command->>'scenarioKey'); actor uuid=nullif(command->>'actorId','')::uuid; existing erp.uat_multi_equipment_provisioning_scenarios;
BEGIN
 IF scenario_key_value<>'MULTI-EQUIPMENT-RUNTIME-CERT-2026-08-29' OR actor IS NULL OR NOT EXISTS(SELECT 1 FROM erp.companies c WHERE c.id=tenant AND c.active AND c.environment_class='compatibility') THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;
 SELECT * INTO existing FROM erp.uat_multi_equipment_provisioning_scenarios WHERE company_id=tenant AND scenario_key=scenario_key_value FOR UPDATE;
 IF existing.scenario_key IS NULL OR existing.actor_id<>actor OR existing.state NOT IN('PROVISIONING','READY') THEN RETURN jsonb_build_object('success',false,'code','SCENARIO_NOT_CLAIMED'); END IF;
 UPDATE erp.uat_multi_equipment_provisioning_scenarios SET state='READY',updated_at=clock_timestamp() WHERE company_id=tenant AND scenario_key=scenario_key_value;
 INSERT INTO erp.audit_log(id,company_id,aggregate_type,aggregate_id,action,actor_id,occurred_at,new_values,metadata)
 VALUES(gen_random_uuid()::text,tenant,'UatSyntheticScenario',scenario_key_value,'UAT_MULTI_EQUIPMENT_PROVISIONED',actor::text,clock_timestamp(),jsonb_build_object('scenarioKey',scenario_key_value,'profileVersion',existing.profile_version),jsonb_build_object('source','isolated_uat_provisioner'));
 RETURN jsonb_build_object('success',true,'state','READY','scenario',existing.scenario);
END $$;
COMMIT;
