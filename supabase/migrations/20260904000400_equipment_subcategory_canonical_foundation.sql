BEGIN;
SET LOCAL search_path=erp,auth,extensions,pg_catalog;

-- Equipment categories are existing global reference data.  Sub-categories are
-- tenant-owned, while category_id remains a reference to that global catalog.
CREATE TABLE erp.equipment_subcategories (
  id uuid PRIMARY KEY,
  company_id text NOT NULL REFERENCES erp.companies(id) ON DELETE RESTRICT,
  category_id text NOT NULL REFERENCES erp.equipment_categories(id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (name=btrim(name) AND name<>''),
  code text CHECK (code IS NULL OR (code=btrim(code) AND code<>'')),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  created_by text,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_by text,
  row_version bigint NOT NULL DEFAULT 1 CHECK (row_version>0),
  UNIQUE(company_id,id)
);
CREATE UNIQUE INDEX uq_equipment_subcategories_company_category_name_normalized
  ON erp.equipment_subcategories(company_id,category_id,lower(name));
CREATE UNIQUE INDEX uq_equipment_subcategories_company_category_code_normalized
  ON erp.equipment_subcategories(company_id,category_id,upper(code)) WHERE code IS NOT NULL;

ALTER TABLE erp.equipment ADD COLUMN subcategory_id uuid;
ALTER TABLE erp.equipment ADD CONSTRAINT fk_equipment_subcategory_company
  FOREIGN KEY(company_id,subcategory_id) REFERENCES erp.equipment_subcategories(company_id,id) NOT VALID;
ALTER TABLE erp.equipment VALIDATE CONSTRAINT fk_equipment_subcategory_company;

CREATE OR REPLACE VIEW erp.equipment_read_model WITH (security_invoker=true) AS
SELECT e.*,s.name AS subcategory_name,s.active AS subcategory_active
FROM erp.equipment e
LEFT JOIN erp.equipment_subcategories s ON s.id=e.subcategory_id AND s.company_id=e.company_id;
GRANT SELECT ON erp.equipment_read_model TO authenticated;

CREATE OR REPLACE FUNCTION erp.validate_equipment_subcategory_reference() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,auth,extensions,pg_catalog AS $$
BEGIN
  IF NEW.subcategory_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.category_id IS NULL OR NOT EXISTS(
    SELECT 1 FROM erp.equipment_subcategories s
    WHERE s.id=NEW.subcategory_id AND s.company_id=NEW.company_id AND s.category_id=NEW.category_id
  ) THEN RAISE EXCEPTION 'EQUIPMENT_SUBCATEGORY_CATEGORY_MISMATCH'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER equipment_subcategory_reference_guard
  BEFORE INSERT OR UPDATE OF company_id,category_id,subcategory_id ON erp.equipment
  FOR EACH ROW EXECUTE FUNCTION erp.validate_equipment_subcategory_reference();
CREATE TRIGGER equipment_subcategories_set_updated BEFORE UPDATE ON erp.equipment_subcategories
  FOR EACH ROW EXECUTE FUNCTION erp.set_updated_at_and_version();

CREATE OR REPLACE FUNCTION erp.require_equipment_subcategory_actor(required_permission text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,auth,extensions,pg_catalog AS $$
DECLARE tenant text=erp.current_company_id();
BEGIN
  IF auth.uid() IS NULL OR tenant IS NULL OR NOT EXISTS(
    SELECT 1 FROM erp.users u JOIN erp.companies c ON c.id=u.company_id
    WHERE u.id=auth.uid() AND u.status='active' AND u.company_id=tenant AND c.active
  ) THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  IF NOT erp.current_user_has_permission(required_permission) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  RETURN tenant;
END $$;

CREATE OR REPLACE FUNCTION erp.list_equipment_subcategories(target_category_id text DEFAULT NULL, include_inactive boolean DEFAULT false)
RETURNS TABLE(id uuid,category_id text,name text,code text,active boolean,usage_count bigint,updated_at timestamptz,row_version bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,auth,extensions,pg_catalog AS $$
DECLARE tenant text;
BEGIN
  tenant=erp.require_equipment_subcategory_actor('masterData.read');
  RETURN QUERY SELECT s.id,s.category_id,s.name,s.code,s.active,count(e.id),s.updated_at,s.row_version
  FROM erp.equipment_subcategories s LEFT JOIN erp.equipment e ON e.subcategory_id=s.id AND e.company_id=s.company_id AND e.deleted_at IS NULL
  WHERE s.company_id=tenant AND (target_category_id IS NULL OR s.category_id=target_category_id) AND (include_inactive OR s.active)
  GROUP BY s.id,s.category_id,s.name,s.code,s.active,s.updated_at,s.row_version ORDER BY lower(s.name),s.id;
END $$;

CREATE OR REPLACE FUNCTION erp.list_assignable_equipment_subcategories(target_category_id text)
RETURNS TABLE(id uuid,category_id text,name text,code text,active boolean,row_version bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,auth,extensions,pg_catalog AS $$
DECLARE tenant text;
BEGIN
  tenant=erp.require_equipment_subcategory_actor('equipment.create');
  IF target_category_id IS NULL OR NOT EXISTS(SELECT 1 FROM erp.equipment_categories c WHERE c.id=target_category_id AND c.active AND c.deleted_at IS NULL) THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  RETURN QUERY SELECT s.id,s.category_id,s.name,s.code,s.active,s.row_version FROM erp.equipment_subcategories s
  WHERE s.company_id=tenant AND s.category_id=target_category_id AND s.active ORDER BY lower(s.name),s.id;
END $$;

CREATE OR REPLACE FUNCTION erp.command_create_equipment_subcategory(command jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,auth,extensions,pg_catalog AS $$
DECLARE tenant text; actor text=auth.uid()::text; now_at timestamptz=clock_timestamp(); subcategory_id uuid; category text=nullif(btrim(command->>'categoryId'),''); subcategory_name text=nullif(btrim(command->>'name'),''); subcategory_code text=nullif(btrim(command->>'code'),''); created erp.equipment_subcategories; idem jsonb; payload_hash text; response jsonb; constraint_name text;
BEGIN
  tenant=erp.require_equipment_subcategory_actor('masterData.create');
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(command) key WHERE key NOT IN('commandId','idempotencyKey','equipmentSubcategoryId','categoryId','name','code'))
    OR nullif(btrim(command->>'commandId'),'') IS NULL OR nullif(btrim(command->>'idempotencyKey'),'') IS NULL OR category IS NULL OR subcategory_name IS NULL THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;
  BEGIN subcategory_id=(command->>'equipmentSubcategoryId')::uuid; EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END;
  IF NOT EXISTS(SELECT 1 FROM erp.equipment_categories c WHERE c.id=category AND c.active AND c.deleted_at IS NULL) THEN RETURN jsonb_build_object('success',false,'code','NOT_FOUND'); END IF;
  idem=erp.begin_operational_command(command,'CREATE_EQUIPMENT_SUBCATEGORY','EquipmentSubcategory',subcategory_id::text,tenant,actor);
  IF idem->>'state'='MISMATCH' THEN RETURN jsonb_build_object('success',false,'code','IDEMPOTENCY_MISMATCH'); ELSIF idem->>'state'='REPLAY' THEN RETURN (idem->'response')||jsonb_build_object('disposition','REPLAYED'); ELSIF idem->>'state'<>'NEW' THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF; payload_hash=idem->>'payloadHash';
  INSERT INTO erp.equipment_subcategories(id,company_id,category_id,name,code,created_by,updated_by) VALUES(subcategory_id,tenant,category,subcategory_name,subcategory_code,actor,actor) RETURNING * INTO created;
  INSERT INTO erp.audit_log(id,company_id,aggregate_type,aggregate_id,action,actor_id,occurred_at,correlation_id,new_values) VALUES(extensions.gen_random_uuid()::text,tenant,'EquipmentSubcategory',created.id::text,'EQUIPMENT_SUBCATEGORY_CREATED',actor,now_at,command->>'commandId',jsonb_strip_nulls(jsonb_build_object('categoryId',created.category_id,'name',created.name,'code',created.code,'active',created.active,'rowVersion',created.row_version)));
  response=jsonb_build_object('success',true,'disposition','ACCEPTED','serverOccurredAt',now_at,'refresh',jsonb_build_array(created.id::text),'value',jsonb_build_object('id',created.id,'categoryId',created.category_id,'name',created.name,'code',created.code,'active',created.active,'rowVersion',created.row_version));
  RETURN erp.finish_operational_command(command,'CREATE_EQUIPMENT_SUBCATEGORY','EquipmentSubcategory',created.id::text,tenant,actor,payload_hash,response,created.row_version);
EXCEPTION WHEN unique_violation THEN GET STACKED DIAGNOSTICS constraint_name=CONSTRAINT_NAME; IF constraint_name IN ('uq_equipment_subcategories_company_category_name_normalized','uq_equipment_subcategories_company_category_code_normalized') THEN RETURN jsonb_build_object('success',false,'code','EQUIPMENT_SUBCATEGORY_CONFLICT'); ELSIF constraint_name='equipment_subcategories_pkey' THEN RETURN jsonb_build_object('success',false,'code','EQUIPMENT_SUBCATEGORY_ID_CONFLICT'); END IF; RETURN jsonb_build_object('success',false,'code','PERSISTENCE_FAILURE'); WHEN OTHERS THEN IF SQLERRM='UNAUTHENTICATED' THEN RETURN jsonb_build_object('success',false,'code','UNAUTHENTICATED'); ELSIF SQLERRM='FORBIDDEN' THEN RETURN jsonb_build_object('success',false,'code','FORBIDDEN'); END IF; RETURN jsonb_build_object('success',false,'code','PERSISTENCE_FAILURE'); END $$;

CREATE OR REPLACE FUNCTION erp.command_update_equipment_subcategory(command jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,auth,extensions,pg_catalog AS $$
DECLARE tenant text; actor text=auth.uid()::text; now_at timestamptz=clock_timestamp(); subcategory_id uuid; subcategory_name text=nullif(btrim(command->>'name'),''); subcategory_code text=nullif(btrim(command->>'code'),''); expected bigint; prior erp.equipment_subcategories; changed erp.equipment_subcategories; idem jsonb; payload_hash text; response jsonb;
BEGIN
  tenant=erp.require_equipment_subcategory_actor('masterData.update'); IF EXISTS(SELECT 1 FROM jsonb_object_keys(command) key WHERE key NOT IN('commandId','idempotencyKey','equipmentSubcategoryId','name','code','expectedRowVersion')) OR subcategory_name IS NULL OR jsonb_typeof(command->'expectedRowVersion')<>'number' OR command->>'expectedRowVersion' !~ '^[0-9]+$' THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;
  BEGIN subcategory_id=(command->>'equipmentSubcategoryId')::uuid; expected=(command->>'expectedRowVersion')::bigint; EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END;
  SELECT * INTO prior FROM erp.equipment_subcategories WHERE id=subcategory_id AND company_id=tenant FOR UPDATE; IF NOT FOUND THEN RETURN jsonb_build_object('success',false,'code','NOT_FOUND'); END IF; IF prior.row_version<>expected THEN RETURN jsonb_build_object('success',false,'code','CONFLICT'); END IF;
  idem=erp.begin_operational_command(command,'UPDATE_EQUIPMENT_SUBCATEGORY','EquipmentSubcategory',subcategory_id::text,tenant,actor); IF idem->>'state'='MISMATCH' THEN RETURN jsonb_build_object('success',false,'code','IDEMPOTENCY_MISMATCH'); ELSIF idem->>'state'='REPLAY' THEN RETURN (idem->'response')||jsonb_build_object('disposition','REPLAYED'); ELSIF idem->>'state'<>'NEW' THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF; payload_hash=idem->>'payloadHash';
  UPDATE erp.equipment_subcategories SET name=subcategory_name,code=subcategory_code,updated_by=actor WHERE id=subcategory_id AND company_id=tenant RETURNING * INTO changed;
  INSERT INTO erp.audit_log(id,company_id,aggregate_type,aggregate_id,action,actor_id,occurred_at,correlation_id,previous_values,new_values) VALUES(extensions.gen_random_uuid()::text,tenant,'EquipmentSubcategory',subcategory_id::text,'EQUIPMENT_SUBCATEGORY_UPDATED',actor,now_at,command->>'commandId',jsonb_strip_nulls(jsonb_build_object('name',prior.name,'code',prior.code,'rowVersion',prior.row_version)),jsonb_strip_nulls(jsonb_build_object('name',changed.name,'code',changed.code,'rowVersion',changed.row_version)));
  response=jsonb_build_object('success',true,'disposition','ACCEPTED','serverOccurredAt',now_at,'refresh',jsonb_build_array(subcategory_id::text),'value',jsonb_build_object('id',changed.id,'categoryId',changed.category_id,'name',changed.name,'code',changed.code,'active',changed.active,'rowVersion',changed.row_version)); RETURN erp.finish_operational_command(command,'UPDATE_EQUIPMENT_SUBCATEGORY','EquipmentSubcategory',subcategory_id::text,tenant,actor,payload_hash,response,changed.row_version);
EXCEPTION WHEN unique_violation THEN RETURN jsonb_build_object('success',false,'code','EQUIPMENT_SUBCATEGORY_CONFLICT'); WHEN OTHERS THEN IF SQLERRM='UNAUTHENTICATED' THEN RETURN jsonb_build_object('success',false,'code','UNAUTHENTICATED'); ELSIF SQLERRM='FORBIDDEN' THEN RETURN jsonb_build_object('success',false,'code','FORBIDDEN'); END IF; RETURN jsonb_build_object('success',false,'code','PERSISTENCE_FAILURE'); END $$;

CREATE OR REPLACE FUNCTION erp.command_set_equipment_subcategory_active(command jsonb, desired_active boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,auth,extensions,pg_catalog AS $$
DECLARE tenant text; actor text=auth.uid()::text; now_at timestamptz=clock_timestamp(); subcategory_id uuid; expected bigint; prior erp.equipment_subcategories; changed erp.equipment_subcategories; action_name text=CASE WHEN desired_active THEN 'EQUIPMENT_SUBCATEGORY_ACTIVATED' ELSE 'EQUIPMENT_SUBCATEGORY_DEACTIVATED' END; command_name text=CASE WHEN desired_active THEN 'ACTIVATE_EQUIPMENT_SUBCATEGORY' ELSE 'DEACTIVATE_EQUIPMENT_SUBCATEGORY' END; idem jsonb; payload_hash text; response jsonb;
BEGIN
  tenant=erp.require_equipment_subcategory_actor('masterData.update'); IF EXISTS(SELECT 1 FROM jsonb_object_keys(command) key WHERE key NOT IN('commandId','idempotencyKey','equipmentSubcategoryId','expectedRowVersion')) OR jsonb_typeof(command->'expectedRowVersion')<>'number' OR command->>'expectedRowVersion' !~ '^[0-9]+$' THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;
  BEGIN subcategory_id=(command->>'equipmentSubcategoryId')::uuid; expected=(command->>'expectedRowVersion')::bigint; EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END;
  SELECT * INTO prior FROM erp.equipment_subcategories WHERE id=subcategory_id AND company_id=tenant FOR UPDATE; IF NOT FOUND THEN RETURN jsonb_build_object('success',false,'code','NOT_FOUND'); END IF; IF prior.row_version<>expected THEN RETURN jsonb_build_object('success',false,'code','CONFLICT'); END IF;
  idem=erp.begin_operational_command(command,command_name,'EquipmentSubcategory',subcategory_id::text,tenant,actor); IF idem->>'state'='MISMATCH' THEN RETURN jsonb_build_object('success',false,'code','IDEMPOTENCY_MISMATCH'); ELSIF idem->>'state'='REPLAY' THEN RETURN (idem->'response')||jsonb_build_object('disposition','REPLAYED'); ELSIF idem->>'state'<>'NEW' THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF; payload_hash=idem->>'payloadHash';
  UPDATE erp.equipment_subcategories SET active=desired_active,updated_by=actor WHERE id=subcategory_id AND company_id=tenant RETURNING * INTO changed;
  INSERT INTO erp.audit_log(id,company_id,aggregate_type,aggregate_id,action,actor_id,occurred_at,correlation_id,previous_values,new_values) VALUES(extensions.gen_random_uuid()::text,tenant,'EquipmentSubcategory',subcategory_id::text,action_name,actor,now_at,command->>'commandId',jsonb_build_object('active',prior.active,'rowVersion',prior.row_version),jsonb_build_object('active',changed.active,'rowVersion',changed.row_version));
  response=jsonb_build_object('success',true,'disposition','ACCEPTED','serverOccurredAt',now_at,'refresh',jsonb_build_array(subcategory_id::text),'value',jsonb_build_object('id',changed.id,'categoryId',changed.category_id,'name',changed.name,'code',changed.code,'active',changed.active,'rowVersion',changed.row_version)); RETURN erp.finish_operational_command(command,command_name,'EquipmentSubcategory',subcategory_id::text,tenant,actor,payload_hash,response,changed.row_version);
EXCEPTION WHEN OTHERS THEN IF SQLERRM='UNAUTHENTICATED' THEN RETURN jsonb_build_object('success',false,'code','UNAUTHENTICATED'); ELSIF SQLERRM='FORBIDDEN' THEN RETURN jsonb_build_object('success',false,'code','FORBIDDEN'); END IF; RETURN jsonb_build_object('success',false,'code','PERSISTENCE_FAILURE'); END $$;
CREATE OR REPLACE FUNCTION erp.command_activate_equipment_subcategory(command jsonb) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=erp,auth,extensions,pg_catalog AS $$ SELECT erp.command_set_equipment_subcategory_active(command,true) $$;
CREATE OR REPLACE FUNCTION erp.command_deactivate_equipment_subcategory(command jsonb) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=erp,auth,extensions,pg_catalog AS $$ SELECT erp.command_set_equipment_subcategory_active(command,false) $$;

-- The existing create contract remains backward compatible: subcategoryId is optional.
DO $extend_equipment_create$
DECLARE definition text;
BEGIN
  SELECT pg_get_functiondef('erp.command_create_equipment(jsonb)'::regprocedure) INTO definition;
  IF position($needle$'remarks'))$needle$ IN definition)=0 THEN RAISE EXCEPTION 'command_create_equipment contract shape changed; migration stopped'; END IF;
  definition=replace(definition,$needle$'currentReading','remarks'))$needle$,$replacement$'currentReading','remarks','categoryId','subcategoryId'))$replacement$);
  definition=replace(definition,$needle$remarks_value text=nullif(btrim(command->>'remarks'),''); current_reading_value numeric=0;$needle$,$replacement$remarks_value text=nullif(btrim(command->>'remarks'),''); category_id_value text=nullif(btrim(command->>'categoryId'),''); subcategory_id_value uuid; current_reading_value numeric=0;$replacement$);
  definition=replace(definition,$needle$IF NOT EXISTS(SELECT 1 FROM erp.cost_codes c WHERE c.id=cost_code_id_value AND c.active AND c.deleted_at IS NULL)$needle$,$replacement$IF command ? 'subcategoryId' THEN BEGIN subcategory_id_value=(command->>'subcategoryId')::uuid; EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END; IF category_id_value IS NULL THEN RETURN jsonb_build_object('success',false,'code','EQUIPMENT_SUBCATEGORY_CATEGORY_MISMATCH'); END IF; IF NOT EXISTS(SELECT 1 FROM erp.equipment_subcategories s WHERE s.id=subcategory_id_value AND s.company_id=tenant AND s.category_id=category_id_value AND s.active) THEN RETURN jsonb_build_object('success',false,'code','EQUIPMENT_SUBCATEGORY_NOT_SELECTABLE'); END IF; END IF; IF NOT EXISTS(SELECT 1 FROM erp.cost_codes c WHERE c.id=cost_code_id_value AND c.active AND c.deleted_at IS NULL)$replacement$);
  definition=replace(definition,$needle$INSERT INTO erp.equipment(id,asset_no,equipment_name,maintenance_type,current_reading,remarks,status_id,cost_code_id,active,deleted_at,deleted_by,created_by,updated_by,legacy_payload,project_id,operator_id,company_id)$needle$,$replacement$INSERT INTO erp.equipment(id,asset_no,equipment_name,category_id,subcategory_id,maintenance_type,current_reading,remarks,status_id,cost_code_id,active,deleted_at,deleted_by,created_by,updated_by,legacy_payload,project_id,operator_id,company_id)$replacement$);
  definition=replace(definition,$needle$VALUES(command->>'equipmentId',asset_number,equipment_name_value,maintenance_type_value,current_reading_value,remarks_value,available_status_id,cost_code_id_value,true,NULL,NULL,actor,actor,'{}'::jsonb,NULL,NULL,tenant)$needle$,$replacement$VALUES(command->>'equipmentId',asset_number,equipment_name_value,category_id_value,subcategory_id_value,maintenance_type_value,current_reading_value,remarks_value,available_status_id,cost_code_id_value,true,NULL,NULL,actor,actor,'{}'::jsonb,NULL,NULL,tenant)$replacement$);
  definition=replace(definition,$needle$'equipmentName',created_equipment.equipment_name,'costCodeId'$needle$,$replacement$'equipmentName',created_equipment.equipment_name,'categoryId',created_equipment.category_id,'subcategoryId',created_equipment.subcategory_id,'costCodeId'$replacement$);
  definition=replace(definition,$needle$'equipmentName',created_equipment.equipment_name,
  'maintenanceType'$needle$,$replacement$'equipmentName',created_equipment.equipment_name,'categoryId',created_equipment.category_id,'subcategoryId',created_equipment.subcategory_id,
  'maintenanceType'$replacement$);
  EXECUTE definition;
END $extend_equipment_create$;

ALTER FUNCTION erp.validate_equipment_subcategory_reference() OWNER TO postgres;
ALTER FUNCTION erp.require_equipment_subcategory_actor(text) OWNER TO postgres;
ALTER FUNCTION erp.list_equipment_subcategories(text,boolean) OWNER TO postgres;
ALTER FUNCTION erp.list_assignable_equipment_subcategories(text) OWNER TO postgres;
ALTER FUNCTION erp.command_create_equipment_subcategory(jsonb) OWNER TO postgres;
ALTER FUNCTION erp.command_update_equipment_subcategory(jsonb) OWNER TO postgres;
ALTER FUNCTION erp.command_set_equipment_subcategory_active(jsonb,boolean) OWNER TO postgres;
ALTER FUNCTION erp.command_activate_equipment_subcategory(jsonb) OWNER TO postgres;
ALTER FUNCTION erp.command_deactivate_equipment_subcategory(jsonb) OWNER TO postgres;
REVOKE ALL ON TABLE erp.equipment_subcategories FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION erp.validate_equipment_subcategory_reference(),erp.require_equipment_subcategory_actor(text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION erp.list_equipment_subcategories(text,boolean),erp.list_assignable_equipment_subcategories(text),erp.command_create_equipment_subcategory(jsonb),erp.command_update_equipment_subcategory(jsonb),erp.command_set_equipment_subcategory_active(jsonb,boolean),erp.command_activate_equipment_subcategory(jsonb),erp.command_deactivate_equipment_subcategory(jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION erp.list_equipment_subcategories(text,boolean),erp.list_assignable_equipment_subcategories(text),erp.command_create_equipment_subcategory(jsonb),erp.command_update_equipment_subcategory(jsonb),erp.command_activate_equipment_subcategory(jsonb),erp.command_deactivate_equipment_subcategory(jsonb) TO authenticated;
COMMIT;
