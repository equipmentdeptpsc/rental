BEGIN;
SET LOCAL search_path=erp,auth,extensions,pg_catalog;

CREATE OR REPLACE FUNCTION erp.read_eligible_deur_turnover_operators(command jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=erp,auth,extensions,pg_catalog AS $$
DECLARE tenant text:=erp.current_company_id(); actor erp.users%ROWTYPE; target_deur erp.deurs%ROWTYPE; target_line erp.rental_equipment_lines%ROWTYPE; current_operator text; scenario_reliever text;
BEGIN
  IF auth.uid() IS NULL OR tenant IS NULL OR NOT erp.current_user_has_permission('deur.update') THEN RETURN jsonb_build_object('success',false,'code','FORBIDDEN'); END IF;
  SELECT * INTO actor FROM erp.users WHERE id=auth.uid() AND company_id=tenant AND status='active';
  IF actor.id IS NULL OR actor.operator_id IS NULL OR actor.operator_id<>nullif(btrim(command->>'operatorId'),'') THEN RETURN jsonb_build_object('success',false,'code','OWNERSHIP_MISMATCH'); END IF;
  SELECT * INTO target_deur FROM erp.deurs WHERE id=nullif(btrim(command->>'deurId'),'') AND company_id=tenant;
  IF target_deur.id IS NULL OR target_deur.status<>'In Progress' THEN RETURN jsonb_build_object('success',false,'code','NOT_FOUND'); END IF;
  SELECT * INTO target_line FROM erp.rental_equipment_lines WHERE id=target_deur.rental_equipment_line_id AND company_id=tenant AND deleted_at IS NULL;
  IF target_line.id IS NULL OR target_line.id<>nullif(btrim(command->>'rentalLineId'),'') OR target_line.rental_id<>target_deur.rental_id OR target_line.equipment_id<>target_deur.equipment_id THEN RETURN jsonb_build_object('success',false,'code','RELATIONSHIP_MISMATCH'); END IF;
  current_operator:=erp.current_deur_authorized_operator(target_deur.id);
  IF current_operator IS DISTINCT FROM actor.operator_id THEN RETURN jsonb_build_object('success',false,'code','OWNERSHIP_MISMATCH'); END IF;
  SELECT scenario->>'relieverOperatorId' INTO scenario_reliever FROM erp.uat_deur_turnover_domain_scenarios WHERE company_id=tenant AND scenario->>'rentalId'=target_deur.rental_id AND scenario->>'lineId'=target_deur.rental_equipment_line_id LIMIT 1;
  RETURN jsonb_build_object('success',true,'deurId',target_deur.id,'rentalEquipmentLineId',target_line.id,'currentAuthorizedOperatorId',current_operator,
    'operators',coalesce((SELECT jsonb_agg(jsonb_build_object('operatorId',o.id,'displayName',o.name,'status',o.status) ORDER BY o.name,o.id) FROM erp.operators o WHERE o.company_id=tenant AND o.status='Active' AND o.deleted_at IS NULL AND o.id<>current_operator AND (scenario_reliever IS NULL OR o.id=scenario_reliever) AND (SELECT count(*) FROM erp.users u WHERE u.company_id=tenant AND u.operator_id=o.id AND u.status='active')=1),'[]'::jsonb));
EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('success',false,'code','READ_FAILED'); END $$;
ALTER FUNCTION erp.read_eligible_deur_turnover_operators(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.read_eligible_deur_turnover_operators(jsonb) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION erp.read_eligible_deur_turnover_operators(jsonb) TO authenticated;
COMMIT;
