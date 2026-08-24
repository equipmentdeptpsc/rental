BEGIN;
SET LOCAL search_path=erp,auth,extensions,pg_catalog;

ALTER TABLE erp.assignments ALTER COLUMN expected_return DROP NOT NULL;

CREATE OR REPLACE FUNCTION erp.command_create_assignment(command jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,auth,extensions,pg_catalog AS $$
DECLARE
 tenant text=erp.current_company_id(); actor text=auth.uid()::text; now_at timestamptz=clock_timestamp();
 assigned_on date; expected_on date; target_equipment erp.equipment; target_operator erp.operators;
 target_project erp.projects; target_activity erp.activity_codes; created_assignment erp.assignments;
 idem jsonb; payload_hash text; response jsonb; violated_constraint text;
BEGIN
 IF auth.uid() IS NULL OR tenant IS NULL OR NOT EXISTS(
  SELECT 1 FROM erp.users u JOIN erp.companies c ON c.id=u.company_id
  WHERE u.id=auth.uid() AND u.status='active' AND u.company_id=tenant AND c.active
 ) THEN RETURN jsonb_build_object('success',false,'code','UNAUTHENTICATED');END IF;
 IF NOT erp.current_user_has_permission('assignment.manage') THEN RETURN jsonb_build_object('success',false,'code','FORBIDDEN');END IF;
 IF command ?| ARRAY['companyId','company_id','tenantId','tenant_id','actor','actorId','actor_id','userId','user_id','status','rowVersion']
 OR nullif(btrim(command->>'commandId'),'') IS NULL OR nullif(btrim(command->>'idempotencyKey'),'') IS NULL
 OR nullif(btrim(command->>'assignmentId'),'') IS NULL OR command->>'assignmentId'<>btrim(command->>'assignmentId')
 OR command->>'assignmentId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
 OR nullif(btrim(command->>'equipmentId'),'') IS NULL OR nullif(btrim(command->>'operatorId'),'') IS NULL
 OR nullif(btrim(command->>'projectId'),'') IS NULL OR nullif(btrim(command->>'assignedDate'),'') IS NULL
 THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED');END IF;
 BEGIN
  assigned_on=(command->>'assignedDate')::date;
  expected_on=nullif(command->>'expectedReturn','')::date;
 EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
  RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED');
 END;
 IF expected_on IS NOT NULL AND expected_on<assigned_on THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED');END IF;

 idem=erp.begin_operational_command(command,'CREATE_ASSIGNMENT','ASSIGNMENT',command->>'assignmentId',tenant,actor);
 IF idem->>'state'='MISMATCH' THEN RETURN jsonb_build_object('success',false,'code','IDEMPOTENCY_MISMATCH');
 ELSIF idem->>'state'='REPLAY' THEN RETURN (idem->'response')||jsonb_build_object('disposition','REPLAYED');
 ELSIF idem->>'state'<>'NEW' THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED');END IF;
 payload_hash=idem->>'payloadHash';

 SELECT * INTO target_equipment FROM erp.equipment
 WHERE id=command->>'equipmentId' AND company_id=tenant FOR UPDATE;
 SELECT * INTO target_operator FROM erp.operators
 WHERE id=command->>'operatorId' AND company_id=tenant FOR UPDATE;
 SELECT * INTO target_project FROM erp.projects
 WHERE id=command->>'projectId' AND company_id=tenant;
 IF target_equipment.id IS NULL OR NOT target_equipment.active OR target_equipment.deleted_at IS NOT NULL
 THEN RETURN jsonb_build_object('success',false,'code','NOT_FOUND');END IF;
 IF NOT EXISTS(SELECT 1 FROM erp.equipment_statuses s WHERE s.id=target_equipment.status_id AND lower(s.code)='available' AND s.active AND s.deleted_at IS NULL)
 THEN RETURN jsonb_build_object('success',false,'code','EQUIPMENT_UNAVAILABLE');END IF;
 IF target_operator.id IS NULL OR target_operator.status<>'Active' OR target_operator.deleted_at IS NOT NULL
 THEN RETURN jsonb_build_object('success',false,'code','NOT_FOUND');END IF;
 IF target_project.id IS NULL OR NOT target_project.active OR target_project.deleted_at IS NOT NULL
 THEN RETURN jsonb_build_object('success',false,'code','NOT_FOUND');END IF;
 IF nullif(btrim(command->>'activityCodeId'),'') IS NOT NULL THEN
  SELECT * INTO target_activity FROM erp.activity_codes WHERE id=command->>'activityCodeId' AND active AND deleted_at IS NULL;
  IF target_activity.id IS NULL THEN RETURN jsonb_build_object('success',false,'code','NOT_FOUND');END IF;
 END IF;
 IF EXISTS(SELECT 1 FROM erp.assignments WHERE company_id=tenant AND id=command->>'assignmentId')
 THEN RETURN jsonb_build_object('success',false,'code','CONFLICT');END IF;
 IF EXISTS(SELECT 1 FROM erp.assignments WHERE company_id=tenant AND equipment_id=target_equipment.id AND status='Active' AND deleted_at IS NULL)
 THEN RETURN jsonb_build_object('success',false,'code','EQUIPMENT_UNAVAILABLE');END IF;
 IF EXISTS(SELECT 1 FROM erp.assignments WHERE company_id=tenant AND operator_id=target_operator.id AND status='Active' AND deleted_at IS NULL)
 THEN RETURN jsonb_build_object('success',false,'code','CONFLICT');END IF;

 INSERT INTO erp.assignments(id,equipment_id,operator_id,project_id,activity_code_id,assigned_date,expected_return,remarks,status,created_by,updated_by,company_id)
 VALUES(command->>'assignmentId',target_equipment.id,target_operator.id,target_project.id,target_activity.id,assigned_on,expected_on,coalesce(command->>'remarks',''),'Active',actor,actor,tenant)
 RETURNING * INTO created_assignment;
 UPDATE erp.equipment SET status_id=(SELECT id FROM erp.equipment_statuses WHERE lower(code)='assigned' AND active AND deleted_at IS NULL ORDER BY sort_order,id LIMIT 1),project_id=target_project.id,operator_id=target_operator.id,updated_by=actor
 WHERE id=target_equipment.id AND company_id=tenant;
 INSERT INTO erp.audit_log(id,company_id,aggregate_type,aggregate_id,action,actor_id,occurred_at,correlation_id,new_values)
 VALUES(gen_random_uuid()::text,tenant,'Assignment',created_assignment.id,'ASSIGNMENT_CREATED',actor,now_at,command->>'commandId',jsonb_build_object('equipmentId',created_assignment.equipment_id,'operatorId',created_assignment.operator_id,'projectId',created_assignment.project_id,'status','Active'));
 response=jsonb_build_object('success',true,'disposition','ACCEPTED','serverOccurredAt',now_at,'refresh',jsonb_build_array(created_assignment.id,created_assignment.equipment_id),'value',jsonb_build_object(
  'id',created_assignment.id,'companyId',created_assignment.company_id,'equipmentId',created_assignment.equipment_id,'operatorId',created_assignment.operator_id,'projectId',created_assignment.project_id,
  'activityCodeId',created_assignment.activity_code_id,'assignedDate',created_assignment.assigned_date,'expectedReturn',created_assignment.expected_return,'remarks',created_assignment.remarks,
  'status',created_assignment.status,'createdAt',created_assignment.created_at,'updatedAt',created_assignment.updated_at,'rowVersion',created_assignment.row_version));
 RETURN erp.finish_operational_command(command,'CREATE_ASSIGNMENT','ASSIGNMENT',created_assignment.id,tenant,actor,payload_hash,response,created_assignment.row_version);
EXCEPTION WHEN unique_violation THEN
 GET STACKED DIAGNOSTICS violated_constraint=CONSTRAINT_NAME;
 IF violated_constraint='uq_assignment_active_equipment' THEN RETURN jsonb_build_object('success',false,'code','EQUIPMENT_UNAVAILABLE');
 ELSIF violated_constraint='uq_assignment_active_operator' THEN RETURN jsonb_build_object('success',false,'code','CONFLICT');
 ELSIF violated_constraint='assignments_pkey' THEN RETURN jsonb_build_object('success',false,'code','CONFLICT');END IF;
 RETURN jsonb_build_object('success',false,'code','PERSISTENCE_FAILURE');
WHEN OTHERS THEN RETURN jsonb_build_object('success',false,'code','PERSISTENCE_FAILURE');END $$;

ALTER FUNCTION erp.command_create_assignment(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.command_create_assignment(jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION erp.command_create_assignment(jsonb) TO authenticated;
REVOKE INSERT,UPDATE,DELETE ON erp.assignments FROM PUBLIC,anon,authenticated;

COMMIT;
