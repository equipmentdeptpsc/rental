BEGIN;
SET LOCAL search_path=erp,auth,extensions,pg_catalog;

-- This is the only authenticated reliever projection. It derives the actor,
-- company, and nominated DEUR server-side and never grants table reads.
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
    'turnoverId',turnover.id,'turnoverStatus',turnover.status,'primaryOperatorId',deur_record.operator_id,
    'currentAuthorizedOperatorId',erp.current_deur_authorized_operator(deur_record.id),
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
  WHERE turnover.company_id=tenant AND turnover.to_operator_id=actor.operator_id
    AND deur_record.status='In Progress'
    AND ((turnover.status='PENDING') OR (turnover.status='ACCEPTED' AND erp.current_deur_authorized_operator(deur_record.id)=actor.operator_id));
  RETURN jsonb_build_object('success',true,'operatorId',actor.operator_id,'work',work_items);
END $$;

CREATE OR REPLACE FUNCTION erp.inspect_isolated_uat_deur_turnover(command jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=erp,auth,extensions,pg_catalog AS $$
DECLARE
  input_tenant text:=trim(command->>'companyId'); input_scenario_key text:=trim(command->>'scenarioKey');
  input_profile_version text:=trim(command->>'profileVersion'); input_expected_number text:=trim(command->>'expectedDeurNumber');
  input_expected_date date:=nullif(trim(command->>'expectedWorkDate'),'')::date; target_deur erp.deurs%ROWTYPE;
  current_custodian text; turnover_count integer:=0; pending_turnover jsonb:=NULL; accepted_turnover jsonb:=NULL;
  lifecycle_count integer:=0; operational_count integer:=0; current_activity text:='NONE'; duplicate_count integer:=0;
  target_lines text[]:=ARRAY['22dd0a6f-6f74-4ca4-a48e-2ec5e6d1cbf2','d1df121a-94f2-47e3-a153-3e47e1218878','aeafa42d-97dd-40a5-bca7-8ed36e495153'];
BEGIN
  IF input_tenant<>'TENANT-LOCAL-001' OR input_scenario_key<>'MULTI-EQUIPMENT-RUNTIME-CERT-2026-08-29'
    OR input_profile_version<>'UAT_MULTI_EQUIPMENT_PER_WORKDAY_V1' OR input_expected_date IS NULL
    OR NOT EXISTS(SELECT 1 FROM erp.companies AS company WHERE company.id=input_tenant AND company.active AND company.environment_class IN('compatibility','test'))
  THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;
  IF NOT EXISTS(SELECT 1 FROM erp.uat_multi_equipment_provisioning_scenarios AS scenario
    WHERE scenario.company_id=input_tenant AND scenario.scenario_key=input_scenario_key) THEN RETURN jsonb_build_object('success',false,'code','SCENARIO_NOT_FOUND'); END IF;
  SELECT * INTO target_deur FROM erp.deurs AS deur_record WHERE deur_record.company_id=input_tenant
    AND deur_record.deur_number=input_expected_number AND deur_record.rental_equipment_line_id=ANY(target_lines)
    AND coalesce(deur_record.report_date,deur_record.work_date)=input_expected_date;
  IF target_deur.id IS NULL THEN RETURN jsonb_build_object('success',false,'code','DEUR_NOT_FOUND'); END IF;
  current_custodian:=erp.resolve_deur_authorized_operator(target_deur.id,input_tenant);
  SELECT count(*) INTO turnover_count FROM erp.deur_turnovers AS turnover WHERE turnover.company_id=input_tenant AND turnover.deur_id=target_deur.id;
  SELECT jsonb_build_object('id',turnover.id,'status',turnover.status,'fromOperatorId',turnover.from_operator_id,'toOperatorId',turnover.to_operator_id,'initiatedAt',turnover.initiated_at) INTO pending_turnover
    FROM erp.deur_turnovers AS turnover WHERE turnover.company_id=input_tenant AND turnover.deur_id=target_deur.id AND turnover.status='PENDING' ORDER BY turnover.initiated_at DESC LIMIT 1;
  SELECT jsonb_build_object('id',turnover.id,'status',turnover.status,'fromOperatorId',turnover.from_operator_id,'toOperatorId',turnover.to_operator_id,'initiatedAt',turnover.initiated_at,'acceptedAt',turnover.accepted_at) INTO accepted_turnover
    FROM erp.deur_turnovers AS turnover WHERE turnover.company_id=input_tenant AND turnover.deur_id=target_deur.id AND turnover.status='ACCEPTED' ORDER BY turnover.accepted_at DESC,turnover.id DESC LIMIT 1;
  SELECT count(*) INTO lifecycle_count FROM erp.deur_events AS event_record WHERE event_record.deur_id=target_deur.id AND event_record.activity_type IN ('shift','turnover');
  SELECT count(*) INTO operational_count FROM erp.deur_events AS event_record WHERE event_record.deur_id=target_deur.id AND event_record.activity_type IN ('operation','idle','standby','mealBreak','breakdown');
  SELECT coalesce(event_record.activity_type,'NONE') INTO current_activity FROM erp.deur_events AS event_record
    WHERE event_record.deur_id=target_deur.id AND event_record.is_open AND event_record.activity_type IN ('operation','idle','standby','mealBreak','breakdown') ORDER BY event_record.sequence DESC LIMIT 1;
  SELECT count(*) INTO duplicate_count FROM erp.deurs AS deur_record WHERE deur_record.company_id=input_tenant
    AND deur_record.rental_equipment_line_id=target_deur.rental_equipment_line_id AND coalesce(deur_record.report_date,deur_record.work_date)=input_expected_date;
  RETURN jsonb_build_object('success',true,'deur',jsonb_build_object('id',target_deur.id,'deurNumber',target_deur.deur_number,'primaryOperatorId',target_deur.operator_id,'currentAuthorizedOperatorId',current_custodian,'rentalEquipmentLineId',target_deur.rental_equipment_line_id,'workDate',target_deur.work_date,'status',target_deur.status),'turnoverCount',turnover_count,'pendingTurnover',pending_turnover,'acceptedTurnover',accepted_turnover,'lifecycleEventCount',lifecycle_count,'operationalEventCount',operational_count,'currentActivity',current_activity,'duplicateDailyDeurCount',duplicate_count,'crossOperatorExposure',jsonb_build_array());
EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('success',false,'code','READ_FAILED'); END $$;

ALTER FUNCTION erp.read_current_operator_deur_turnover_work() OWNER TO postgres;
ALTER FUNCTION erp.inspect_isolated_uat_deur_turnover(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.read_current_operator_deur_turnover_work() FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION erp.read_current_operator_deur_turnover_work() TO authenticated;
REVOKE ALL ON FUNCTION erp.inspect_isolated_uat_deur_turnover(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION erp.inspect_isolated_uat_deur_turnover(jsonb) TO service_role;

COMMIT;
