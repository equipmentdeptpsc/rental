BEGIN;
SET LOCAL search_path=erp,auth,extensions,pg_catalog;

-- Operational meter evidence is independent from maintenance scheduling.
ALTER TABLE erp.equipment ADD COLUMN meter_capability text;
ALTER TABLE erp.equipment ADD CONSTRAINT ck_equipment_meter_capability
  CHECK (meter_capability IS NULL OR meter_capability IN ('none','hourMeter','odometer','both'));

CREATE OR REPLACE FUNCTION erp.effective_equipment_meter_capability(explicit_capability text, maintenance_type_value text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
  SELECT CASE
    WHEN explicit_capability IN ('none','hourMeter','odometer','both') THEN explicit_capability
    WHEN maintenance_type_value='Engine Hours' THEN 'hourMeter'
    WHEN maintenance_type_value IN ('Kilometers','Mileage') THEN 'odometer'
    ELSE 'none'
  END
$$;

CREATE OR REPLACE FUNCTION erp.equipment_supports_meter_requirement(capability text, requirement text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
  SELECT requirement='none' OR capability='both' OR capability=requirement
$$;

-- The preparation command predates dual-meter support.  Recreate its existing
-- body with only the meter compatibility predicate replaced, and fail closed if
-- the authoritative predecessor is not the expected version.
DO $migration$
DECLARE definition text;
  old_predicate constant text := $$IF meter NOT IN('none','odometer','hourMeter','both') OR (meter IN('odometer','both') AND coalesce(equipment_row.maintenance_type,'') NOT IN('Kilometers','Mileage')) OR (meter IN('hourMeter','both') AND coalesce(equipment_row.maintenance_type,'')<>'Engine Hours') THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED','message','Meter requirement is incompatible with Equipment configuration.','retryable',false,'refreshRequired',false); END IF;$$;
  new_predicate constant text := $$IF meter NOT IN('none','odometer','hourMeter','both') OR NOT erp.equipment_supports_meter_requirement(erp.effective_equipment_meter_capability(equipment_row.meter_capability,equipment_row.maintenance_type),meter) THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED','message','Meter requirement is incompatible with Equipment configuration.','retryable',false,'refreshRequired',false); END IF;$$;
BEGIN
  SELECT pg_get_functiondef('erp.command_prepare_reserved_rental_aggregate(jsonb)'::regprocedure) INTO definition;
  IF position(old_predicate IN definition)=0 THEN RAISE EXCEPTION 'unexpected rental preparation definition'; END IF;
  EXECUTE replace(definition,old_predicate,new_predicate);
END $migration$;

DO $equipment_create$
DECLARE definition text;
BEGIN
  SELECT pg_get_functiondef('erp.command_create_equipment(jsonb)'::regprocedure) INTO definition;
  IF position($$maintenance_type_value text=command->>'maintenanceType'; cost_code_id_value$$ IN definition)=0
     OR position($$'maintenanceType','costCodeId'$$ IN definition)=0 THEN
    RAISE EXCEPTION 'unexpected equipment create definition';
  END IF;
  definition:=replace(definition,
    $$maintenance_type_value text=command->>'maintenanceType'; cost_code_id_value$$,
    $$maintenance_type_value text=command->>'maintenanceType'; meter_capability_value text=nullif(btrim(command->>'meterCapability'),''); cost_code_id_value$$);
  definition:=replace(definition,$$'maintenanceType','costCodeId'$$,$$'maintenanceType','meterCapability','costCodeId'$$);
  definition:=replace(definition,
    $$OR maintenance_type_value NOT IN('Engine Hours','Kilometers','Mileage','Calendar Days')$$,
    $$OR maintenance_type_value NOT IN('Engine Hours','Kilometers','Mileage','Calendar Days') OR meter_capability_value NOT IN('none','hourMeter','odometer','both') AND meter_capability_value IS NOT NULL$$);
  definition:=replace(definition,
    $$INSERT INTO erp.equipment(id,asset_no,equipment_name,maintenance_type,current_reading$$,
    $$INSERT INTO erp.equipment(id,asset_no,equipment_name,maintenance_type,meter_capability,current_reading$$);
  definition:=replace(definition,
    $$VALUES(command->>'equipmentId',asset_number,equipment_name_value,maintenance_type_value,current_reading_value$$,
    $$VALUES(command->>'equipmentId',asset_number,equipment_name_value,maintenance_type_value,meter_capability_value,current_reading_value$$);
  definition:=replace(definition,
    $$'maintenanceType',created_equipment.maintenance_type,'currentReading'$$,
    $$'maintenanceType',created_equipment.maintenance_type,'meterCapability',created_equipment.meter_capability,'currentReading'$$);
  definition:=replace(definition,
    $$'maintenanceType',created_equipment.maintenance_type,'costCodeId'$$,
    $$'maintenanceType',created_equipment.maintenance_type,'meterCapability',created_equipment.meter_capability,'costCodeId'$$);
  EXECUTE definition;
END $equipment_create$;

ALTER FUNCTION erp.effective_equipment_meter_capability(text,text) OWNER TO postgres;
ALTER FUNCTION erp.equipment_supports_meter_requirement(text,text) OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.effective_equipment_meter_capability(text,text),erp.equipment_supports_meter_requirement(text,text) FROM PUBLIC,anon,authenticated,service_role;

COMMIT;
