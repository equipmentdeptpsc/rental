BEGIN;
SET LOCAL search_path=erp,auth,extensions,pg_catalog;
CREATE OR REPLACE FUNCTION erp.inspect_isolated_uat_multi_equipment_scenario(target_tenant text, target_scenario text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path=erp,auth,extensions,pg_catalog AS $$
DECLARE s erp.uat_multi_equipment_provisioning_scenarios; rental_count int; line_count int; deur_count int; billing_count int;
BEGIN
 IF target_scenario<>'MULTI-EQUIPMENT-RUNTIME-CERT-2026-08-29' OR NOT EXISTS(SELECT 1 FROM erp.companies c WHERE c.id=target_tenant AND c.active AND c.environment_class IN ('compatibility','test')) THEN RETURN jsonb_build_object('success',false,'code','UAT_TENANT_REQUIRED'); END IF;
 SELECT * INTO s FROM erp.uat_multi_equipment_provisioning_scenarios WHERE company_id=target_tenant AND scenario_key=target_scenario;
 IF s.scenario_key IS NULL THEN RETURN jsonb_build_object('success',true,'state','NOT_STARTED','scenarioKey',target_scenario,'profile','UAT_MULTI_EQUIPMENT_PER_WORKDAY_V1','counts',jsonb_build_object('residue',0)); END IF;
 SELECT count(*) INTO rental_count FROM erp.rentals WHERE company_id=target_tenant AND id IN (s.scenario->>'rentalAId',s.scenario->>'rentalBId');
 SELECT count(*) INTO line_count FROM erp.rental_equipment_lines WHERE company_id=target_tenant AND id IN (SELECT jsonb_array_elements_text(COALESCE(s.scenario->'rentalALineIds','[]'::jsonb)) UNION ALL SELECT s.scenario->>'rentalBLineId');
 SELECT count(*) INTO deur_count FROM erp.deurs WHERE company_id=target_tenant AND rental_id IN (s.scenario->>'rentalAId',s.scenario->>'rentalBId');
 SELECT count(*) INTO billing_count FROM erp.billing_statements WHERE company_id=target_tenant AND rental_id IN (s.scenario->>'rentalAId',s.scenario->>'rentalBId');
 RETURN jsonb_build_object('success',true,'state',CASE WHEN s.state='READY' AND rental_count=2 AND line_count=3 THEN 'COMPLETE_CONSISTENT' ELSE 'PARTIAL_RESUMABLE' END,'scenario',jsonb_build_object('key',s.scenario_key,'profileVersion',s.profile_version,'residueState',s.state,'createdAt',s.created_at,'updatedAt',s.updated_at,'ids',s.scenario,'lastDiagnostic',s.last_diagnostic),'counts',jsonb_build_object('residue',1,'rentals',rental_count,'lines',line_count,'deurs',deur_count,'billingStatements',billing_count,'returns',0));
END $$;
REVOKE ALL ON FUNCTION erp.inspect_isolated_uat_multi_equipment_scenario(text,text) FROM PUBLIC,authenticated,anon;
GRANT EXECUTE ON FUNCTION erp.inspect_isolated_uat_multi_equipment_scenario(text,text) TO service_role;
COMMIT;
