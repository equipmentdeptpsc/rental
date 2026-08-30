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
   IF existing.state='FAILED' THEN
     UPDATE erp.uat_multi_equipment_provisioning_scenarios SET state='PROVISIONING',actor_id=actor,updated_at=clock_timestamp() WHERE company_id=tenant AND scenario_key=scenario_key_value RETURNING * INTO existing;
   END IF;
   RETURN jsonb_build_object('success',true,'state',existing.state,'scenario',existing.scenario);
 END IF;
 INSERT INTO erp.uat_multi_equipment_provisioning_scenarios(company_id,scenario_key,profile_version,state,actor_id,scenario)
 VALUES(tenant,scenario_key_value,profile_value,'PROVISIONING',actor,command->'scenario');
 RETURN jsonb_build_object('success',true,'state','PROVISIONING','scenario',command->'scenario');
END $$;

CREATE OR REPLACE FUNCTION erp.inspect_isolated_uat_partial_rental_lineage(command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,auth,pg_catalog AS $$
DECLARE tenant text=trim(command->>'companyId'); scenario_key text=trim(command->>'scenarioKey'); rental_id text=trim(command->>'rentalId'); residue erp.uat_multi_equipment_provisioning_scenarios; rental_row erp.rentals; lines jsonb;
BEGIN
 IF scenario_key<>'MULTI-EQUIPMENT-RUNTIME-CERT-2026-08-29' OR tenant IS NULL OR rental_id IS NULL OR NOT EXISTS(SELECT 1 FROM erp.companies c WHERE c.id=tenant AND c.active AND c.environment_class IN('compatibility','test')) THEN RETURN jsonb_build_object('success',false,'status','INVALID_SCENARIO'); END IF;
 SELECT * INTO residue FROM erp.uat_multi_equipment_provisioning_scenarios r WHERE r.company_id=tenant AND r.scenario_key=scenario_key;
 IF residue.scenario IS NULL OR rental_id NOT IN (residue.scenario->>'rentalAId',residue.scenario->>'rentalBId') THEN RETURN jsonb_build_object('success',false,'status','FORBIDDEN'); END IF;
 SELECT * INTO rental_row FROM erp.rentals WHERE id=rental_id AND company_id=tenant;
 IF rental_row.id IS NULL THEN RETURN jsonb_build_object('success',true,'status','RENTAL_NOT_FOUND'); END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',l.id,'status',l.status,'companyId',l.company_id,'equipmentId',l.equipment_id,'assignmentId',l.assignment_id,'operatorId',l.operator_id) ORDER BY l.id),'[]'::jsonb) INTO lines FROM erp.rental_equipment_lines l WHERE l.rental_id=rental_id AND l.company_id=tenant AND l.deleted_at IS NULL;
 RETURN jsonb_build_object('success',true,'status','SUCCESS','rental',jsonb_build_object('id',rental_row.id,'rentalNumber',rental_row.rental_number,'status',rental_row.status,'companyId',rental_row.company_id,'customerId',rental_row.customer_id,'projectId',rental_row.project_id,'dateOut',rental_row.date_out,'expectedReturn',rental_row.expected_return,'rowVersion',rental_row.row_version),'lines',lines);
END $$;
COMMIT;
