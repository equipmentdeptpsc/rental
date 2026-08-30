BEGIN;
SET LOCAL search_path=erp,auth,extensions,pg_catalog;
CREATE OR REPLACE FUNCTION erp.inspect_isolated_uat_scenario_deur(command jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=erp,auth,extensions,pg_catalog AS $$
DECLARE tenant text:=trim(command->>'companyId'); sk text:=trim(command->>'scenarioKey'); pv text:=trim(command->>'profileVersion'); expected_number text:=trim(command->>'expectedDeurNumber'); expected_date date:=nullif(trim(command->>'expectedWorkDate'),'')::date; target_lines text[]:=ARRAY['22dd0a6f-6f74-4ca4-a48e-2ec5e6d1cbf2','d1df121a-94f2-47e3-a153-3e47e1218878','aeafa42d-97dd-40a5-bca7-8ed36e495153']; did text; total_count integer; line_count integer; activity_count integer:=0; open_count integer:=0; lifecycle_count integer:=0; exact_deur jsonb; activity_rows jsonb:='[]'::jsonb; line_rows jsonb:='[]'::jsonb; lid text;
BEGIN
 IF tenant<>'TENANT-LOCAL-001' OR sk<>'MULTI-EQUIPMENT-RUNTIME-CERT-2026-08-29' OR pv<>'UAT_MULTI_EQUIPMENT_PER_WORKDAY_V1' OR expected_date IS NULL OR NOT EXISTS(SELECT 1 FROM erp.companies c WHERE c.id=tenant AND c.active AND c.environment_class IN('compatibility','test')) THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;
 IF NOT EXISTS(SELECT 1 FROM erp.uat_multi_equipment_provisioning_scenarios s WHERE s.company_id=tenant AND s.scenario_key=sk) THEN RETURN jsonb_build_object('success',false,'code','SCENARIO_NOT_FOUND'); END IF;
 SELECT d.id INTO did FROM erp.deurs d WHERE d.company_id=tenant AND d.deur_number=expected_number AND d.rental_equipment_line_id=ANY(target_lines) AND coalesce(d.report_date,d.work_date)=expected_date;
 IF did IS NULL THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;
 SELECT count(*) INTO total_count FROM erp.deurs d WHERE d.company_id=tenant AND coalesce(d.report_date,d.work_date)=expected_date AND d.rental_equipment_line_id=ANY(target_lines);
 SELECT jsonb_build_object('id',d.id,'deurNumber',d.deur_number,'tenantId',d.company_id,'rentalId',d.rental_id,'rentalEquipmentLineId',d.rental_equipment_line_id,'equipmentId',d.equipment_id,'assignmentId',d.assignment_id,'operatorId',d.operator_id,'workDate',d.work_date,'status',d.status) INTO exact_deur FROM erp.deurs d WHERE d.id=did;
 SELECT count(*) INTO activity_count FROM erp.deur_events ev WHERE ev.deur_id=did AND ev.activity_type IN('operation','idle','standby','mealBreak','breakdown');
 SELECT count(*) INTO open_count FROM erp.deur_events ev WHERE ev.deur_id=did AND ev.activity_type IN('operation','idle','standby','mealBreak','breakdown') AND ev.is_open;
 SELECT count(*) INTO lifecycle_count FROM erp.deur_events ev WHERE ev.deur_id=did AND ev.activity_type='shift';
 SELECT coalesce(jsonb_agg(jsonb_build_object('recordId',ev.id,'activityType',ev.activity_type,'action',ev.action,'status',CASE WHEN ev.is_open THEN 'OPEN' ELSE 'CLOSED' END,'source',ev.source,'actorId',ev.actor_id,'deurId',ev.deur_id,'isOperational',ev.activity_type IN('operation','idle','standby','mealBreak','breakdown')) ORDER BY ev.sequence),'[]'::jsonb) INTO activity_rows FROM erp.deur_events ev WHERE ev.deur_id=did;
 FOREACH lid IN ARRAY target_lines LOOP SELECT count(*) INTO line_count FROM erp.deurs d WHERE d.company_id=tenant AND d.rental_equipment_line_id=lid AND coalesce(d.report_date,d.work_date)=expected_date; line_rows:=line_rows||jsonb_build_array(jsonb_build_object('rentalEquipmentLineId',lid,'deurCount',line_count)); END LOOP;
 RETURN jsonb_build_object('success',true,'readStatus','SUCCESS','scenarioDeurCount',total_count,'lineCounts',line_rows,'deur',exact_deur,'activityTimelineCount',activity_count,'activeActivityCount',open_count,'currentActivity',CASE WHEN open_count=0 THEN 'NONE' ELSE 'OPEN' END,'lifecycleEventCount',lifecycle_count,'activityRows',activity_rows);
EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('success',false,'code','READ_FAILED'); END $$;
ALTER FUNCTION erp.inspect_isolated_uat_scenario_deur(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.inspect_isolated_uat_scenario_deur(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION erp.inspect_isolated_uat_scenario_deur(jsonb) TO service_role;
COMMIT;
