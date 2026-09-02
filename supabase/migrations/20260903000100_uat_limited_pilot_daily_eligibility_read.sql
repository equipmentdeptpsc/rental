BEGIN;
SET LOCAL search_path=erp,auth,extensions,pg_catalog;

-- Fixed-scenario, read-only eligibility projection for the next pilot DEUR.
CREATE OR REPLACE FUNCTION erp.inspect_uat_limited_pilot_daily_eligibility(command jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=erp,auth,extensions,pg_catalog AS $$
DECLARE
  tenant text:=trim(command->>'companyId');
  key text:=trim(command->>'scenarioKey');
  profile text:=trim(command->>'profileVersion');
  requested date;
  clock_date date;
  scenario jsonb;
  lines jsonb;
BEGIN
  IF tenant<>'TENANT-LOCAL-001' OR key<>'LIMITED-OPERATIONAL-PILOT-2026-09' OR profile<>'UAT_LIMITED_PILOT_V1'
     OR jsonb_object_length(command) NOT IN (3,4) THEN
    RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED');
  END IF;
  requested:=nullif(command->>'workDate','')::date;
  SELECT effective_business_date INTO clock_date FROM erp.uat_limited_pilot_business_clock
    WHERE company_id=tenant AND scenario_key=key AND profile_version=profile;
  IF clock_date IS NULL OR (requested IS NOT NULL AND requested<>clock_date) THEN
    RETURN jsonb_build_object('success',false,'code','BUSINESS_DATE_MISMATCH','effectiveBusinessDate',clock_date);
  END IF;
  requested:=clock_date;
  SELECT s.scenario INTO scenario FROM erp.uat_limited_operational_pilot_scenarios s
    WHERE s.company_id=tenant AND s.scenario_key=key AND s.profile_version=profile AND s.state='DOMAIN_READY';
  IF scenario IS NULL THEN RETURN jsonb_build_object('success',false,'code','SCENARIO_NOT_READY'); END IF;

  SELECT coalesce(jsonb_agg(item ORDER BY item->>'rentalEquipmentLineId'),'[]'::jsonb) INTO lines
  FROM (
    SELECT jsonb_build_object(
      'operatorId',l.operator_id,'operatorDisplayName',o.name,
      'operatorActive',o.status='Active',
      'operatorLinkedApplicationUserCount',(SELECT count(*) FROM erp.users u WHERE u.company_id=tenant AND u.operator_id=l.operator_id AND u.status='active'),
      'operatorAuthIdentityPresent',EXISTS(SELECT 1 FROM erp.users u JOIN auth.users au ON au.id=u.id WHERE u.company_id=tenant AND u.operator_id=l.operator_id AND u.status='active'),
      'equipmentId',l.equipment_id,'equipmentCode',e.asset_no,'equipmentDisplayName',e.equipment_name,
      'rentalId',r.id,'rentalNumber',r.rental_number,'rentalEquipmentLineId',l.id,'assignmentId',l.assignment_id,
      'assignmentActive',a.status='Active','lineActive',l.status IN ('Released','Active'),
      'dailyDeurCount',(SELECT count(*) FROM erp.deurs d WHERE d.company_id=tenant AND d.rental_equipment_line_id=l.id AND d.work_date=requested AND d.status<>'Rejected'),
      'existingDeur',(SELECT jsonb_build_object('deurId',d.id,'deurNumber',d.deur_number,'status',d.status) FROM erp.deurs d WHERE d.company_id=tenant AND d.rental_equipment_line_id=l.id AND d.work_date=requested AND d.status<>'Rejected' ORDER BY d.created_at DESC LIMIT 1),
      'priorOpenDeur',(SELECT jsonb_build_object('deurId',d.id,'deurNumber',d.deur_number,'status',d.status) FROM erp.deurs d WHERE d.company_id=tenant AND d.rental_equipment_line_id=l.id AND d.status IN ('Draft','In Progress') ORDER BY d.created_at DESC LIMIT 1),
      'pendingTurnover',(SELECT jsonb_build_object('turnoverId',t.id,'fromOperatorId',t.from_operator_id,'toOperatorId',t.to_operator_id,'status',t.status) FROM erp.deur_turnovers t WHERE t.company_id=tenant AND t.deur_id IN (SELECT d.id FROM erp.deurs d WHERE d.company_id=tenant AND d.rental_equipment_line_id=l.id AND d.status IN ('Draft','In Progress')) AND t.status='PENDING' ORDER BY t.initiated_at DESC LIMIT 1)
    ) || jsonb_build_object(
      'workDate',requested,
      'operatorAuthorized',o.status='Active' AND a.status='Active' AND l.status IN ('Released','Active') AND r.status IN ('Released','Active'),
      'eligible',(a.status='Active' AND o.status='Active' AND l.status IN ('Released','Active') AND r.status IN ('Released','Active') AND (SELECT count(*) FROM erp.deurs d WHERE d.company_id=tenant AND d.rental_equipment_line_id=l.id AND d.work_date=requested AND d.status<>'Rejected')=0 AND NOT EXISTS (SELECT 1 FROM erp.deurs d JOIN erp.deur_turnovers t ON t.deur_id=d.id WHERE d.company_id=tenant AND d.rental_equipment_line_id=l.id AND d.status IN ('Draft','In Progress') AND t.status='PENDING')),
      'blockReasons',to_jsonb(array_remove(ARRAY[
        CASE WHEN a.status IS DISTINCT FROM 'Active' THEN 'ASSIGNMENT_INACTIVE' END,
        CASE WHEN o.status IS DISTINCT FROM 'Active' THEN 'OPERATOR_INACTIVE' END,
        CASE WHEN l.status NOT IN ('Released','Active') THEN 'LINE_INACTIVE' END,
        CASE WHEN r.status NOT IN ('Released','Active') THEN 'RENTAL_INACTIVE' END,
        CASE WHEN EXISTS (SELECT 1 FROM erp.deurs d WHERE d.company_id=tenant AND d.rental_equipment_line_id=l.id AND d.work_date=requested AND d.status<>'Rejected') THEN 'DAILY_DEUR_EXISTS' END,
        CASE WHEN EXISTS (SELECT 1 FROM erp.deurs d JOIN erp.deur_turnovers t ON t.deur_id=d.id WHERE d.company_id=tenant AND d.rental_equipment_line_id=l.id AND d.status IN ('Draft','In Progress') AND t.status='PENDING') THEN 'PENDING_TURNOVER' END
      ],NULL))
    ) AS item
    FROM erp.rental_equipment_lines l
    JOIN erp.rentals r ON r.id=l.rental_id AND r.company_id=tenant
    JOIN erp.equipment e ON e.id=l.equipment_id AND e.company_id=tenant
    JOIN erp.assignments a ON a.id=l.assignment_id AND a.company_id=tenant
    JOIN erp.operators o ON o.id=l.operator_id AND o.company_id=tenant
    WHERE l.company_id=tenant AND l.id IN (scenario->>'line1Id',scenario->>'line2Id',scenario->>'line3Id') AND l.deleted_at IS NULL
  ) q;
  RETURN jsonb_build_object('success',true,'state','DOMAIN_READY','scenarioKey',key,'profileVersion',profile,'workDate',requested,'lines',lines);
END $$;

ALTER FUNCTION erp.inspect_uat_limited_pilot_daily_eligibility(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.inspect_uat_limited_pilot_daily_eligibility(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION erp.inspect_uat_limited_pilot_daily_eligibility(jsonb) TO service_role;
COMMIT;
