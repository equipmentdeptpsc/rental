BEGIN;
SET LOCAL search_path=erp,auth,extensions,pg_catalog;
CREATE OR REPLACE FUNCTION erp.inspect_isolated_uat_scenario_deur(command jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=erp,auth,extensions,pg_catalog AS $$
DECLARE target_tenant text:=trim(command->>'companyId'); target_scenario text:=trim(command->>'scenarioKey'); target_profile text:=trim(command->>'profileVersion'); target_number text:=trim(command->>'expectedDeurNumber'); target_date date:=nullif(trim(command->>'expectedWorkDate'),'')::date; target_lines text[]:=ARRAY['22dd0a6f-6f74-4ca4-a48e-2ec5e6d1cbf2','d1df121a-94f2-47e3-a153-3e47e1218878','aeafa42d-97dd-40a5-bca7-8ed36e495153']; line_id text; line_count integer; total_count integer; exact_deur jsonb; activity_count integer; open_activity_count integer; lifecycle_count integer; activity_rows jsonb:='[]'::jsonb; line_rows jsonb:='[]'::jsonb;
BEGIN
 IF target_tenant<>'TENANT-LOCAL-001' OR target_scenario<>'MULTI-EQUIPMENT-RUNTIME-CERT-2026-08-29' OR target_profile<>'UAT_MULTI_EQUIPMENT_PER_WORKDAY_V1' OR target_number<>'DEUR-2026-000003' OR target_date IS NULL OR NOT EXISTS(SELECT 1 FROM erp.companies c WHERE c.id=target_tenant AND c.active AND c.environment_class IN('compatibility','test')) THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;
 IF NOT EXISTS(SELECT 1 FROM erp.uat_multi_equipment_provisioning_scenarios s WHERE s.company_id=target_tenant AND s.scenario_key=target_scenario) THEN RETURN jsonb_build_object('success',false,'code','SCENARIO_NOT_FOUND'); END IF;
 SELECT count(*) INTO total_count FROM erp.deurs d WHERE d.company_id=target_tenant AND coalesce(d.report_date,d.work_date)=target_date AND d.rental_equipment_line_id=ANY(target_lines);
 SELECT jsonb_build_object('id',d.id,'deurNumber',d.deur_number,'tenantId',d.company_id,'rentalId',d.rental_id,'rentalEquipmentLineId',d.rental_equipment_line_id,'equipmentId',d.equipment_id,'assignmentId',d.assignment_id,'operatorId',d.operator_id,'workDate',d.work_date,'status',d.status) INTO exact_deur FROM erp.deurs d WHERE d.company_id=target_tenant AND d.deur_number=target_number;
 IF exact_deur IS NOT NULL THEN
   SELECT count(*) INTO activity_count FROM erp.deur_events ev WHERE ev.deur_id=(exact_deur->>'id') AND ev.activity_type IN('operation','idle','standby','mealBreak','breakdown');
   SELECT count(*) INTO open_activity_count FROM erp.deur_events ev WHERE ev.deur_id=(exact_deur->>'id') AND ev.activity_type IN('operation','idle','standby','mealBreak','breakdown') AND ev.is_open;
   SELECT count(*) INTO lifecycle_count FROM erp.deur_events ev WHERE ev.deur_id=(exact_deur->>'id') AND ev.activity_type='shift';
   SELECT coalesce(jsonb_agg(jsonb_build_object('recordId',ev.id,'activityType',ev.activity_type,'action',ev.action,'startedAt',CASE WHEN ev.action='start' THEN ev.occurred_at ELSE NULL END,'endedAt',CASE WHEN ev.action='end' THEN ev.occurred_at ELSE NULL END,'status',CASE WHEN ev.is_open THEN 'OPEN' ELSE 'CLOSED' END,'source',ev.source,'actorId',ev.actor_id,'deurId',ev.deur_id,'isOperational',ev.activity_type IN('operation','idle','standby','mealBreak','breakdown')) ORDER BY ev.sequence),'[]'::jsonb) INTO activity_rows FROM erp.deur_events ev WHERE ev.deur_id=(exact_deur->>'id');
 END IF;
 FOREACH line_id IN ARRAY target_lines LOOP SELECT count(*) INTO line_count FROM erp.deurs d WHERE d.company_id=target_tenant AND d.rental_equipment_line_id=line_id AND coalesce(d.report_date,d.work_date)=target_date; line_rows:=line_rows||jsonb_build_array(jsonb_build_object('rentalEquipmentLineId',line_id,'deurCount',line_count)); END LOOP;
 RETURN jsonb_build_object('success',true,'readStatus','SUCCESS','scenarioDeurCount',total_count,'lineCounts',line_rows,'deur',exact_deur,'activityTimelineCount',coalesce(activity_count,0),'activeActivityCount',coalesce(open_activity_count,0),'currentActivity',CASE WHEN coalesce(open_activity_count,0)=0 THEN 'NONE' ELSE 'OPEN' END,'lifecycleEventCount',coalesce(lifecycle_count,0),'activityRows',activity_rows);
EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('success',false,'code','READ_FAILED'); END $$;
ALTER FUNCTION erp.inspect_isolated_uat_scenario_deur(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.inspect_isolated_uat_scenario_deur(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION erp.inspect_isolated_uat_scenario_deur(jsonb) TO service_role;
COMMIT;
