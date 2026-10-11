BEGIN;
SET LOCAL search_path=erp,auth,extensions,pg_catalog;

-- These five tables are the existing shared Equipment reference catalog. Keep
-- historical IDs intact and add optimistic versions for controlled maintenance.
ALTER TABLE erp.equipment_brands ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now(), ADD COLUMN row_version bigint NOT NULL DEFAULT 1;
ALTER TABLE erp.equipment_models ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now(), ADD COLUMN row_version bigint NOT NULL DEFAULT 1;
ALTER TABLE erp.equipment_ownerships ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now(), ADD COLUMN row_version bigint NOT NULL DEFAULT 1;
ALTER TABLE erp.equipment_locations ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now(), ADD COLUMN row_version bigint NOT NULL DEFAULT 1;
ALTER TABLE erp.equipment_conditions ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now(), ADD COLUMN row_version bigint NOT NULL DEFAULT 1;

CREATE FUNCTION erp.equipment_reference_table(kind text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path=erp,pg_catalog AS $$
 SELECT CASE kind
  WHEN 'brand' THEN 'equipment_brands' WHEN 'model' THEN 'equipment_models'
  WHEN 'ownership' THEN 'equipment_ownerships' WHEN 'location' THEN 'equipment_locations'
  WHEN 'condition' THEN 'equipment_conditions' END
$$;

CREATE FUNCTION erp.read_equipment_reference_master(kind text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=erp,auth,pg_catalog AS $$
DECLARE tenant text=erp.current_company_id(); table_name text=erp.equipment_reference_table(kind); rows jsonb;
BEGIN
 IF auth.uid() IS NULL OR tenant IS NULL OR NOT EXISTS(
  SELECT 1 FROM erp.users u JOIN erp.companies c ON c.id=u.company_id
  WHERE u.id=auth.uid() AND u.status='active' AND u.company_id=tenant AND c.active
 ) THEN RETURN jsonb_build_object('success',false,'code','UNAUTHENTICATED'); END IF;
 IF NOT erp.current_user_has_permission('masterData.read') THEN RETURN jsonb_build_object('success',false,'code','FORBIDDEN'); END IF;
 IF table_name IS NULL THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;
 EXECUTE format('SELECT coalesce(jsonb_agg(jsonb_build_object(''id'',id,''code'',code,''name'',name,''description'',description,''active'',active,''rowVersion'',row_version) ORDER BY lower(name),id),''[]''::jsonb) FROM erp.%I WHERE deleted_at IS NULL',table_name) INTO rows;
 RETURN jsonb_build_object('success',true,'items',rows);
END $$;

CREATE FUNCTION erp.command_save_equipment_reference_master(command jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,auth,extensions,pg_catalog AS $$
DECLARE tenant text=erp.current_company_id(); actor text=auth.uid()::text; kind text=command->>'kind'; table_name text=erp.equipment_reference_table(kind);
 operation text=command->>'operation'; target_id text=nullif(btrim(command->>'id'),''); name_value text=nullif(btrim(command->>'name'),'');
 code_value text=nullif(btrim(command->>'code'),''); description_value text=nullif(btrim(command->>'description'),''); expected_version bigint;
 prior jsonb; changed jsonb; duplicate_id text; idem jsonb; payload_hash text; response jsonb; now_at timestamptz=clock_timestamp(); permission_code text;
BEGIN
 IF auth.uid() IS NULL OR tenant IS NULL OR NOT EXISTS(
  SELECT 1 FROM erp.users u JOIN erp.companies c ON c.id=u.company_id
  WHERE u.id=auth.uid() AND u.status='active' AND u.company_id=tenant AND c.active
 ) THEN RETURN jsonb_build_object('success',false,'code','UNAUTHENTICATED'); END IF;
 permission_code=CASE WHEN operation='CREATE' THEN 'masterData.create' ELSE 'masterData.update' END;
 IF NOT erp.current_user_has_permission(permission_code) THEN RETURN jsonb_build_object('success',false,'code','FORBIDDEN'); END IF;
 IF table_name IS NULL OR operation NOT IN ('CREATE','UPDATE','SET_ACTIVE') OR target_id IS NULL
  OR target_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  OR nullif(btrim(command->>'commandId'),'') IS NULL OR nullif(btrim(command->>'idempotencyKey'),'') IS NULL
  OR EXISTS(SELECT 1 FROM jsonb_object_keys(command) key WHERE key NOT IN ('kind','operation','id','name','code','description','active','expectedRowVersion','commandId','idempotencyKey'))
  OR (operation IN ('CREATE','UPDATE') AND (name_value IS NULL OR length(name_value)>160 OR length(coalesce(code_value,''))>70 OR length(coalesce(description_value,''))>500))
  OR (operation='SET_ACTIVE' AND jsonb_typeof(command->'active')<>'boolean')
 THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;
 IF operation<>'CREATE' THEN
  IF jsonb_typeof(command->'expectedRowVersion')<>'number' OR command->>'expectedRowVersion' !~ '^[0-9]+$' THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;
  BEGIN expected_version=(command->>'expectedRowVersion')::bigint; EXCEPTION WHEN numeric_value_out_of_range THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END;
 END IF;
 -- A single transaction serializes normalized names/codes for this shared catalog.
 PERFORM pg_advisory_xact_lock(hashtextextended('EQUIPMENT_REFERENCE_'||kind,0));
 IF operation<>'CREATE' THEN
  EXECUTE format('SELECT to_jsonb(m) FROM erp.%I m WHERE id=$1 AND deleted_at IS NULL FOR UPDATE',table_name) INTO prior USING target_id;
  IF prior IS NULL THEN RETURN jsonb_build_object('success',false,'code','NOT_FOUND'); END IF;
  IF (prior->>'row_version')::bigint<>expected_version THEN RETURN jsonb_build_object('success',false,'code','CONFLICT'); END IF;
 END IF;
 IF operation IN ('CREATE','UPDATE') THEN
  EXECUTE format('SELECT id FROM erp.%I WHERE deleted_at IS NULL AND id<>$1 AND (lower(name)=lower($2) OR ($3 IS NOT NULL AND code IS NOT NULL AND upper(code)=upper($3))) LIMIT 1',table_name)
   INTO duplicate_id USING target_id,name_value,code_value;
  IF duplicate_id IS NOT NULL THEN RETURN jsonb_build_object('success',false,'code','REFERENCE_CONFLICT'); END IF;
 END IF;
 idem=erp.begin_operational_command(command,operation||'_EQUIPMENT_REFERENCE_'||upper(kind),'EquipmentReference',target_id,tenant,actor);
 IF idem->>'state'='MISMATCH' THEN RETURN jsonb_build_object('success',false,'code','IDEMPOTENCY_MISMATCH');
 ELSIF idem->>'state'='REPLAY' THEN RETURN (idem->'response')||jsonb_build_object('disposition','REPLAYED');
 ELSIF idem->>'state'<>'NEW' THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;
 payload_hash=idem->>'payloadHash';
 IF operation='CREATE' THEN
  EXECUTE format('INSERT INTO erp.%I(id,code,name,description,active) VALUES($1,$2,$3,$4,true) RETURNING to_jsonb(%I.*)',table_name,table_name)
   INTO changed USING target_id,code_value,name_value,description_value;
 ELSIF operation='UPDATE' THEN
  EXECUTE format('UPDATE erp.%I SET code=$2,name=$3,description=$4,updated_at=$5,row_version=row_version+1 WHERE id=$1 RETURNING to_jsonb(%I.*)',table_name,table_name)
   INTO changed USING target_id,code_value,name_value,description_value,now_at;
 ELSE
  EXECUTE format('UPDATE erp.%I SET active=$2,updated_at=$3,row_version=row_version+1 WHERE id=$1 RETURNING to_jsonb(%I.*)',table_name,table_name)
   INTO changed USING target_id,(command->>'active')::boolean,now_at;
 END IF;
 INSERT INTO erp.audit_log(id,company_id,aggregate_type,aggregate_id,action,actor_id,occurred_at,correlation_id,previous_values,new_values)
 VALUES(extensions.gen_random_uuid()::text,tenant,'EquipmentReference',target_id,operation||'_EQUIPMENT_REFERENCE_'||upper(kind),actor,now_at,command->>'commandId',prior,changed);
 response=jsonb_build_object('success',true,'disposition','ACCEPTED','value',jsonb_build_object('id',changed->>'id','code',changed->>'code','name',changed->>'name','description',changed->>'description','active',(changed->>'active')::boolean,'rowVersion',(changed->>'row_version')::bigint));
 RETURN erp.finish_operational_command(command,operation||'_EQUIPMENT_REFERENCE_'||upper(kind),'EquipmentReference',target_id,tenant,actor,payload_hash,response,(changed->>'row_version')::bigint);
EXCEPTION WHEN unique_violation THEN RETURN jsonb_build_object('success',false,'code','REFERENCE_CONFLICT');
END $$;

ALTER FUNCTION erp.read_equipment_reference_master(text) OWNER TO postgres;
ALTER FUNCTION erp.command_save_equipment_reference_master(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.read_equipment_reference_master(text),erp.command_save_equipment_reference_master(jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION erp.read_equipment_reference_master(text),erp.command_save_equipment_reference_master(jsonb) TO authenticated;
REVOKE INSERT,UPDATE,DELETE ON erp.equipment_brands,erp.equipment_models,erp.equipment_ownerships,erp.equipment_locations,erp.equipment_conditions FROM PUBLIC,anon,authenticated;
COMMIT;
