BEGIN;
SET LOCAL search_path=erp,auth,extensions,pg_catalog;

-- The scenario payload intentionally contains durable domain IDs only.  Its
-- work date is part of this fixed certification contract, not persisted JSON.
CREATE OR REPLACE FUNCTION erp.inspect_uat_deur_offline_runtime_scenario(command jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=erp,auth,extensions,pg_catalog
AS $$
DECLARE
  tenant text := trim(command->>'companyId');
  skey text := trim(command->>'scenarioKey');
  profile text := trim(command->>'profileVersion');
  target_work_date date := DATE '2026-08-31';
  s erp.uat_deur_offline_runtime_scenarios;
  v jsonb;
  target_deur erp.deurs;
  scenario_deur_count integer := 0;
  duplicate_daily_deur_count integer := 0;
  active_activity_count integer := 0;
  operational_timeline_count integer := 0;
  lifecycle_event_count integer := 0;
  current_activity text;
BEGIN
  IF tenant <> 'TENANT-LOCAL-001'
     OR skey <> 'DEUR-OFFLINE-RUNTIME-CERT-2026-08-31'
     OR profile <> 'UAT_DEUR_OFFLINE_RUNTIME_V1' THEN
    RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED');
  END IF;

  SELECT * INTO s
    FROM erp.uat_deur_offline_runtime_scenarios
   WHERE company_id=tenant AND scenario_key=skey;
  IF s.scenario_key IS NULL THEN
    RETURN jsonb_build_object('success',false,'code','SCENARIO_NOT_FOUND');
  END IF;
  v := s.scenario;

  SELECT count(*) INTO scenario_deur_count
    FROM erp.deurs d
   WHERE d.company_id=tenant
     AND d.rental_equipment_line_id=v->>'lineId'
     AND d.work_date=target_work_date;

  SELECT d.* INTO target_deur
    FROM erp.deurs d
   WHERE d.company_id=tenant
     AND d.rental_equipment_line_id=v->>'lineId'
     AND d.work_date=target_work_date
   ORDER BY d.created_at DESC
   LIMIT 1;

  IF target_deur.id IS NOT NULL THEN
    SELECT count(*) INTO duplicate_daily_deur_count
      FROM erp.deurs d
     WHERE d.company_id=tenant
       AND d.rental_equipment_line_id=target_deur.rental_equipment_line_id
       AND d.work_date=target_work_date
       AND d.id<>target_deur.id;
    SELECT count(*) INTO active_activity_count
      FROM erp.deur_events e
     WHERE e.deur_id=target_deur.id
       AND e.activity_type IN ('operation','idle','standby','mealBreak','breakdown')
       AND e.is_open;
    SELECT count(*) INTO operational_timeline_count
      FROM erp.deur_events e
     WHERE e.deur_id=target_deur.id
       AND e.activity_type IN ('operation','idle','standby','mealBreak','breakdown');
    SELECT count(*) INTO lifecycle_event_count
      FROM erp.deur_events e
     WHERE e.deur_id=target_deur.id AND e.activity_type='shift';
    SELECT e.activity_type INTO current_activity
      FROM erp.deur_events e
     WHERE e.deur_id=target_deur.id
       AND e.activity_type IN ('operation','idle','standby','mealBreak','breakdown')
       AND e.is_open
     ORDER BY e.sequence DESC
     LIMIT 1;
  END IF;

  RETURN jsonb_build_object(
    'success',true,'state',s.state,'scenarioKey',skey,'profileVersion',profile,
    'projectId',v->>'projectId','customerId',v->>'customerId','rentalId',v->>'rentalId',
    'rentalEquipmentLineId',v->>'lineId','equipmentId',v->>'equipmentId',
    'assignmentId',v->>'assignmentId','operatorId',v->>'operatorId',
    'operatorActive',EXISTS(SELECT 1 FROM erp.operators o WHERE o.id=v->>'operatorId' AND o.company_id=tenant AND o.status='Active' AND o.deleted_at IS NULL),
    'assignmentCount',(SELECT count(*) FROM erp.assignments a WHERE a.id=v->>'assignmentId' AND a.company_id=tenant AND a.operator_id=v->>'operatorId'),
    'linkedApplicationUserCount',(SELECT count(*) FROM erp.users u WHERE u.company_id=tenant AND u.operator_id=v->>'operatorId' AND u.status='active'),
    'authIdentityPresent',EXISTS(SELECT 1 FROM erp.users u JOIN auth.users au ON au.id=u.id WHERE u.company_id=tenant AND u.operator_id=v->>'operatorId' AND u.status='active'),
    'eligibleWorkCount',(SELECT count(*) FROM erp.rental_equipment_lines l WHERE l.id=v->>'lineId' AND l.operator_id=v->>'operatorId' AND l.status IN ('Released','Active')),
    'scenarioDeurCount',scenario_deur_count,'duplicateDailyDeurCount',duplicate_daily_deur_count,
    'deurId',target_deur.id,'deurNumber',target_deur.deur_number,'workDate',target_deur.work_date,
    'status',target_deur.status,'version',target_deur.row_version,'currentActivity',current_activity,
    'activeActivityCount',active_activity_count,'operationalTimelineCount',operational_timeline_count,
    'lifecycleEventCount',lifecycle_event_count,
    'billingStatementCount',0,'invoiceCount',0,'reviewCount',0,'notificationCount',0,
    'returnMutationPresent',false,'crossOperatorExposure','[]'::jsonb
  );
END $$;

ALTER FUNCTION erp.inspect_uat_deur_offline_runtime_scenario(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.inspect_uat_deur_offline_runtime_scenario(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION erp.inspect_uat_deur_offline_runtime_scenario(jsonb) TO service_role;
COMMIT;
