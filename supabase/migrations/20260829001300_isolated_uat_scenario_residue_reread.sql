BEGIN;
SET LOCAL search_path=erp,auth,extensions,pg_catalog;

CREATE OR REPLACE FUNCTION erp.read_isolated_uat_multi_equipment_residue(command jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER STABLE
SET search_path=erp,auth,extensions,pg_catalog AS $$
DECLARE tenant text=trim(command->>'companyId'); scenario_key_value text=trim(command->>'scenarioKey'); actor uuid=nullif(command->>'actorId','')::uuid; existing erp.uat_multi_equipment_provisioning_scenarios;
BEGIN
 IF tenant<>'TENANT-LOCAL-001' OR scenario_key_value<>'MULTI-EQUIPMENT-RUNTIME-CERT-2026-08-29' OR actor IS NULL THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;
 SELECT * INTO existing FROM erp.uat_multi_equipment_provisioning_scenarios WHERE company_id=tenant AND scenario_key=scenario_key_value;
 IF existing.scenario_key IS NULL OR existing.actor_id<>actor THEN RETURN jsonb_build_object('success',false,'code','SCENARIO_NOT_CLAIMED'); END IF;
 RETURN jsonb_build_object('success',true,'state',existing.state,'profileVersion',existing.profile_version,'scenario',existing.scenario);
END $$;

REVOKE ALL ON FUNCTION erp.read_isolated_uat_multi_equipment_residue(jsonb) FROM PUBLIC,authenticated,anon;
GRANT EXECUTE ON FUNCTION erp.read_isolated_uat_multi_equipment_residue(jsonb) TO service_role;
COMMIT;
