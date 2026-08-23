BEGIN;
SET LOCAL search_path=erp,auth,extensions,pg_catalog;

INSERT INTO erp.app_permissions(id,code,name)
VALUES('PERM-CANON-COST-CODE-CREATE','cost_code.create','Create Cost Codes')
ON CONFLICT(code) DO NOTHING;

INSERT INTO erp.role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM erp.app_roles r CROSS JOIN erp.app_permissions p
WHERE r.code='system-administrator' AND p.code='cost_code.create'
ON CONFLICT(role_id,permission_id) DO NOTHING;

DELETE FROM erp.role_permissions rp
USING erp.app_permissions p,erp.app_roles r
WHERE rp.permission_id=p.id AND rp.role_id=r.id
  AND p.code='cost_code.create' AND r.code<>'system-administrator';

CREATE FUNCTION erp.command_create_cost_code(command jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,auth,extensions,pg_catalog AS $$
DECLARE
 tenant text=erp.current_company_id(); actor text=auth.uid()::text; now_at timestamptz=clock_timestamp();
 cost_code_id_value text=nullif(btrim(command->>'costCodeId'),''); code_value text=nullif(btrim(command->>'code'),'');
 name_value text=nullif(btrim(command->>'name'),''); sort_order_value integer=0;
 created_cost_code erp.cost_codes; idem jsonb; payload_hash text; response jsonb; violated_constraint text;
BEGIN
 IF auth.uid() IS NULL OR tenant IS NULL OR NOT EXISTS(
  SELECT 1 FROM erp.users u JOIN erp.companies c ON c.id=u.company_id
  WHERE u.id=auth.uid() AND u.status='active' AND u.company_id=tenant AND c.active
 ) THEN RETURN jsonb_build_object('success',false,'code','UNAUTHENTICATED');END IF;
 IF NOT erp.current_user_has_permission('cost_code.create') THEN RETURN jsonb_build_object('success',false,'code','FORBIDDEN');END IF;
 IF EXISTS(SELECT 1 FROM jsonb_object_keys(command) key WHERE key NOT IN('commandId','idempotencyKey','costCodeId','code','name','sortOrder'))
 OR nullif(btrim(command->>'commandId'),'') IS NULL OR nullif(btrim(command->>'idempotencyKey'),'') IS NULL
 OR cost_code_id_value IS NULL OR command->>'costCodeId'<>btrim(command->>'costCodeId')
 OR cost_code_id_value !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
 OR code_value IS NULL OR name_value IS NULL
 OR (command ? 'sortOrder' AND (jsonb_typeof(command->'sortOrder')<>'number' OR command->>'sortOrder' !~ '^-?[0-9]+$'))
 THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED');END IF;
 BEGIN sort_order_value=coalesce((command->>'sortOrder')::integer,0);
 EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED');END;

 idem=erp.begin_operational_command(command,'CREATE_COST_CODE','COST_CODE',cost_code_id_value,tenant,actor);
 IF idem->>'state'='MISMATCH' THEN RETURN jsonb_build_object('success',false,'code','IDEMPOTENCY_MISMATCH');
 ELSIF idem->>'state'='REPLAY' THEN RETURN (idem->'response')||jsonb_build_object('disposition','REPLAYED');
 ELSIF idem->>'state'<>'NEW' THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED');END IF;
 payload_hash=idem->>'payloadHash';

 INSERT INTO erp.cost_codes(id,code,name,active,sort_order,deleted_at,row_version)
 VALUES(cost_code_id_value,code_value,name_value,true,sort_order_value,NULL,1)
 RETURNING * INTO created_cost_code;
 INSERT INTO erp.audit_log(id,company_id,aggregate_type,aggregate_id,action,actor_id,occurred_at,correlation_id,new_values)
 VALUES(gen_random_uuid()::text,tenant,'CostCode',created_cost_code.id,'COST_CODE_CREATED',actor,now_at,command->>'commandId',jsonb_build_object(
  'costCodeId',created_cost_code.id,'code',created_cost_code.code,'name',created_cost_code.name,'active',created_cost_code.active,
  'sortOrder',created_cost_code.sort_order,'rowVersion',created_cost_code.row_version));
 response=jsonb_build_object('success',true,'disposition','ACCEPTED','serverOccurredAt',now_at,'refresh',jsonb_build_array(created_cost_code.id),'value',jsonb_build_object(
  'id',created_cost_code.id,'code',created_cost_code.code,'name',created_cost_code.name,'active',created_cost_code.active,
  'sortOrder',created_cost_code.sort_order,'deletedAt',created_cost_code.deleted_at,'createdAt',created_cost_code.created_at,
  'updatedAt',created_cost_code.updated_at,'rowVersion',created_cost_code.row_version));
 RETURN erp.finish_operational_command(command,'CREATE_COST_CODE','COST_CODE',created_cost_code.id,tenant,actor,payload_hash,response,created_cost_code.row_version);
EXCEPTION WHEN unique_violation THEN
 GET STACKED DIAGNOSTICS violated_constraint=CONSTRAINT_NAME;
 IF violated_constraint='uq_cost_codes_code_active' THEN RETURN jsonb_build_object('success',false,'code','COST_CODE_CONFLICT');
 ELSIF violated_constraint='cost_codes_pkey' THEN RETURN jsonb_build_object('success',false,'code','COST_CODE_ID_CONFLICT');END IF;
 RETURN jsonb_build_object('success',false,'code','PERSISTENCE_FAILURE');
WHEN OTHERS THEN RETURN jsonb_build_object('success',false,'code','PERSISTENCE_FAILURE');END $$;

ALTER FUNCTION erp.command_create_cost_code(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.command_create_cost_code(jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION erp.command_create_cost_code(jsonb) TO authenticated;
REVOKE INSERT,UPDATE,DELETE ON erp.cost_codes FROM PUBLIC,anon,authenticated;

COMMIT;
