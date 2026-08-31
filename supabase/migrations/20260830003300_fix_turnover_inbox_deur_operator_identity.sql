BEGIN;
SET LOCAL search_path=erp,auth,extensions,pg_catalog;

-- Forward-only read projection fix: preserve the immutable primary operator on
-- the nested DEUR identity returned to a pending-turnover reliever.
CREATE OR REPLACE FUNCTION erp.read_current_operator_deur_turnover_work()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=erp,auth,extensions,pg_catalog AS $$
DECLARE tenant text:=erp.current_company_id(); actor erp.users%ROWTYPE; work_items jsonb:='[]'::jsonb;
BEGIN
  IF auth.uid() IS NULL OR tenant IS NULL THEN RETURN jsonb_build_object('success',false,'code','UNAUTHENTICATED'); END IF;
  SELECT * INTO actor FROM erp.users u WHERE u.id=auth.uid() AND u.company_id=tenant AND u.status='active';
  IF actor.id IS NULL OR actor.operator_id IS NULL THEN RETURN jsonb_build_object('success',false,'code','OPERATOR_LINK_REQUIRED'); END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'turnoverId',t.id,'turnoverStatus',t.status,'turnoverToOperatorId',t.to_operator_id,
    'primaryOperatorId',d.operator_id,'currentAuthorizedOperatorId',erp.resolve_deur_authorized_operator(d.id,tenant),
    'deur',jsonb_build_object('id',d.id,'deurNumber',d.deur_number,'rentalId',d.rental_id,'rentalEquipmentLineId',d.rental_equipment_line_id,'assignmentId',d.assignment_id,'equipmentId',d.equipment_id,'workDate',d.work_date,'status',d.status,'version',d.row_version,'operatorId',d.operator_id,'activeActivity',(SELECT e.activity_type FROM erp.deur_events e WHERE e.deur_id=d.id AND e.is_open AND e.activity_type IN ('operation','idle','standby','mealBreak','breakdown') ORDER BY e.sequence DESC LIMIT 1)),
    'line',jsonb_build_object('id',l.id,'rentalId',l.rental_id,'equipmentId',l.equipment_id,'assignmentId',l.assignment_id,'primaryOperatorId',l.operator_id,'status',l.status,'operationalMetadata',l.operational_metadata),
    'assignment',jsonb_build_object('id',a.id,'projectId',a.project_id,'status',a.status),
    'equipment',jsonb_build_object('id',e.id,'name',e.equipment_name,'assetNumber',e.asset_no,'currentReading',e.current_reading),
    'rental',jsonb_build_object('id',r.id,'rentalNumber',r.rental_number,'status',r.status)
  ) ORDER BY t.initiated_at,t.id),'[]'::jsonb) INTO work_items
  FROM erp.deur_turnovers t
  JOIN erp.deurs d ON d.id=t.deur_id AND d.company_id=tenant AND d.status='In Progress'
  JOIN erp.rental_equipment_lines l ON l.id=d.rental_equipment_line_id AND l.deleted_at IS NULL
  JOIN erp.assignments a ON a.id=d.assignment_id AND a.company_id=tenant
  JOIN erp.equipment e ON e.id=d.equipment_id AND e.company_id=tenant
  JOIN erp.rentals r ON r.id=d.rental_id AND r.company_id=tenant
  WHERE t.company_id=tenant AND (t.from_operator_id=actor.operator_id OR t.to_operator_id=actor.operator_id)
    AND t.status IN ('PENDING','ACCEPTED');
  RETURN jsonb_build_object('success',true,'operatorId',actor.operator_id,'work',work_items);
END $$;
ALTER FUNCTION erp.read_current_operator_deur_turnover_work() OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.read_current_operator_deur_turnover_work() FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION erp.read_current_operator_deur_turnover_work() TO authenticated;
COMMIT;
