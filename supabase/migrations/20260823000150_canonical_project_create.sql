BEGIN;
SET LOCAL search_path=erp,auth,extensions,pg_catalog;

INSERT INTO erp.app_permissions(id,code,name)
VALUES('PERM-CANON-PROJECT-MANAGE','project.manage','Manage Projects')
ON CONFLICT(code) DO NOTHING;

INSERT INTO erp.role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM erp.app_roles r CROSS JOIN erp.app_permissions p
WHERE r.code='system-administrator' AND p.code='project.manage'
ON CONFLICT(role_id,permission_id) DO NOTHING;

CREATE FUNCTION erp.command_create_project(command jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,auth,extensions,pg_catalog AS $$
DECLARE
 tenant text=erp.current_company_id(); actor text=auth.uid()::text; now_at timestamptz=clock_timestamp();
 project_code_value text=nullif(btrim(command->>'projectCode'),''); project_name_value text=nullif(btrim(command->>'name'),'');
 customer_id_value text=nullif(btrim(command->>'customerId'),''); location_value text=nullif(btrim(command->>'location'),'');
 target_customer erp.customers; created_project erp.projects; idem jsonb; payload_hash text; response jsonb; violated_constraint text;
BEGIN
 IF auth.uid() IS NULL OR tenant IS NULL OR NOT EXISTS(
  SELECT 1 FROM erp.users u JOIN erp.companies c ON c.id=u.company_id
  WHERE u.id=auth.uid() AND u.status='active' AND u.company_id=tenant AND c.active
 ) THEN RETURN jsonb_build_object('success',false,'code','UNAUTHENTICATED');END IF;
 IF NOT erp.current_user_has_permission('project.manage') THEN RETURN jsonb_build_object('success',false,'code','FORBIDDEN');END IF;
 IF command ?| ARRAY['companyId','company_id','tenantId','tenant_id','actor','actorId','actor_id','userId','user_id','createdBy','created_by','updatedBy','updated_by','active','deletedAt','deleted_at','rowVersion','row_version','status','projectManager','client','legacyPayload','legacy_payload']
 OR nullif(btrim(command->>'commandId'),'') IS NULL OR nullif(btrim(command->>'idempotencyKey'),'') IS NULL
 OR nullif(btrim(command->>'projectId'),'') IS NULL OR command->>'projectId'<>btrim(command->>'projectId')
 OR command->>'projectId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
 OR project_code_value IS NULL OR project_name_value IS NULL
 THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED');END IF;

 idem=erp.begin_operational_command(command,'CREATE_PROJECT','PROJECT',command->>'projectId',tenant,actor);
 IF idem->>'state'='MISMATCH' THEN RETURN jsonb_build_object('success',false,'code','IDEMPOTENCY_MISMATCH');
 ELSIF idem->>'state'='REPLAY' THEN RETURN (idem->'response')||jsonb_build_object('disposition','REPLAYED');
 ELSIF idem->>'state'<>'NEW' THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED');END IF;
 payload_hash=idem->>'payloadHash';

 IF customer_id_value IS NOT NULL THEN
  SELECT * INTO target_customer FROM erp.customers WHERE id=customer_id_value AND company_id=tenant;
  IF target_customer.id IS NULL OR NOT target_customer.active OR target_customer.deleted_at IS NOT NULL
  THEN RETURN jsonb_build_object('success',false,'code','CUSTOMER_INVALID');END IF;
 END IF;

 INSERT INTO erp.projects(id,project_code,name,customer_id,location,active,deleted_at,created_by,updated_by,company_id)
 VALUES(command->>'projectId',project_code_value,project_name_value,target_customer.id,location_value,true,NULL,actor,actor,tenant)
 RETURNING * INTO created_project;
 INSERT INTO erp.audit_log(id,company_id,aggregate_type,aggregate_id,action,actor_id,occurred_at,correlation_id,new_values)
 VALUES(gen_random_uuid()::text,tenant,'Project',created_project.id,'PROJECT_CREATED',actor,now_at,command->>'commandId',jsonb_strip_nulls(jsonb_build_object('projectCode',created_project.project_code,'name',created_project.name,'customerId',created_project.customer_id,'location',created_project.location,'active',created_project.active)));
 response=jsonb_build_object('success',true,'disposition','ACCEPTED','serverOccurredAt',now_at,'refresh',jsonb_build_array(created_project.id),'value',jsonb_build_object(
  'id',created_project.id,'companyId',created_project.company_id,'projectCode',created_project.project_code,'name',created_project.name,
  'customerId',created_project.customer_id,'location',created_project.location,'active',created_project.active,'deletedAt',created_project.deleted_at,
  'createdAt',created_project.created_at,'updatedAt',created_project.updated_at,'rowVersion',created_project.row_version));
 RETURN erp.finish_operational_command(command,'CREATE_PROJECT','PROJECT',created_project.id,tenant,actor,payload_hash,response,created_project.row_version);
EXCEPTION WHEN unique_violation THEN
 GET STACKED DIAGNOSTICS violated_constraint=CONSTRAINT_NAME;
 IF violated_constraint='uq_projects_code_active' THEN RETURN jsonb_build_object('success',false,'code','PROJECT_CODE_CONFLICT');
 ELSIF violated_constraint='projects_pkey' THEN RETURN jsonb_build_object('success',false,'code','CONFLICT');END IF;
 RETURN jsonb_build_object('success',false,'code','PERSISTENCE_FAILURE');
WHEN OTHERS THEN RETURN jsonb_build_object('success',false,'code','PERSISTENCE_FAILURE');END $$;

ALTER FUNCTION erp.command_create_project(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.command_create_project(jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION erp.command_create_project(jsonb) TO authenticated;
REVOKE INSERT,UPDATE,DELETE ON erp.projects FROM PUBLIC,anon,authenticated;

COMMIT;
