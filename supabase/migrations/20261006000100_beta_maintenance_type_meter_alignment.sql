BEGIN;
SET LOCAL search_path=erp,auth,extensions,pg_catalog;

-- The legacy meter_capability column remains for compatibility, but new
-- operational snapshots derive their meter policy from Maintenance Type.
CREATE OR REPLACE FUNCTION erp.effective_equipment_meter_capability(explicit_capability text, maintenance_type_value text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
  SELECT CASE maintenance_type_value
    WHEN 'Hour Meter' THEN 'hourMeter'
    WHEN 'Engine Hours' THEN 'hourMeter'
    WHEN 'Mileage' THEN 'odometer'
    WHEN 'Kilometers' THEN 'odometer'
    WHEN 'Both' THEN 'both'
    WHEN 'None' THEN 'none'
    WHEN 'Calendar Days' THEN 'none'
    ELSE 'none'
  END
$$;

-- No table constraint limits maintenance_type, but the authoritative create
-- command has an explicit allowlist. Extend it without rewriting old records.
DO $migration$
DECLARE definition text;
  previous constant text := $$maintenance_type_value NOT IN('Engine Hours','Kilometers','Mileage','Calendar Days')$$;
  revised constant text := $$maintenance_type_value NOT IN('Hour Meter','Mileage','None','Both','Engine Hours','Kilometers','Calendar Days')$$;
BEGIN
  SELECT pg_get_functiondef('erp.command_create_equipment(jsonb)'::regprocedure) INTO definition;
  IF position(previous IN definition)=0 THEN RAISE EXCEPTION 'Unexpected canonical Equipment create validation'; END IF;
  EXECUTE replace(definition,previous,revised);
END $migration$;

CREATE OR REPLACE FUNCTION erp.command_update_equipment_maintenance_type(command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,auth,extensions,pg_catalog AS $$
DECLARE
  tenant erp.equipment.company_id%TYPE:=erp.current_company_id(); actor uuid:=auth.uid(); target erp.equipment;
  desired text:=command->>'maintenanceType'; idem jsonb; payload_hash text; next_version bigint; response jsonb; now_at timestamptz;
BEGIN
  IF tenant IS NULL OR actor IS NULL THEN RETURN jsonb_build_object('success',false,'code','UNAUTHENTICATED'); END IF;
  IF NOT erp.current_user_has_permission('equipment.update') THEN RETURN jsonb_build_object('success',false,'code','FORBIDDEN'); END IF;
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(command) key WHERE key NOT IN('commandId','idempotencyKey','equipmentId','expectedVersion','maintenanceType'))
    OR nullif(btrim(command->>'commandId'),'') IS NULL OR nullif(btrim(command->>'idempotencyKey'),'') IS NULL
    OR nullif(btrim(command->>'equipmentId'),'') IS NULL OR desired IS NULL OR desired NOT IN('Hour Meter','Mileage','None','Both')
    OR nullif(btrim(command->>'expectedVersion'),'') IS NULL OR (command->>'expectedVersion') !~ '^[0-9]+$'
  THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;
  SELECT * INTO target FROM erp.equipment WHERE id=command->>'equipmentId' AND company_id=tenant AND deleted_at IS NULL AND active=true FOR UPDATE;
  IF target.id IS NULL THEN RETURN jsonb_build_object('success',false,'code','NOT_FOUND'); END IF;
  idem:=erp.begin_operational_command(command,'UPDATE_EQUIPMENT_MAINTENANCE_TYPE','EQUIPMENT',target.id,tenant,actor::text);
  IF idem->>'state'='MISMATCH' THEN RETURN jsonb_build_object('success',false,'code','IDEMPOTENCY_MISMATCH'); END IF;
  IF idem->>'state'='REPLAY' THEN RETURN (idem->'response')||jsonb_build_object('disposition','REPLAYED'); END IF;
  IF idem->>'state'<>'NEW' THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;
  payload_hash:=idem->>'payloadHash';
  -- begin_operational_command does not insert on NEW; a stale version leaves no idempotency record.
  IF target.row_version<>(command->>'expectedVersion')::bigint THEN RETURN jsonb_build_object('success',false,'code','CONFLICT','refreshRequired',true,'currentVersion',target.row_version); END IF;
  now_at:=clock_timestamp();
  UPDATE erp.equipment SET maintenance_type=desired,updated_at=now_at,updated_by=actor::text,row_version=row_version+1 WHERE id=target.id RETURNING row_version INTO next_version;
  INSERT INTO erp.audit_log(id,company_id,aggregate_type,aggregate_id,action,actor_id,occurred_at,correlation_id,previous_values,new_values,metadata)
  VALUES(extensions.gen_random_uuid()::text,tenant,'Equipment',target.id,'EQUIPMENT_MAINTENANCE_TYPE_UPDATED',actor::text,now_at,command->>'commandId',jsonb_build_object('maintenanceType',target.maintenance_type,'rowVersion',target.row_version),jsonb_build_object('maintenanceType',desired,'rowVersion',next_version),jsonb_build_object('source','command_update_equipment_maintenance_type'));
  response:=jsonb_build_object('success',true,'value',jsonb_build_object('id',target.id,'maintenanceType',desired,'rowVersion',next_version),'disposition','ACCEPTED','serverOccurredAt',now_at,'refresh',jsonb_build_array(target.id));
  RETURN erp.finish_operational_command(command,'UPDATE_EQUIPMENT_MAINTENANCE_TYPE','EQUIPMENT',target.id,tenant,actor::text,payload_hash,response,next_version);
END $$;

ALTER FUNCTION erp.effective_equipment_meter_capability(text,text) OWNER TO postgres;
ALTER FUNCTION erp.command_update_equipment_maintenance_type(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.effective_equipment_meter_capability(text,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION erp.command_update_equipment_maintenance_type(jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION erp.command_update_equipment_maintenance_type(jsonb) TO authenticated;
COMMIT;
