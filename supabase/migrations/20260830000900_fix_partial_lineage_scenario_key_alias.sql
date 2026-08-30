BEGIN;
SET LOCAL search_path=erp,auth,pg_catalog;

CREATE OR REPLACE FUNCTION erp.inspect_isolated_uat_partial_rental_lineage(command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=erp,auth,pg_catalog AS $$
DECLARE
 tenant_value text=trim(command->>'companyId');
 scenario_key_value text=trim(command->>'scenarioKey');
 rental_id_value text=trim(command->>'rentalId');
 residue erp.uat_multi_equipment_provisioning_scenarios;
 rental_row erp.rentals;
 lines jsonb;
BEGIN
 IF scenario_key_value<>'MULTI-EQUIPMENT-RUNTIME-CERT-2026-08-29' OR tenant_value IS NULL OR rental_id_value IS NULL
 OR NOT EXISTS(SELECT 1 FROM erp.companies c WHERE c.id=tenant_value AND c.active AND c.environment_class IN('compatibility','test'))
 THEN RETURN jsonb_build_object('success',false,'status','INVALID_SCENARIO'); END IF;
 SELECT r.* INTO residue FROM erp.uat_multi_equipment_provisioning_scenarios r WHERE r.company_id=tenant_value AND r.scenario_key=scenario_key_value;
 IF residue.scenario IS NULL OR rental_id_value NOT IN (residue.scenario->>'rentalAId',residue.scenario->>'rentalBId') THEN RETURN jsonb_build_object('success',false,'status','FORBIDDEN'); END IF;
 SELECT r.* INTO rental_row FROM erp.rentals r WHERE r.id=rental_id_value AND r.company_id=tenant_value;
 IF rental_row.id IS NULL THEN RETURN jsonb_build_object('success',true,'status','RENTAL_NOT_FOUND'); END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',l.id,'status',l.status,'companyId',l.company_id,'equipmentId',l.equipment_id,'assignmentId',l.assignment_id,'operatorId',l.operator_id) ORDER BY l.id),'[]'::jsonb) INTO lines
 FROM erp.rental_equipment_lines l WHERE l.rental_id=rental_id_value AND l.company_id=tenant_value AND l.deleted_at IS NULL;
 RETURN jsonb_build_object('success',true,'status','SUCCESS','rental',jsonb_build_object('id',rental_row.id,'rentalNumber',rental_row.rental_number,'status',rental_row.status,'companyId',rental_row.company_id,'customerId',rental_row.customer_id,'projectId',rental_row.project_id,'dateOut',rental_row.date_out,'expectedReturn',rental_row.expected_return,'rowVersion',rental_row.row_version),'lines',lines);
END $$;
ALTER FUNCTION erp.inspect_isolated_uat_partial_rental_lineage(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.inspect_isolated_uat_partial_rental_lineage(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION erp.inspect_isolated_uat_partial_rental_lineage(jsonb) TO service_role;
COMMIT;
