BEGIN;
SET LOCAL search_path=erp,auth,extensions,pg_catalog;

CREATE OR REPLACE FUNCTION erp.repair_uat_deur_turnover_assignment_activity(command jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,auth,extensions,pg_catalog AS $$
DECLARE tenant text:=trim(command->>'companyId'); skey text:=trim(command->>'scenarioKey'); profile text:=trim(command->>'profileVersion'); a erp.assignments; activity erp.activity_codes; aid text:=trim(command->>'assignmentId');
BEGIN
 IF tenant<>'TENANT-LOCAL-001' OR skey<>'DEUR-TURNOVER-RUNTIME-CERT-2026-08-31' OR profile<>'UAT_DEUR_TURNOVER_RUNTIME_V1' THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;
 SELECT * INTO a FROM erp.assignments WHERE id=aid AND company_id=tenant FOR UPDATE;
 IF a.id IS NULL THEN RETURN jsonb_build_object('success',false,'code','ASSIGNMENT_NOT_FOUND'); END IF;
 IF a.project_id<>trim(command->>'projectId') OR a.operator_id<>trim(command->>'operatorId') OR a.equipment_id<>trim(command->>'equipmentId') OR a.status<>'Active' OR a.activity_code_id IS NOT NULL THEN RETURN jsonb_build_object('success',false,'code','ASSIGNMENT_RESIDUE_CONFLICT'); END IF;
 SELECT * INTO activity FROM erp.activity_codes WHERE id=trim(command->>'activityCodeId') AND active AND deleted_at IS NULL;
 IF activity.id IS NULL THEN RETURN jsonb_build_object('success',false,'code','ACTIVITY_CODE_NOT_FOUND'); END IF;
 UPDATE erp.assignments SET activity_code_id=activity.id,updated_at=clock_timestamp(),updated_by=auth.uid()::text WHERE id=a.id AND company_id=tenant;
 INSERT INTO erp.audit_log(id,company_id,aggregate_type,aggregate_id,action,actor_id,occurred_at,new_values,metadata) VALUES(extensions.gen_random_uuid()::text,tenant,'Assignment',a.id,'UAT_TURNOVER_ASSIGNMENT_REPAIRED',auth.uid()::text,clock_timestamp(),jsonb_build_object('activityCodeId',activity.id),jsonb_build_object('scenarioKey',skey,'profileVersion',profile,'repair','activity_code_link_only'));
 RETURN jsonb_build_object('success',true,'assignmentId',a.id,'activityCodeId',activity.id,'repaired',true);
END $$;

ALTER FUNCTION erp.repair_uat_deur_turnover_assignment_activity(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.repair_uat_deur_turnover_assignment_activity(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION erp.repair_uat_deur_turnover_assignment_activity(jsonb) TO service_role;
COMMIT;
