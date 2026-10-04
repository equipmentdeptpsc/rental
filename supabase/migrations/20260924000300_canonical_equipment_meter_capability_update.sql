BEGIN;
SET LOCAL search_path=erp,auth,extensions,pg_catalog;
CREATE OR REPLACE FUNCTION erp.command_update_equipment_meter_capability(command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,auth,extensions,pg_catalog AS $$
DECLARE tenant uuid; actor uuid; target erp.equipment; idem jsonb; next_version bigint; capability text;
BEGIN
  tenant:=erp.current_company_id(); actor:=auth.uid(); capability:=nullif(btrim(command->>'meterCapability'),'');
  IF tenant IS NULL OR actor IS NULL THEN RETURN jsonb_build_object('success',false,'code','UNAUTHENTICATED','message','Authentication is required.','retryable',false,'refreshRequired',false); END IF;
  IF NOT erp.current_user_has_permission('equipment.update') THEN RETURN jsonb_build_object('success',false,'code','FORBIDDEN','message','Equipment update permission is required.','retryable',false,'refreshRequired',false); END IF;
  IF command ?| ARRAY['companyId','createdBy','updatedBy'] OR nullif(command->>'equipmentId','') IS NULL OR capability NOT IN('none','hourMeter','odometer','both') THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED','message','A valid Equipment meter capability is required.','retryable',false,'refreshRequired',false); END IF;
  SELECT * INTO target FROM erp.equipment WHERE id=command->>'equipmentId' AND company_id=tenant AND deleted_at IS NULL FOR UPDATE;
  IF target.id IS NULL THEN RETURN jsonb_build_object('success',false,'code','NOT_FOUND','message','Equipment is unavailable.','retryable',false,'refreshRequired',false); END IF;
  IF target.row_version<>coalesce((command->>'expectedVersion')::bigint,target.row_version) THEN RETURN jsonb_build_object('success',false,'code','CONFLICT','message','Equipment version is stale.','retryable',false,'refreshRequired',true,'currentVersion',target.row_version); END IF;
  idem:=erp.begin_operational_command(command,'UPDATE_EQUIPMENT_METER_CAPABILITY','EQUIPMENT',target.id,tenant,actor::text);
  IF idem->>'state'='MISMATCH' THEN RETURN jsonb_build_object('success',false,'code','IDEMPOTENCY_MISMATCH','message','This request conflicts with an earlier submission.','retryable',false,'refreshRequired',false); END IF;
  IF idem->>'state'='COMPLETED' THEN RETURN (idem->'response'); END IF;
  UPDATE erp.equipment SET meter_capability=capability,updated_at=clock_timestamp(),updated_by=actor::text,row_version=row_version+1 WHERE id=target.id RETURNING row_version INTO next_version;
  INSERT INTO erp.audit_log(id,company_id,aggregate_type,aggregate_id,action,actor_id,occurred_at,correlation_id,previous_values,new_values,metadata)
  VALUES(extensions.gen_random_uuid()::text,tenant,'Equipment',target.id,'EQUIPMENT_METER_CAPABILITY_UPDATED',actor::text,clock_timestamp(),command->>'commandId',jsonb_build_object('meterCapability',target.meter_capability,'rowVersion',target.row_version),jsonb_build_object('meterCapability',capability,'rowVersion',next_version),jsonb_build_object('source','command_update_equipment_meter_capability'));
  RETURN jsonb_build_object('success',true,'value',jsonb_build_object('id',target.id,'meterCapability',capability,'rowVersion',next_version),'disposition','ACCEPTED');
EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('success',false,'code','PERSISTENCE_FAILURE','message','Equipment meter capability could not be updated.','retryable',false,'refreshRequired',true);
END $$;
REVOKE ALL ON FUNCTION erp.command_update_equipment_meter_capability(jsonb) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION erp.command_update_equipment_meter_capability(jsonb) TO authenticated;
COMMIT;
