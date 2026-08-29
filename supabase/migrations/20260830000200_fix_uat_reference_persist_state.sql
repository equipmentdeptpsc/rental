BEGIN;
SET LOCAL search_path=erp,auth,extensions,pg_catalog;
CREATE OR REPLACE FUNCTION erp.update_isolated_uat_multi_equipment_references(command jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,auth,extensions,pg_catalog AS $$
DECLARE tenant text=trim(command->>'companyId'); scenario_key_value text=trim(command->>'scenarioKey'); actor uuid=nullif(command->>'actorId','')::uuid; existing erp.uat_multi_equipment_provisioning_scenarios; incoming jsonb=COALESCE(command->'references','{}'::jsonb); merged jsonb; key_name text;
BEGIN
 IF scenario_key_value<>'MULTI-EQUIPMENT-RUNTIME-CERT-2026-08-29' OR actor IS NULL OR NOT EXISTS(SELECT 1 FROM erp.companies c WHERE c.id=tenant AND c.active AND c.environment_class IN ('compatibility','test')) THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;
 SELECT * INTO existing FROM erp.uat_multi_equipment_provisioning_scenarios WHERE company_id=tenant AND scenario_key=scenario_key_value FOR UPDATE;
 IF existing.scenario_key IS NULL OR existing.actor_id<>actor OR existing.profile_version<>'UAT_MULTI_EQUIPMENT_PER_WORKDAY_V1' THEN RETURN jsonb_build_object('success',false,'code','SCENARIO_NOT_CLAIMED'); END IF;
 FOR key_name IN SELECT jsonb_object_keys(incoming) LOOP
   IF key_name NOT IN ('customerId','projectId','workDescriptionId','costCodeId','activityCodeId') THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;
   IF NULLIF(existing.scenario->>key_name,'') IS NOT NULL AND existing.scenario->>key_name <> incoming->>key_name THEN RETURN jsonb_build_object('success',false,'code','SCENARIO_REFERENCE_CONFLICT'); END IF;
 END LOOP;
 merged:=existing.scenario;
 FOREACH key_name IN ARRAY ARRAY['customerId','projectId','workDescriptionId','costCodeId','activityCodeId'] LOOP
   IF NULLIF(merged->>key_name,'') IS NULL AND NULLIF(incoming->>key_name,'') IS NOT NULL THEN merged:=jsonb_set(merged,ARRAY[key_name],to_jsonb(incoming->>key_name),true); END IF;
 END LOOP;
 UPDATE erp.uat_multi_equipment_provisioning_scenarios SET scenario=merged,updated_at=clock_timestamp() WHERE company_id=tenant AND scenario_key=scenario_key_value;
 RETURN jsonb_build_object('success',true,'state',existing.state,'scenario',merged);
END $$;
REVOKE ALL ON FUNCTION erp.update_isolated_uat_multi_equipment_references(jsonb) FROM PUBLIC,authenticated,anon;
GRANT EXECUTE ON FUNCTION erp.update_isolated_uat_multi_equipment_references(jsonb) TO service_role;
COMMIT;
