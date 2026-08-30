BEGIN;
SET LOCAL search_path=erp,auth,extensions,pg_catalog;
CREATE OR REPLACE FUNCTION erp.inspect_isolated_uat_partial_rental_lineage(command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=erp,auth,pg_catalog AS $$
DECLARE v_company_id text=trim(command->>'companyId'); v_scenario_key text=trim(command->>'scenarioKey'); v_rental_id text=trim(command->>'rentalId'); residue erp.uat_multi_equipment_provisioning_scenarios; rental_row erp.rentals; lines jsonb;
BEGIN
 IF v_scenario_key<>'MULTI-EQUIPMENT-RUNTIME-CERT-2026-08-29' OR v_company_id IS NULL OR v_rental_id IS NULL OR NOT EXISTS(SELECT 1 FROM erp.companies c WHERE c.id=v_company_id AND c.active AND c.environment_class IN('compatibility','test')) THEN RETURN jsonb_build_object('success',false,'status','INVALID_SCENARIO'); END IF;
 SELECT * INTO residue FROM erp.uat_multi_equipment_provisioning_scenarios r WHERE r.company_id=v_company_id AND r.scenario_key=v_scenario_key;
 IF residue.scenario IS NULL OR residue.scenario->>'rentalAId'<>v_rental_id THEN RETURN jsonb_build_object('success',false,'status','FORBIDDEN'); END IF;
 SELECT * INTO rental_row FROM erp.rentals WHERE id=v_rental_id AND company_id=v_company_id;
 IF rental_row.id IS NULL THEN RETURN jsonb_build_object('success',true,'status','RENTAL_NOT_FOUND'); END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',l.id,'status',l.status,'companyId',l.company_id,'equipmentId',l.equipment_id,'assignmentId',l.assignment_id,'operatorId',l.operator_id) ORDER BY l.id),'[]'::jsonb) INTO lines FROM erp.rental_equipment_lines l WHERE l.rental_id=v_rental_id AND l.company_id=v_company_id AND l.deleted_at IS NULL;
 RETURN jsonb_build_object('success',true,'status','SUCCESS','rental',jsonb_build_object('id',rental_row.id,'rentalNumber',rental_row.rental_number,'status',rental_row.status,'companyId',rental_row.company_id,'customerId',rental_row.customer_id,'projectId',rental_row.project_id,'dateOut',rental_row.date_out,'expectedReturn',rental_row.expected_return,'rowVersion',rental_row.row_version),'lines',lines);
END $$;
ALTER FUNCTION erp.inspect_isolated_uat_partial_rental_lineage(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.inspect_isolated_uat_partial_rental_lineage(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION erp.inspect_isolated_uat_partial_rental_lineage(jsonb) TO service_role;
COMMIT;
