BEGIN;
SET LOCAL search_path=erp,auth,extensions,pg_catalog;
CREATE OR REPLACE FUNCTION erp.inspect_isolated_uat_multi_operator_work_ownership(command jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=erp,auth,extensions,pg_catalog AS $$
DECLARE tenant text:=trim(command->>'companyId'); skey text:=trim(command->>'scenarioKey'); profile text:=trim(command->>'profileVersion'); ids text[]; lines text[]; outv jsonb:='[]'::jsonb; oid text; lid text; rowv jsonb;
BEGIN
 ids:=ARRAY(SELECT jsonb_array_elements_text(coalesce(command->'operatorIds','[]'::jsonb))); lines:=ARRAY(SELECT jsonb_array_elements_text(coalesce(command->'lineIds','[]'::jsonb)));
 IF skey<>'MULTI-EQUIPMENT-RUNTIME-CERT-2026-08-29' OR profile<>'UAT_MULTI_EQUIPMENT_PER_WORKDAY_V1' OR tenant IS NULL OR cardinality(ids)<>3 OR cardinality(lines)<>3 OR NOT EXISTS(SELECT 1 FROM companies c WHERE c.id=tenant AND c.active AND c.environment_class IN('compatibility','test')) OR NOT EXISTS(SELECT 1 FROM uat_multi_equipment_provisioning_scenarios s WHERE s.company_id=tenant AND s.scenario_key=skey) THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;
 FOREACH oid IN ARRAY ids LOOP
   FOR rowv IN SELECT jsonb_build_object('rentalId',l.rental_id,'rentalEquipmentLineId',l.id,'equipmentId',l.equipment_id,'assignmentId',l.assignment_id,'operatorId',l.operator_id,'lineStatus',l.status,'assignmentStatus',a.status,'ownershipMatch',l.operator_id=oid) FROM rental_equipment_lines l LEFT JOIN assignments a ON a.id=l.assignment_id AND a.company_id=tenant WHERE l.company_id=tenant AND l.id=ANY(lines) AND l.operator_id=oid AND l.deleted_at IS NULL LOOP outv:=outv||jsonb_build_array(rowv); END LOOP;
 END LOOP;
 RETURN jsonb_build_object('success',true,'readStatus','SUCCESS','workItems',outv);
EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('success',false,'code','READ_FAILED'); END $$;
ALTER FUNCTION erp.inspect_isolated_uat_multi_operator_work_ownership(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.inspect_isolated_uat_multi_operator_work_ownership(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION erp.inspect_isolated_uat_multi_operator_work_ownership(jsonb) TO service_role;
COMMIT;
