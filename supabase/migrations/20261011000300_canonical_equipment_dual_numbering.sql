BEGIN;
SET LOCAL search_path=erp,auth,extensions,pg_catalog;

-- These are the existing local PrefixRepository rules, attached to the four
-- bootstrapped global category identities. The database, not the browser,
-- owns the next issued number.
CREATE TABLE erp.equipment_asset_sequences (
  category_id text PRIMARY KEY REFERENCES erp.equipment_categories(id) ON DELETE RESTRICT,
  prefix_id text NOT NULL UNIQUE,
  prefix_code text NOT NULL UNIQUE,
  digits integer NOT NULL CHECK (digits BETWEEN 1 AND 12),
  next_number bigint NOT NULL DEFAULT 1 CHECK (next_number > 0)
);
INSERT INTO erp.equipment_asset_sequences(category_id,prefix_id,prefix_code,digits) VALUES
 ('d4c032dc-dc09-5a24-87c5-e663645f75ba','prefix-moving-equipment','ME',6),
 ('ab695f74-6bc3-56e7-87a8-6ee851a2adc1','prefix-non-moving-equipment','NME',6),
 ('ab58d0c5-5b24-5dd6-a105-b90a30202a3f','prefix-aerial-equipment','AE',6),
 ('c335be47-3619-5d15-8931-ba77bdfd715e','prefix-light-equipment','LE',6);
DO $approved_categories$
BEGIN
 IF (SELECT count(*) FROM erp.equipment_asset_sequences s JOIN erp.equipment_categories c ON c.id=s.category_id
     WHERE (s.prefix_code='ME' AND c.name='Moving Equipment')
        OR (s.prefix_code='NME' AND c.name='Non-Moving Equipment')
        OR (s.prefix_code='AE' AND c.name='Aerial Equipment')
        OR (s.prefix_code='LE' AND c.name='Light Equipment'))<>4
 THEN RAISE EXCEPTION 'Approved Equipment Category/prefix identity mismatch'; END IF;
END $approved_categories$;

-- Fail closed if historical rows already violate permanent uniqueness. No
-- deleted row is discarded or renumbered by this migration.
DROP INDEX erp.uq_equipment_asset_no_active;
CREATE UNIQUE INDEX uq_equipment_asset_no_issued ON erp.equipment(lower(btrim(asset_no)));
ALTER TABLE erp.equipment ADD COLUMN legacy_equipment_number text;
ALTER TABLE erp.equipment ADD CONSTRAINT ck_equipment_legacy_number_normalized
 CHECK (legacy_equipment_number IS NULL OR (legacy_equipment_number=btrim(legacy_equipment_number) AND legacy_equipment_number<>'' AND length(legacy_equipment_number)<=70));
CREATE UNIQUE INDEX uq_equipment_legacy_number_issued
 ON erp.equipment(lower(regexp_replace(btrim(legacy_equipment_number),'\s+',' ','g')))
 WHERE legacy_equipment_number IS NOT NULL;

-- The global master catalogs are not directly readable by browser roles.
-- Match the existing subcategory/current-customer projection boundary.
CREATE FUNCTION erp.read_equipment_registration_master_projection(target_equipment_id text)
RETURNS TABLE(ownership_name text,location_name text,condition_name text,cost_code text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=erp,auth,pg_catalog AS $$
 SELECT ownership.name,location.name,condition.name,cost.code
 FROM erp.equipment equipment
 LEFT JOIN erp.equipment_ownerships ownership ON ownership.id=equipment.ownership_id
 LEFT JOIN erp.equipment_locations location ON location.id=equipment.location_id
 LEFT JOIN erp.equipment_conditions condition ON condition.id=equipment.condition_id
 LEFT JOIN erp.cost_codes cost ON cost.id=equipment.cost_code_id
 WHERE equipment.id=target_equipment_id
   AND EXISTS(SELECT 1 FROM erp.users caller JOIN erp.companies company
     ON company.id=caller.company_id AND company.active
     WHERE caller.id=auth.uid() AND caller.status='active' AND caller.company_id=equipment.company_id)
$$;
ALTER FUNCTION erp.read_equipment_registration_master_projection(text) OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.read_equipment_registration_master_projection(text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION erp.read_equipment_registration_master_projection(text) TO authenticated;

-- Keep the invoker-rights read model's existing column order intact.
CREATE OR REPLACE VIEW erp.equipment_read_model WITH (security_invoker=true) AS
SELECT equipment.id,equipment.asset_no,equipment.equipment_name,equipment.prefix_id,
 equipment.category_id,equipment.type_id,equipment.model_id,equipment.brand_id,
 equipment.condition_id,equipment.location_id,equipment.ownership_id,equipment.status_id,
 equipment.project_id,equipment.operator_id,equipment.cost_code_id,equipment.manufacturer,
 equipment.model_text,equipment.serial_number,equipment.engine_number,equipment.chassis_number,
 equipment.plate_number,equipment.year_model,equipment.capacity,equipment.maintenance_type,
 equipment.current_reading,equipment.remarks,equipment.active,equipment.deleted_at,
 equipment.deleted_by,equipment.created_at,equipment.created_by,equipment.updated_at,
 equipment.updated_by,equipment.row_version,equipment.legacy_payload,equipment.company_id,
 equipment.subcategory_id,subcategory.subcategory_name,subcategory.subcategory_active,
 current_customer.customer_id,equipment.meter_capability,
 equipment.legacy_equipment_number,registration.ownership_name,
 registration.location_name,registration.condition_name,registration.cost_code
FROM erp.equipment equipment
LEFT JOIN LATERAL erp.read_equipment_subcategory_projection(equipment.id) subcategory ON true
LEFT JOIN LATERAL erp.read_equipment_current_customer_projection(equipment.id) current_customer ON true
LEFT JOIN LATERAL erp.read_equipment_registration_master_projection(equipment.id) registration ON true;
ALTER VIEW erp.equipment_read_model OWNER TO postgres;
GRANT SELECT ON erp.equipment_read_model TO authenticated;

CREATE OR REPLACE FUNCTION erp.read_canonical_equipment_reference_data() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=erp,auth,pg_catalog AS $$
DECLARE tenant text=erp.current_company_id();
BEGIN
 IF auth.uid() IS NULL OR tenant IS NULL OR NOT EXISTS(
   SELECT 1 FROM erp.users u JOIN erp.companies c ON c.id=u.company_id
   WHERE u.id=auth.uid() AND u.status='active' AND u.company_id=tenant AND c.active
 ) OR NOT erp.current_user_has_permission('equipment.create')
 THEN RETURN jsonb_build_object('success',false,'code','FORBIDDEN'); END IF;
 RETURN jsonb_build_object('success',true,
  'costCodes',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',c.id,'code',c.code,'name',c.name,'active',true,'sortOrder',c.sort_order) ORDER BY c.sort_order,c.code,c.id),'[]'::jsonb) FROM erp.cost_codes c WHERE c.active AND c.deleted_at IS NULL),
  'brands',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',m.id,'code',m.code,'name',m.name,'active',true) ORDER BY m.name,m.id),'[]'::jsonb) FROM erp.equipment_brands m WHERE m.active AND m.deleted_at IS NULL),
  'models',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',m.id,'code',m.code,'name',m.name,'active',true) ORDER BY m.name,m.id),'[]'::jsonb) FROM erp.equipment_models m WHERE m.active AND m.deleted_at IS NULL),
  'ownerships',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',m.id,'code',m.code,'name',m.name,'active',true) ORDER BY m.name,m.id),'[]'::jsonb) FROM erp.equipment_ownerships m WHERE m.active AND m.deleted_at IS NULL),
  'locations',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',m.id,'code',m.code,'name',m.name,'active',true) ORDER BY m.name,m.id),'[]'::jsonb) FROM erp.equipment_locations m WHERE m.active AND m.deleted_at IS NULL),
  'conditions',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',m.id,'code',m.code,'name',m.name,'active',true) ORDER BY m.name,m.id),'[]'::jsonb) FROM erp.equipment_conditions m WHERE m.active AND m.deleted_at IS NULL)
 );
END $$;

CREATE OR REPLACE FUNCTION erp.command_create_equipment(command jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,auth,extensions,pg_catalog AS $$
DECLARE
 tenant text=erp.current_company_id(); actor text=auth.uid()::text; now_at timestamptz=clock_timestamp();
 equipment_name_value text=nullif(btrim(command->>'equipmentName'),''); category_id_value text=nullif(btrim(command->>'categoryId'),'');
 subcategory_id_value uuid; legacy_number text=nullif(regexp_replace(btrim(command->>'legacyEquipmentNumber'),'\s+',' ','g'),'');
 maintenance_type_value text=command->>'maintenanceType'; cost_code_id_value text=nullif(btrim(command->>'costCodeId'),'');
 meter_capability_value text=nullif(btrim(command->>'meterCapability'),'');
 remarks_value text=nullif(btrim(command->>'remarks'),''); current_reading_value numeric=0; year_model_value integer;
 brand_id_value text=nullif(btrim(command->>'brandId'),''); model_id_value text=nullif(btrim(command->>'modelId'),'');
 ownership_id_value text=nullif(btrim(command->>'ownershipId'),''); location_id_value text=nullif(btrim(command->>'locationId'),'');
 condition_id_value text=nullif(btrim(command->>'conditionId'),''); serial_number_value text=nullif(btrim(command->>'serialNumber'),'');
 available_status_id text; allocated_number text; allocated_prefix_id text; created_equipment erp.equipment;
 idem jsonb; payload_hash text; response jsonb; violated_constraint text;
BEGIN
 IF auth.uid() IS NULL OR tenant IS NULL OR NOT EXISTS(
  SELECT 1 FROM erp.users u JOIN erp.companies c ON c.id=u.company_id
  WHERE u.id=auth.uid() AND u.status='active' AND u.company_id=tenant AND c.active
 ) THEN RETURN jsonb_build_object('success',false,'code','UNAUTHENTICATED'); END IF;
 IF NOT erp.current_user_has_permission('equipment.create') THEN RETURN jsonb_build_object('success',false,'code','FORBIDDEN'); END IF;
 IF command IS NULL OR jsonb_typeof(command)<>'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(command) key WHERE key NOT IN(
  'commandId','idempotencyKey','equipmentId','equipmentName','categoryId','subcategoryId','legacyEquipmentNumber',
  'brandId','modelId','serialNumber','yearModel','ownershipId','locationId','conditionId','maintenanceType',
  'meterCapability','costCodeId','currentReading','remarks'))
  OR nullif(btrim(command->>'commandId'),'') IS NULL OR nullif(btrim(command->>'idempotencyKey'),'') IS NULL
  OR nullif(btrim(command->>'equipmentId'),'') IS NULL OR command->>'equipmentId'<>btrim(command->>'equipmentId')
  OR command->>'equipmentId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  OR equipment_name_value IS NULL OR category_id_value IS NULL OR nullif(btrim(command->>'subcategoryId'),'') IS NULL
  OR cost_code_id_value IS NULL OR maintenance_type_value NOT IN('Hour Meter','Mileage','None','Both','Engine Hours','Kilometers','Calendar Days')
  OR (meter_capability_value IS NOT NULL AND meter_capability_value NOT IN('none','hourMeter','odometer','both'))
  OR (command ? 'assetNo') OR (command ? 'prefixId')
  OR (command ? 'remarks' AND jsonb_typeof(command->'remarks') NOT IN('string','null'))
  OR (command ? 'legacyEquipmentNumber' AND jsonb_typeof(command->'legacyEquipmentNumber') NOT IN('string','null'))
  OR (command ? 'currentReading' AND jsonb_typeof(command->'currentReading') NOT IN('number','string','null'))
  OR (command ? 'yearModel' AND jsonb_typeof(command->'yearModel') NOT IN('number','string','null'))
 THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;
 BEGIN
  subcategory_id_value=(command->>'subcategoryId')::uuid;
  current_reading_value=coalesce(nullif(btrim(command->>'currentReading'),'')::numeric,0);
  year_model_value=nullif(btrim(command->>'yearModel'),'')::integer;
 EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END;
 IF current_reading_value<0 OR (year_model_value IS NOT NULL AND year_model_value NOT BETWEEN 1900 AND 2200)
  OR length(equipment_name_value)>250 OR length(legacy_number)>70
 THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;
 IF NOT EXISTS(SELECT 1 FROM erp.equipment_categories m WHERE m.id=category_id_value AND m.active AND m.deleted_at IS NULL)
  OR NOT EXISTS(SELECT 1 FROM erp.equipment_subcategories m WHERE m.id=subcategory_id_value AND m.category_id=category_id_value AND m.company_id=tenant AND m.active)
  OR NOT EXISTS(SELECT 1 FROM erp.cost_codes m WHERE m.id=cost_code_id_value AND m.active AND m.deleted_at IS NULL)
  OR (brand_id_value IS NOT NULL AND NOT EXISTS(SELECT 1 FROM erp.equipment_brands m WHERE m.id=brand_id_value AND m.active AND m.deleted_at IS NULL))
  OR (model_id_value IS NOT NULL AND NOT EXISTS(SELECT 1 FROM erp.equipment_models m WHERE m.id=model_id_value AND m.active AND m.deleted_at IS NULL))
  OR (ownership_id_value IS NOT NULL AND NOT EXISTS(SELECT 1 FROM erp.equipment_ownerships m WHERE m.id=ownership_id_value AND m.active AND m.deleted_at IS NULL))
  OR (location_id_value IS NOT NULL AND NOT EXISTS(SELECT 1 FROM erp.equipment_locations m WHERE m.id=location_id_value AND m.active AND m.deleted_at IS NULL))
  OR (condition_id_value IS NOT NULL AND NOT EXISTS(SELECT 1 FROM erp.equipment_conditions m WHERE m.id=condition_id_value AND m.active AND m.deleted_at IS NULL))
 THEN RETURN jsonb_build_object('success',false,'code','NOT_FOUND'); END IF;
 IF (SELECT count(*) FROM erp.equipment_statuses s WHERE upper(btrim(s.code))='AVAILABLE' AND s.active AND s.deleted_at IS NULL)<>1
 THEN RETURN jsonb_build_object('success',false,'code','PERSISTENCE_FAILURE'); END IF;
 SELECT s.id INTO available_status_id FROM erp.equipment_statuses s WHERE upper(btrim(s.code))='AVAILABLE' AND s.active AND s.deleted_at IS NULL;
 idem=erp.begin_operational_command(command,'CREATE_EQUIPMENT','EQUIPMENT',command->>'equipmentId',tenant,actor);
 IF idem->>'state'='MISMATCH' THEN RETURN jsonb_build_object('success',false,'code','IDEMPOTENCY_MISMATCH');
 ELSIF idem->>'state'='REPLAY' THEN RETURN (idem->'response')||jsonb_build_object('disposition','REPLAYED');
 ELSIF idem->>'state'<>'NEW' THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;
 payload_hash=idem->>'payloadHash';
 -- UPDATE serializes concurrent issuers on the category row. The max includes
 -- soft-deleted historical equipment; next_number never decreases.
 UPDATE erp.equipment_asset_sequences s SET next_number=greatest(s.next_number,
   coalesce((SELECT max((substring(e.asset_no FROM ('(?i)^'||s.prefix_code||'-([0-9]+)$')))::bigint)+1
     FROM erp.equipment e WHERE e.asset_no ~* ('^'||s.prefix_code||'-[0-9]+$')),1))+1
 WHERE s.category_id=category_id_value
 RETURNING s.prefix_code||'-'||lpad((s.next_number-1)::text,s.digits,'0'),s.prefix_id INTO allocated_number,allocated_prefix_id;
 IF allocated_number IS NULL THEN RETURN jsonb_build_object('success',false,'code','ASSET_PREFIX_NOT_CONFIGURED'); END IF;
 INSERT INTO erp.equipment(id,asset_no,legacy_equipment_number,equipment_name,prefix_id,category_id,subcategory_id,
  brand_id,model_id,serial_number,year_model,ownership_id,location_id,condition_id,manufacturer,model_text,
  maintenance_type,meter_capability,current_reading,remarks,status_id,cost_code_id,active,deleted_at,deleted_by,
  created_by,updated_by,legacy_payload,project_id,operator_id,company_id)
 VALUES(command->>'equipmentId',allocated_number,legacy_number,equipment_name_value,allocated_prefix_id,category_id_value,subcategory_id_value,
  brand_id_value,model_id_value,serial_number_value,year_model_value,ownership_id_value,location_id_value,condition_id_value,
  (SELECT name FROM erp.equipment_brands WHERE id=brand_id_value),(SELECT name FROM erp.equipment_models WHERE id=model_id_value),
  maintenance_type_value,meter_capability_value,current_reading_value,remarks_value,available_status_id,cost_code_id_value,
  true,NULL,NULL,actor,actor,'{}'::jsonb,NULL,NULL,tenant)
 RETURNING * INTO created_equipment;
 INSERT INTO erp.audit_log(id,company_id,aggregate_type,aggregate_id,action,actor_id,occurred_at,correlation_id,new_values)
 VALUES(extensions.gen_random_uuid()::text,tenant,'Equipment',created_equipment.id,'EQUIPMENT_CREATED',actor,now_at,command->>'commandId',
  jsonb_strip_nulls(jsonb_build_object('equipmentId',created_equipment.id,'assetNo',created_equipment.asset_no,
   'legacyEquipmentNumber',created_equipment.legacy_equipment_number,'equipmentName',created_equipment.equipment_name,
   'categoryId',created_equipment.category_id,'subcategoryId',created_equipment.subcategory_id,
   'brandId',created_equipment.brand_id,'modelId',created_equipment.model_id,'serialNumber',created_equipment.serial_number,
   'yearModel',created_equipment.year_model,'ownershipId',created_equipment.ownership_id,'locationId',created_equipment.location_id,
   'conditionId',created_equipment.condition_id,'costCodeId',created_equipment.cost_code_id,
   'maintenanceType',created_equipment.maintenance_type,'currentReading',created_equipment.current_reading,
   'statusId',created_equipment.status_id)));
 response=jsonb_build_object('success',true,'disposition','ACCEPTED','serverOccurredAt',now_at,
  'refresh',jsonb_build_array(created_equipment.id),'value',jsonb_build_object(
   'id',created_equipment.id,'companyId',created_equipment.company_id,'assetNo',created_equipment.asset_no,
   'legacyEquipmentNumber',created_equipment.legacy_equipment_number,'equipmentName',created_equipment.equipment_name,
   'prefixId',created_equipment.prefix_id,'categoryId',created_equipment.category_id,'subcategoryId',created_equipment.subcategory_id,
   'brandId',created_equipment.brand_id,'modelId',created_equipment.model_id,'serialNumber',created_equipment.serial_number,
   'yearModel',created_equipment.year_model,'ownershipId',created_equipment.ownership_id,'locationId',created_equipment.location_id,
   'conditionId',created_equipment.condition_id,'maintenanceType',created_equipment.maintenance_type,
   'costCodeId',created_equipment.cost_code_id,'currentReading',created_equipment.current_reading,
   'remarks',created_equipment.remarks,'statusId',created_equipment.status_id,'active',created_equipment.active,
   'deletedAt',created_equipment.deleted_at,'createdAt',created_equipment.created_at,
   'updatedAt',created_equipment.updated_at,'rowVersion',created_equipment.row_version));
 RETURN erp.finish_operational_command(command,'CREATE_EQUIPMENT','EQUIPMENT',created_equipment.id,tenant,actor,payload_hash,response,created_equipment.row_version);
EXCEPTION WHEN unique_violation THEN
 GET STACKED DIAGNOSTICS violated_constraint=CONSTRAINT_NAME;
 IF violated_constraint='uq_equipment_asset_no_issued' THEN RETURN jsonb_build_object('success',false,'code','ASSET_NUMBER_CONFLICT');
 ELSIF violated_constraint='uq_equipment_legacy_number_issued' THEN RETURN jsonb_build_object('success',false,'code','LEGACY_NUMBER_CONFLICT');
 ELSIF violated_constraint IN('equipment_pkey','uq_equipment_company_id') THEN RETURN jsonb_build_object('success',false,'code','EQUIPMENT_ID_CONFLICT'); END IF;
 RETURN jsonb_build_object('success',false,'code','PERSISTENCE_FAILURE');
WHEN OTHERS THEN RETURN jsonb_build_object('success',false,'code','PERSISTENCE_FAILURE'); END $$;

-- Only newly inserted immutable billing lines receive the extended snapshot.
-- Historical statement rows and their totals are intentionally untouched.
DO $snapshot$
DECLARE definition text;
BEGIN
 SELECT pg_get_functiondef('erp.capture_billing_statement_line_lineage()'::regprocedure) INTO definition;
 IF position($old$'id',equipment_record.id,'assetNo',equipment_record.asset_no,'name',equipment_record.equipment_name$old$ IN definition)=0
 THEN RAISE EXCEPTION 'Unexpected billing lineage capture definition'; END IF;
 EXECUTE replace(definition,
  $old$'id',equipment_record.id,'assetNo',equipment_record.asset_no,'name',equipment_record.equipment_name$old$,
  $new$'id',equipment_record.id,'assetNo',equipment_record.asset_no,'legacyEquipmentNumber',equipment_record.legacy_equipment_number,'name',equipment_record.equipment_name$new$);
END $snapshot$;

ALTER FUNCTION erp.read_canonical_equipment_reference_data() OWNER TO postgres;
ALTER FUNCTION erp.command_create_equipment(jsonb) OWNER TO postgres;
REVOKE ALL ON TABLE erp.equipment_asset_sequences FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION erp.read_canonical_equipment_reference_data(),erp.command_create_equipment(jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION erp.read_canonical_equipment_reference_data(),erp.command_create_equipment(jsonb) TO authenticated;
REVOKE INSERT,UPDATE,DELETE ON erp.equipment FROM PUBLIC,anon,authenticated;
COMMIT;
