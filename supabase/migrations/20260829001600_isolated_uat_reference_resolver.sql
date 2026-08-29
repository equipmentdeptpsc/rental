BEGIN;
SET LOCAL search_path=erp,auth,extensions,pg_catalog;
CREATE OR REPLACE FUNCTION erp.resolve_isolated_uat_multi_equipment_references(command jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path=erp,auth,extensions,pg_catalog AS $$
DECLARE tenant text=trim(command->>'companyId'); scenario_key_value text=trim(command->>'scenarioKey'); profile_value text=trim(command->>'profileVersion'); cost_row erp.cost_codes; activity_row erp.activity_codes;
BEGIN
 IF tenant<>'TENANT-LOCAL-001' OR scenario_key_value<>'MULTI-EQUIPMENT-RUNTIME-CERT-2026-08-29' OR profile_value<>'UAT_MULTI_EQUIPMENT_PER_WORKDAY_V1' OR NOT EXISTS(SELECT 1 FROM erp.companies c WHERE c.id=tenant AND c.active AND c.environment_class='compatibility') THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;
 SELECT * INTO cost_row FROM erp.cost_codes c WHERE c.active AND c.deleted_at IS NULL ORDER BY (c.code LIKE 'UAT%') DESC,c.sort_order,c.code,c.id LIMIT 1;
 SELECT * INTO activity_row FROM erp.activity_codes a WHERE a.active AND a.deleted_at IS NULL ORDER BY (a.code LIKE 'UAT%') DESC,a.sort_order,a.code,a.id LIMIT 1;
 IF cost_row.id IS NULL THEN RETURN jsonb_build_object('success',false,'code','COST_CODE_NOT_FOUND'); END IF;
 IF activity_row.id IS NULL THEN RETURN jsonb_build_object('success',false,'code','ACTIVITY_CODE_NOT_FOUND'); END IF;
 RETURN jsonb_build_object('success',true,'costCodeId',cost_row.id,'costCodeCode',cost_row.code,'activityCodeId',activity_row.id,'activityCodeCode',activity_row.code);
END $$;
REVOKE ALL ON FUNCTION erp.resolve_isolated_uat_multi_equipment_references(jsonb) FROM PUBLIC,authenticated,anon;
GRANT EXECUTE ON FUNCTION erp.resolve_isolated_uat_multi_equipment_references(jsonb) TO service_role;
COMMIT;
