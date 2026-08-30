BEGIN;
SET LOCAL search_path=erp,auth,extensions,pg_catalog;

-- A primary operator retains read-only visibility after hand-off. The nominated
-- reliever sees the same bounded projection. Only the accepted custodian may
-- execute the runtime commands enforced by 20260830002300.
CREATE OR REPLACE FUNCTION erp.read_current_operator_deur_turnover_work()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=erp,auth,extensions,pg_catalog AS $$
DECLARE tenant text:=erp.current_company_id(); actor erp.users%ROWTYPE; work_items jsonb:='[]'::jsonb;
BEGIN
  IF auth.uid() IS NULL OR tenant IS NULL THEN RETURN jsonb_build_object('success',false,'code','UNAUTHENTICATED'); END IF;
  SELECT * INTO actor FROM erp.users AS user_record
    WHERE user_record.id=auth.uid() AND user_record.company_id=tenant AND user_record.status='active';
  IF actor.id IS NULL OR actor.operator_id IS NULL THEN RETURN jsonb_build_object('success',false,'code','OPERATOR_LINK_REQUIRED'); END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'turnoverId',turnover.id,'turnoverStatus',turnover.status,'turnoverToOperatorId',turnover.to_operator_id,
    'primaryOperatorId',deur_record.operator_id,'currentAuthorizedOperatorId',erp.current_deur_authorized_operator(deur_record.id),
    'deur',jsonb_build_object('id',deur_record.id,'deurNumber',deur_record.deur_number,'rentalId',deur_record.rental_id,
      'rentalEquipmentLineId',deur_record.rental_equipment_line_id,'assignmentId',deur_record.assignment_id,
      'equipmentId',deur_record.equipment_id,'workDate',deur_record.work_date,'status',deur_record.status,'version',deur_record.row_version,
      'activeActivity',(SELECT event_record.activity_type FROM erp.deur_events AS event_record WHERE event_record.deur_id=deur_record.id AND event_record.is_open AND event_record.activity_type IN ('operation','idle','standby','mealBreak','breakdown') ORDER BY event_record.sequence DESC LIMIT 1)),
    'line',jsonb_build_object('id',line_record.id,'rentalId',line_record.rental_id,'equipmentId',line_record.equipment_id,
      'assignmentId',line_record.assignment_id,'primaryOperatorId',line_record.operator_id,'status',line_record.status,'operationalMetadata',line_record.operational_metadata),
    'assignment',jsonb_build_object('id',assignment_record.id,'projectId',assignment_record.project_id,'status',assignment_record.status),
    'equipment',jsonb_build_object('id',equipment_record.id,'name',equipment_record.equipment_name,'assetNumber',equipment_record.asset_no,'currentReading',equipment_record.current_reading),
    'rental',jsonb_build_object('id',rental_record.id,'rentalNumber',rental_record.rental_number,'status',rental_record.status)
  ) ORDER BY turnover.initiated_at,turnover.id),'[]'::jsonb) INTO work_items
  FROM erp.deur_turnovers AS turnover
  JOIN erp.deurs AS deur_record ON deur_record.id=turnover.deur_id AND deur_record.company_id=tenant
  JOIN erp.rental_equipment_lines AS line_record ON line_record.id=deur_record.rental_equipment_line_id
    AND line_record.company_id=tenant AND line_record.deleted_at IS NULL
  JOIN erp.assignments AS assignment_record ON assignment_record.id=deur_record.assignment_id AND assignment_record.company_id=tenant
  JOIN erp.equipment AS equipment_record ON equipment_record.id=deur_record.equipment_id AND equipment_record.company_id=tenant
  JOIN erp.rentals AS rental_record ON rental_record.id=deur_record.rental_id AND rental_record.company_id=tenant
  WHERE turnover.company_id=tenant AND deur_record.status='In Progress'
    AND (turnover.from_operator_id=actor.operator_id OR turnover.to_operator_id=actor.operator_id)
    AND turnover.status IN ('PENDING','ACCEPTED');
  RETURN jsonb_build_object('success',true,'operatorId',actor.operator_id,'work',work_items);
END $$;

ALTER FUNCTION erp.read_current_operator_deur_turnover_work() OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.read_current_operator_deur_turnover_work() FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION erp.read_current_operator_deur_turnover_work() TO authenticated;

COMMIT;
