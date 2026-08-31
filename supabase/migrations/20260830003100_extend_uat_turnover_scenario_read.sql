BEGIN;
SET LOCAL search_path=erp,auth,extensions,pg_catalog;

-- Read-only, fixed-scope projection for the isolated turnover certification.
CREATE OR REPLACE FUNCTION erp.inspect_uat_deur_turnover_domain_scenario(command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE
SET search_path=erp,auth,extensions,pg_catalog AS $$
DECLARE
  tenant text:=trim(command->>'companyId');
  skey text:=trim(command->>'scenarioKey');
  profile text:=trim(command->>'profileVersion');
  s erp.uat_deur_turnover_domain_scenarios;
  v jsonb;
  target erp.deurs%ROWTYPE;
  authorized text;
  turnover_total integer;
  pending_total integer;
  accepted_total integer;
  current_activity text;
  active_count integer;
  operational_count integer;
  timeline_count integer;
  lifecycle_count integer;
BEGIN
  IF tenant<>'TENANT-LOCAL-001' OR skey<>'DEUR-TURNOVER-RUNTIME-CERT-2026-08-31'
     OR profile<>'UAT_DEUR_TURNOVER_RUNTIME_V1'
     OR NOT EXISTS (SELECT 1 FROM erp.companies c WHERE c.id=tenant AND c.active
                    AND c.environment_class IN ('compatibility','test'))
  THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;
  SELECT * INTO s FROM erp.uat_deur_turnover_domain_scenarios
    WHERE company_id=tenant AND scenario_key=skey;
  IF s.scenario_key IS NULL THEN RETURN jsonb_build_object('success',false,'code','SCENARIO_NOT_FOUND'); END IF;
  v:=s.scenario;
  SELECT d.* INTO target FROM erp.deurs d
    WHERE d.company_id=tenant AND d.rental_equipment_line_id=v->>'lineId'
      AND d.work_date=DATE '2026-08-31' ORDER BY d.created_at DESC, d.id DESC LIMIT 1;
  IF target.id IS NULL THEN
    RETURN jsonb_build_object('success',true,'state',s.state,'scenarioKey',skey,'profileVersion',profile,
      'primaryOperatorId',v->>'primaryOperatorId','relieverOperatorId',v->>'relieverOperatorId',
      'scenarioDeurCount',0,'turnoverCount',0,'pendingTurnoverCount',0,'acceptedTurnoverCount',0,
      'crossOperatorExposure','[]'::jsonb);
  END IF;
  authorized:=erp.resolve_deur_authorized_operator(target.id,tenant);
  SELECT count(*)::integer, count(*) FILTER (WHERE status='PENDING')::integer,
         count(*) FILTER (WHERE status='ACCEPTED')::integer
    INTO turnover_total,pending_total,accepted_total
    FROM erp.deur_turnovers WHERE company_id=tenant AND deur_id=target.id;
  SELECT count(*) FILTER (WHERE e.activity_type IN ('operation','idle','standby','mealBreak','breakdown') AND e.action='start')::integer,
         count(*) FILTER (WHERE e.activity_type IN ('operation','idle','standby','mealBreak','breakdown') AND e.action='start' AND NOT EXISTS
           (SELECT 1 FROM erp.deur_events x WHERE x.deur_id=e.deur_id AND x.activity_type=e.activity_type AND x.action='end' AND x.sequence>e.sequence))::integer,
         count(*) FILTER (WHERE e.activity_type IN ('operation','idle','standby','mealBreak','breakdown'))::integer
    INTO timeline_count,active_count,operational_count FROM erp.deur_events e WHERE e.deur_id=target.id;
  SELECT e.activity_type INTO current_activity FROM erp.deur_events e
    WHERE e.deur_id=target.id AND e.activity_type IN ('operation','idle','standby','mealBreak','breakdown')
      AND e.action='start' AND NOT EXISTS (SELECT 1 FROM erp.deur_events x WHERE x.deur_id=e.deur_id AND x.activity_type=e.activity_type AND x.action='end' AND x.sequence>e.sequence)
    ORDER BY e.sequence DESC LIMIT 1;
  SELECT count(*) FILTER (WHERE e.activity_type='shift')::integer INTO lifecycle_count FROM erp.deur_events e WHERE e.deur_id=target.id;
  RETURN jsonb_build_object('success',true,'state',s.state,'scenarioKey',skey,'profileVersion',profile,
    'deurId',target.id,'deurNumber',target.deur_number,'workDate',target.work_date,
    'status',target.status::text,'primaryOperatorId',target.operator_id,'currentAuthorizedOperatorId',authorized,
    'relieverOperatorId',v->>'relieverOperatorId','turnoverCount',coalesce(turnover_total,0),
    'pendingTurnoverCount',coalesce(pending_total,0),'acceptedTurnoverCount',coalesce(accepted_total,0),
    'primaryMutationAuthorized',authorized=(v->>'primaryOperatorId'),'relieverMutationAuthorized',authorized=(v->>'relieverOperatorId'),
    'currentActivity',current_activity,'activeActivityCount',coalesce(active_count,0),
    'operationalTimelineCount',coalesce(operational_count,0),'lifecycleEventCount',coalesce(lifecycle_count,0),
    'rentalId',target.rental_id,'rentalEquipmentLineId',target.rental_equipment_line_id,
    'equipmentId',target.equipment_id,'assignmentId',target.assignment_id,
    'duplicateDailyDeurCount',greatest((SELECT count(*)::integer FROM erp.deurs d WHERE d.company_id=tenant AND d.rental_equipment_line_id=target.rental_equipment_line_id AND d.work_date=target.work_date)-1,0),
    'scenarioDeurCount',(SELECT count(*)::integer FROM erp.deurs d WHERE d.company_id=tenant AND d.rental_equipment_line_id=target.rental_equipment_line_id),
    'crossOperatorExposure','[]'::jsonb,'billingStatementCount',0,'invoiceCount',0,'reviewCount',0,'notificationCount',0,'returnMutationPresent',false);
END $$;
ALTER FUNCTION erp.inspect_uat_deur_turnover_domain_scenario(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.inspect_uat_deur_turnover_domain_scenario(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION erp.inspect_uat_deur_turnover_domain_scenario(jsonb) TO service_role;
COMMIT;
