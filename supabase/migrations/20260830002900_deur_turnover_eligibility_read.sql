BEGIN;
SET LOCAL search_path=erp,auth,extensions,pg_catalog;

-- Read-only target projection for the mobile turnover picker. The caller may
-- only choose from this server-derived set; no operator id is accepted from
-- the client outside the returned projection.
CREATE OR REPLACE FUNCTION erp.read_eligible_deur_turnover_operators(command jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=erp,auth,extensions,pg_catalog AS $$
DECLARE
  tenant text:=erp.current_company_id();
  actor erp.users%ROWTYPE;
  target_deur erp.deurs%ROWTYPE;
  target_line erp.rental_equipment_lines%ROWTYPE;
  current_operator text;
  candidates jsonb:='[]'::jsonb;
BEGIN
  IF auth.uid() IS NULL OR tenant IS NULL OR NOT erp.current_user_has_permission('deur.update')
    THEN RETURN jsonb_build_object('success',false,'code','FORBIDDEN'); END IF;
  SELECT * INTO actor FROM erp.users AS user_record
    WHERE user_record.id=auth.uid() AND user_record.company_id=tenant AND user_record.status='active';
  IF actor.id IS NULL OR actor.operator_id IS NULL OR actor.operator_id<>nullif(btrim(command->>'operatorId'),'')
    THEN RETURN jsonb_build_object('success',false,'code','OWNERSHIP_MISMATCH'); END IF;
  SELECT * INTO target_deur FROM erp.deurs AS deur_record
    WHERE deur_record.id=nullif(btrim(command->>'deurId'),'') AND deur_record.company_id=tenant;
  IF target_deur.id IS NULL OR target_deur.status<>'In Progress'
    THEN RETURN jsonb_build_object('success',false,'code','NOT_FOUND'); END IF;
  SELECT * INTO target_line FROM erp.rental_equipment_lines AS line_record
    WHERE line_record.id=target_deur.rental_equipment_line_id AND line_record.company_id=tenant AND line_record.deleted_at IS NULL;
  IF target_line.id IS NULL OR target_line.id<>nullif(btrim(command->>'rentalLineId'),'')
    OR target_line.rental_id<>target_deur.rental_id OR target_line.equipment_id<>target_deur.equipment_id
    THEN RETURN jsonb_build_object('success',false,'code','RELATIONSHIP_MISMATCH'); END IF;
  current_operator:=erp.current_deur_authorized_operator(target_deur.id);
  IF current_operator IS DISTINCT FROM actor.operator_id
    THEN RETURN jsonb_build_object('success',false,'code','OWNERSHIP_MISMATCH'); END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('operatorId',operator_record.id,'displayName',operator_record.name,'status',operator_record.status) ORDER BY operator_record.name,operator_record.id),'[]'::jsonb)
    INTO candidates
    FROM erp.operators AS operator_record
    WHERE operator_record.company_id=tenant AND operator_record.status='Active' AND operator_record.deleted_at IS NULL
      AND operator_record.id<>current_operator
      AND (SELECT count(*) FROM erp.users AS user_record WHERE user_record.company_id=tenant AND user_record.operator_id=operator_record.id AND user_record.status='active')=1;
  RETURN jsonb_build_object('success',true,'deurId',target_deur.id,'rentalEquipmentLineId',target_line.id,'currentAuthorizedOperatorId',current_operator,'operators',candidates);
EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('success',false,'code','READ_FAILED');
END $$;

ALTER FUNCTION erp.read_eligible_deur_turnover_operators(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.read_eligible_deur_turnover_operators(jsonb) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION erp.read_eligible_deur_turnover_operators(jsonb) TO authenticated;
COMMIT;
