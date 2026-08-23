BEGIN;
SET LOCAL search_path=erp,auth,extensions,pg_catalog;

INSERT INTO erp.app_permissions(id,code,name)
VALUES('PERM-CANON-EQUIPMENT-CREATE','equipment.create','Create Equipment')
ON CONFLICT(code) DO NOTHING;

INSERT INTO erp.role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM erp.app_roles r CROSS JOIN erp.app_permissions p
WHERE r.code='system-administrator' AND p.code='equipment.create'
ON CONFLICT(role_id,permission_id) DO NOTHING;

DELETE FROM erp.role_permissions rp
USING erp.app_permissions p,erp.app_roles r
WHERE rp.permission_id=p.id AND rp.role_id=r.id AND p.code='equipment.create' AND r.code<>'system-administrator';

CREATE FUNCTION erp.read_canonical_equipment_reference_data() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=erp,auth,pg_catalog AS $$
DECLARE tenant text=erp.current_company_id();
BEGIN
 IF auth.uid() IS NULL OR tenant IS NULL OR NOT EXISTS(
  SELECT 1 FROM erp.users u JOIN erp.companies c ON c.id=u.company_id
  WHERE u.id=auth.uid() AND u.status='active' AND u.company_id=tenant AND c.active
 ) OR NOT erp.current_user_has_permission('equipment.create')
 THEN RETURN jsonb_build_object('success',false,'code','FORBIDDEN');END IF;
 RETURN jsonb_build_object('success',true,'costCodes',(
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',c.id,'code',c.code,'name',c.name,'active',c.active,'sortOrder',c.sort_order) ORDER BY c.sort_order,c.code,c.id),'[]'::jsonb)
  FROM erp.cost_codes c WHERE c.active AND c.deleted_at IS NULL
 ));
END $$;

CREATE FUNCTION erp.command_create_equipment(command jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,auth,extensions,pg_catalog AS $$
DECLARE
 tenant text=erp.current_company_id(); actor text=auth.uid()::text; now_at timestamptz=clock_timestamp();
 asset_number text=nullif(btrim(command->>'assetNo'),''); equipment_name_value text=nullif(btrim(command->>'equipmentName'),'');
 maintenance_type_value text=command->>'maintenanceType'; cost_code_id_value text=nullif(btrim(command->>'costCodeId'),'');
 remarks_value text=nullif(btrim(command->>'remarks'),''); current_reading_value numeric=0;
 available_status_id text; created_equipment erp.equipment; idem jsonb; payload_hash text; response jsonb; violated_constraint text;
BEGIN
 IF auth.uid() IS NULL OR tenant IS NULL OR NOT EXISTS(
  SELECT 1 FROM erp.users u JOIN erp.companies c ON c.id=u.company_id
  WHERE u.id=auth.uid() AND u.status='active' AND u.company_id=tenant AND c.active
 ) THEN RETURN jsonb_build_object('success',false,'code','UNAUTHENTICATED');END IF;
 IF NOT erp.current_user_has_permission('equipment.create') THEN RETURN jsonb_build_object('success',false,'code','FORBIDDEN');END IF;
 IF EXISTS(SELECT 1 FROM jsonb_object_keys(command) key WHERE key NOT IN('commandId','idempotencyKey','equipmentId','assetNo','equipmentName','maintenanceType','costCodeId','currentReading','remarks'))
 OR nullif(btrim(command->>'commandId'),'') IS NULL OR nullif(btrim(command->>'idempotencyKey'),'') IS NULL
 OR nullif(btrim(command->>'equipmentId'),'') IS NULL OR command->>'equipmentId'<>btrim(command->>'equipmentId')
 OR command->>'equipmentId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
 OR asset_number IS NULL OR equipment_name_value IS NULL OR cost_code_id_value IS NULL
 OR maintenance_type_value NOT IN('Engine Hours','Kilometers','Mileage','Calendar Days')
 OR (command ? 'remarks' AND jsonb_typeof(command->'remarks') NOT IN('string','null'))
 OR (command ? 'currentReading' AND jsonb_typeof(command->'currentReading') NOT IN('number','string','null'))
 THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED');END IF;
 BEGIN current_reading_value=coalesce(nullif(btrim(command->>'currentReading'),'')::numeric,0);
 EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED');END;
 IF current_reading_value<0 THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED');END IF;
 IF NOT EXISTS(SELECT 1 FROM erp.cost_codes c WHERE c.id=cost_code_id_value AND c.active AND c.deleted_at IS NULL)
 THEN RETURN jsonb_build_object('success',false,'code','NOT_FOUND');END IF;
 IF (SELECT count(*) FROM erp.equipment_statuses s WHERE upper(btrim(s.code))='AVAILABLE' AND s.active AND s.deleted_at IS NULL)<>1
 THEN RETURN jsonb_build_object('success',false,'code','PERSISTENCE_FAILURE');END IF;
 SELECT s.id INTO available_status_id FROM erp.equipment_statuses s WHERE upper(btrim(s.code))='AVAILABLE' AND s.active AND s.deleted_at IS NULL;

 idem=erp.begin_operational_command(command,'CREATE_EQUIPMENT','EQUIPMENT',command->>'equipmentId',tenant,actor);
 IF idem->>'state'='MISMATCH' THEN RETURN jsonb_build_object('success',false,'code','IDEMPOTENCY_MISMATCH');
 ELSIF idem->>'state'='REPLAY' THEN RETURN (idem->'response')||jsonb_build_object('disposition','REPLAYED');
 ELSIF idem->>'state'<>'NEW' THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED');END IF;
 payload_hash=idem->>'payloadHash';

 INSERT INTO erp.equipment(id,asset_no,equipment_name,maintenance_type,current_reading,remarks,status_id,cost_code_id,active,deleted_at,deleted_by,created_by,updated_by,legacy_payload,project_id,operator_id,company_id)
 VALUES(command->>'equipmentId',asset_number,equipment_name_value,maintenance_type_value,current_reading_value,remarks_value,available_status_id,cost_code_id_value,true,NULL,NULL,actor,actor,'{}'::jsonb,NULL,NULL,tenant)
 RETURNING * INTO created_equipment;
 INSERT INTO erp.audit_log(id,company_id,aggregate_type,aggregate_id,action,actor_id,occurred_at,correlation_id,new_values)
 VALUES(gen_random_uuid()::text,tenant,'Equipment',created_equipment.id,'EQUIPMENT_CREATED',actor,now_at,command->>'commandId',jsonb_strip_nulls(jsonb_build_object('equipmentId',created_equipment.id,'assetNo',created_equipment.asset_no,'equipmentName',created_equipment.equipment_name,'costCodeId',created_equipment.cost_code_id,'maintenanceType',created_equipment.maintenance_type,'currentReading',created_equipment.current_reading,'statusId',created_equipment.status_id)));
 response=jsonb_build_object('success',true,'disposition','ACCEPTED','serverOccurredAt',now_at,'refresh',jsonb_build_array(created_equipment.id),'value',jsonb_build_object(
  'id',created_equipment.id,'companyId',created_equipment.company_id,'assetNo',created_equipment.asset_no,'equipmentName',created_equipment.equipment_name,
  'maintenanceType',created_equipment.maintenance_type,'costCodeId',created_equipment.cost_code_id,'currentReading',created_equipment.current_reading,
  'remarks',created_equipment.remarks,'statusId',created_equipment.status_id,'active',created_equipment.active,'deletedAt',created_equipment.deleted_at,
  'projectId',created_equipment.project_id,'operatorId',created_equipment.operator_id,'createdAt',created_equipment.created_at,'updatedAt',created_equipment.updated_at,'rowVersion',created_equipment.row_version));
 RETURN erp.finish_operational_command(command,'CREATE_EQUIPMENT','EQUIPMENT',created_equipment.id,tenant,actor,payload_hash,response,created_equipment.row_version);
EXCEPTION WHEN unique_violation THEN
 GET STACKED DIAGNOSTICS violated_constraint=CONSTRAINT_NAME;
 IF violated_constraint='uq_equipment_asset_no_active' THEN RETURN jsonb_build_object('success',false,'code','ASSET_NUMBER_CONFLICT');
 ELSIF violated_constraint='equipment_pkey' OR violated_constraint='uq_equipment_company_id' THEN RETURN jsonb_build_object('success',false,'code','EQUIPMENT_ID_CONFLICT');END IF;
 RETURN jsonb_build_object('success',false,'code','PERSISTENCE_FAILURE');
WHEN OTHERS THEN RETURN jsonb_build_object('success',false,'code','PERSISTENCE_FAILURE');END $$;

ALTER FUNCTION erp.read_canonical_equipment_reference_data() OWNER TO postgres;
ALTER FUNCTION erp.command_create_equipment(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.read_canonical_equipment_reference_data(),erp.command_create_equipment(jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION erp.read_canonical_equipment_reference_data(),erp.command_create_equipment(jsonb) TO authenticated;
REVOKE INSERT,UPDATE,DELETE ON erp.equipment FROM PUBLIC,anon,authenticated;

COMMIT;
