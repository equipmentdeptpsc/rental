BEGIN;
SET LOCAL search_path=erp,auth,extensions,pg_catalog;

INSERT INTO erp.app_permissions(id,code,name)
VALUES('PERM-CANON-WORK-DESCRIPTION-CREATE','work_description.create','Create Work Descriptions')
ON CONFLICT(code) DO NOTHING;

INSERT INTO erp.role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM erp.app_roles r CROSS JOIN erp.app_permissions p
WHERE r.code='system-administrator' AND p.code='work_description.create'
ON CONFLICT(role_id,permission_id) DO NOTHING;

DELETE FROM erp.role_permissions rp
USING erp.app_permissions p,erp.app_roles r
WHERE rp.permission_id=p.id AND rp.role_id=r.id
 AND p.code='work_description.create' AND r.code<>'system-administrator';

CREATE UNIQUE INDEX uq_work_descriptions_code_active
 ON erp.work_descriptions(lower(regexp_replace(btrim(code),'[[:space:]]+',' ','g')))
 WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX uq_work_descriptions_name_active
 ON erp.work_descriptions(lower(regexp_replace(btrim(name),'[[:space:]]+',' ','g')))
 WHERE deleted_at IS NULL;

CREATE FUNCTION erp.command_create_work_description(command jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,auth,extensions,pg_catalog AS $$
DECLARE
 tenant text=erp.current_company_id(); actor text=auth.uid()::text; now_at timestamptz=clock_timestamp();
 work_description_id_value text=nullif(btrim(command->>'workDescriptionId'),'');
 code_value text=nullif(regexp_replace(btrim(command->>'code'),'[[:space:]]+',' ','g'),'');
 name_value text=nullif(regexp_replace(btrim(command->>'name'),'[[:space:]]+',' ','g'),'');
 requires_remarks_value boolean=false; sort_order_value integer=0;
 created_work_description erp.work_descriptions; idem jsonb; payload_hash text; response jsonb; violated_constraint text;
BEGIN
 IF auth.uid() IS NULL OR tenant IS NULL OR NOT EXISTS(
  SELECT 1 FROM erp.users u JOIN erp.companies c ON c.id=u.company_id
  WHERE u.id=auth.uid() AND u.status='active' AND u.company_id=tenant AND c.active
 ) THEN RETURN jsonb_build_object('success',false,'code','UNAUTHENTICATED');END IF;
 IF NOT erp.current_user_has_permission('work_description.create') THEN RETURN jsonb_build_object('success',false,'code','FORBIDDEN');END IF;
 IF EXISTS(SELECT 1 FROM jsonb_object_keys(command) key WHERE key NOT IN('commandId','idempotencyKey','workDescriptionId','code','name','requiresRemarks','sortOrder'))
 OR nullif(btrim(command->>'commandId'),'') IS NULL OR nullif(btrim(command->>'idempotencyKey'),'') IS NULL
 OR work_description_id_value IS NULL OR command->>'workDescriptionId'<>btrim(command->>'workDescriptionId')
 OR work_description_id_value !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
 OR code_value IS NULL OR name_value IS NULL
 OR (command ? 'requiresRemarks' AND jsonb_typeof(command->'requiresRemarks')<>'boolean')
 OR (command ? 'sortOrder' AND (jsonb_typeof(command->'sortOrder')<>'number' OR command->>'sortOrder' !~ '^-?[0-9]+$'))
 THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED');END IF;
 BEGIN
  requires_remarks_value=coalesce((command->>'requiresRemarks')::boolean,false);
  sort_order_value=coalesce((command->>'sortOrder')::integer,0);
 EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED');END;

 idem=erp.begin_operational_command(command,'CREATE_WORK_DESCRIPTION','WORK_DESCRIPTION',work_description_id_value,tenant,actor);
 IF idem->>'state'='MISMATCH' THEN RETURN jsonb_build_object('success',false,'code','IDEMPOTENCY_MISMATCH');
 ELSIF idem->>'state'='REPLAY' THEN RETURN (idem->'response')||jsonb_build_object('disposition','REPLAYED');
 ELSIF idem->>'state'<>'NEW' THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED');END IF;
 payload_hash=idem->>'payloadHash';

 INSERT INTO erp.work_descriptions(id,code,name,requires_remarks,active,sort_order,deleted_at,row_version)
 VALUES(work_description_id_value,code_value,name_value,requires_remarks_value,true,sort_order_value,NULL,1)
 RETURNING * INTO created_work_description;
 INSERT INTO erp.audit_log(id,company_id,aggregate_type,aggregate_id,action,actor_id,occurred_at,correlation_id,new_values)
 VALUES(gen_random_uuid()::text,tenant,'WorkDescription',created_work_description.id,'WORK_DESCRIPTION_CREATED',actor,now_at,command->>'commandId',jsonb_build_object(
  'workDescriptionId',created_work_description.id,'code',created_work_description.code,'name',created_work_description.name,
  'requiresRemarks',created_work_description.requires_remarks,'active',created_work_description.active,'sortOrder',created_work_description.sort_order,
  'rowVersion',created_work_description.row_version));
 response=jsonb_build_object('success',true,'disposition','ACCEPTED','serverOccurredAt',now_at,'refresh',jsonb_build_array(created_work_description.id),'value',jsonb_build_object(
  'id',created_work_description.id,'code',created_work_description.code,'name',created_work_description.name,
  'requiresRemarks',created_work_description.requires_remarks,'active',created_work_description.active,'sortOrder',created_work_description.sort_order,
  'deletedAt',created_work_description.deleted_at,'createdAt',created_work_description.created_at,'updatedAt',created_work_description.updated_at,
  'rowVersion',created_work_description.row_version));
 RETURN erp.finish_operational_command(command,'CREATE_WORK_DESCRIPTION','WORK_DESCRIPTION',created_work_description.id,tenant,actor,payload_hash,response,created_work_description.row_version);
EXCEPTION WHEN unique_violation THEN
 GET STACKED DIAGNOSTICS violated_constraint=CONSTRAINT_NAME;
 IF violated_constraint='uq_work_descriptions_code_active' THEN RETURN jsonb_build_object('success',false,'code','WORK_DESCRIPTION_CODE_CONFLICT');
 ELSIF violated_constraint='uq_work_descriptions_name_active' THEN RETURN jsonb_build_object('success',false,'code','WORK_DESCRIPTION_NAME_CONFLICT');
 ELSIF violated_constraint='work_descriptions_pkey' THEN RETURN jsonb_build_object('success',false,'code','WORK_DESCRIPTION_ID_CONFLICT');END IF;
 RETURN jsonb_build_object('success',false,'code','PERSISTENCE_FAILURE');
WHEN OTHERS THEN RETURN jsonb_build_object('success',false,'code','PERSISTENCE_FAILURE');END $$;

ALTER FUNCTION erp.command_create_work_description(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.command_create_work_description(jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION erp.command_create_work_description(jsonb) TO authenticated;
REVOKE INSERT,UPDATE,DELETE ON erp.work_descriptions FROM PUBLIC,anon,authenticated;

COMMIT;
