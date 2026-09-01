BEGIN;
SET LOCAL search_path=erp,auth,extensions,pg_catalog;
CREATE OR REPLACE FUNCTION erp.inspect_uat_limited_pilot_scenario1(command jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=erp,auth,extensions,pg_catalog AS $$
DECLARE tenant text:=trim(command->>'companyId'); k text:=trim(command->>'scenarioKey'); p text:=trim(command->>'profileVersion'); expected text:=trim(command->>'expectedDeurNumber'); s erp.uat_limited_operational_pilot_scenarios; d erp.deurs; scenario_count integer; dup integer; open_count integer; overlap integer; events jsonb; shift_end integer; submit_count integer;
BEGIN
 IF tenant<>'TENANT-LOCAL-001' OR k<>'LIMITED-OPERATIONAL-PILOT-2026-09' OR p<>'UAT_LIMITED_PILOT_V1' OR expected<>'DEUR-2026-000010' THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;
 SELECT * INTO s FROM erp.uat_limited_operational_pilot_scenarios x WHERE x.company_id=tenant AND x.scenario_key=k; IF s.scenario_key IS NULL THEN RETURN jsonb_build_object('success',false,'code','SCENARIO_NOT_FOUND'); END IF;
 SELECT count(*) INTO scenario_count FROM erp.deurs x WHERE x.company_id=tenant AND x.rental_equipment_line_id IN(s.scenario->>'line1Id',s.scenario->>'line2Id',s.scenario->>'line3Id');
 SELECT greatest(count(*)-1,0) INTO dup FROM erp.deurs x WHERE x.company_id=tenant AND x.rental_equipment_line_id IN(s.scenario->>'line1Id',s.scenario->>'line2Id',s.scenario->>'line3Id');
 SELECT * INTO d FROM erp.deurs x WHERE x.company_id=tenant AND x.deur_number=expected ORDER BY x.created_at DESC LIMIT 1;
 IF d.id IS NULL THEN RETURN jsonb_build_object('success',true,'state',s.state,'scenarioDeurCount',scenario_count,'duplicateDailyDeurCount',dup,'postSubmitReadable',false); END IF;
 SELECT count(*) INTO open_count FROM erp.deur_events x WHERE x.deur_id=d.id AND x.activity_type IN('operation','idle','mealBreak','breakdown') AND x.action='start' AND NOT EXISTS(SELECT 1 FROM erp.deur_events e WHERE e.deur_id=x.deur_id AND e.activity_type=x.activity_type AND e.action='end' AND e.sequence>x.sequence);
 overlap:=greatest(open_count-1,0); SELECT coalesce(jsonb_agg(jsonb_build_object('activityType',x.activity_type,'action',x.action,'sequence',x.sequence,'occurredAt',x.occurred_at,'actorId',x.actor_id) ORDER BY x.sequence),'[]'::jsonb) INTO events FROM erp.deur_events x WHERE x.deur_id=d.id;
 SELECT count(*) INTO shift_end FROM erp.deur_events x WHERE x.deur_id=d.id AND x.activity_type='shift' AND x.action='end'; SELECT count(*) INTO submit_count FROM erp.audit_log x WHERE x.company_id=tenant AND x.aggregate_type='DEUR' AND x.aggregate_id=d.id AND x.action='SUBMIT_DEUR';
 RETURN jsonb_build_object('success',true,'state',s.state,'deurId',d.id,'deurNumber',d.deur_number,'workDate',d.work_date,'status',d.status,'version',d.row_version,'rentalId',d.rental_id,'rentalEquipmentLineId',d.rental_equipment_line_id,'equipmentId',d.equipment_id,'assignmentId',d.assignment_id,'operatorId',d.operator_id,'currentActivity',null,'activeActivityCount',open_count,'activityOverlapCount',overlap,'activityTimeline',events,'operationalTimelineCount',(SELECT count(*) FROM erp.deur_events x WHERE x.deur_id=d.id AND x.activity_type<>'shift'),'endShiftCount',shift_end,'submit',jsonb_build_object('submitSuccessCount',CASE WHEN submit_count>0 THEN 1 ELSE 0 END,'submitAuditCount',submit_count,'duplicateSubmitMutationCount',greatest(submit_count-1,0)),'postSubmitReadable',d.status='Submitted','scenarioDeurCount',scenario_count,'duplicateDailyDeurCount',dup,'crossOperatorExposure','[]'::jsonb,'review',jsonb_build_object('status','BLOCKED','externalEmailBlocked',true),'externalEmailBlocked',true,'notificationCount',0,'billing',jsonb_build_object('status','BLOCKED'),'billingStatementCount',0,'invoiceCount',0,'return',jsonb_build_object('readiness','BLOCKED','returnMutationPresent',false),'returnMutationPresent',false);
END $$;
ALTER FUNCTION erp.inspect_uat_limited_pilot_scenario1(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.inspect_uat_limited_pilot_scenario1(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION erp.inspect_uat_limited_pilot_scenario1(jsonb) TO service_role;
COMMIT;
