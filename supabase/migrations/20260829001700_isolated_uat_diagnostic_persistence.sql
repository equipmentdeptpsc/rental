BEGIN;
SET LOCAL search_path=erp,auth,extensions,pg_catalog;
ALTER TABLE erp.uat_multi_equipment_provisioning_scenarios ADD COLUMN IF NOT EXISTS last_diagnostic jsonb;
CREATE OR REPLACE FUNCTION erp.record_isolated_uat_provisioning_diagnostic(command jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,auth,extensions,pg_catalog AS $$
DECLARE tenant text=trim(command->>'companyId'); scenario_key_value text=trim(command->>'scenarioKey'); actor uuid=nullif(command->>'actorId','')::uuid; existing erp.uat_multi_equipment_provisioning_scenarios; diagnostic jsonb=command->'diagnostic';
BEGIN
 IF tenant<>'TENANT-LOCAL-001' OR scenario_key_value<>'MULTI-EQUIPMENT-RUNTIME-CERT-2026-08-29' OR actor IS NULL OR jsonb_typeof(diagnostic)<>'object' THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;
 SELECT * INTO existing FROM erp.uat_multi_equipment_provisioning_scenarios WHERE company_id=tenant AND scenario_key=scenario_key_value FOR UPDATE;
 IF existing.scenario_key IS NULL OR existing.actor_id<>actor THEN RETURN jsonb_build_object('success',false,'code','SCENARIO_NOT_CLAIMED'); END IF;
 UPDATE erp.uat_multi_equipment_provisioning_scenarios SET last_diagnostic=diagnostic,updated_at=clock_timestamp() WHERE company_id=tenant AND scenario_key=scenario_key_value;
 RETURN jsonb_build_object('success',true);
END $$;
REVOKE ALL ON FUNCTION erp.record_isolated_uat_provisioning_diagnostic(jsonb) FROM PUBLIC,authenticated,anon;
GRANT EXECUTE ON FUNCTION erp.record_isolated_uat_provisioning_diagnostic(jsonb) TO service_role;
COMMIT;
