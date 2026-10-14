BEGIN;
SET LOCAL search_path=erp,auth,extensions,pg_catalog;

-- Existing odometer evidence remains unchanged. An hour-meter-only Rental may
-- record fuel with its own monotonic meter dimension, never a fabricated odo.
ALTER TABLE erp.deur_refuels ALTER COLUMN odometer DROP NOT NULL;
ALTER TABLE erp.deur_refuels
  ADD COLUMN hour_meter numeric,
  ADD COLUMN meter_dimension text NOT NULL DEFAULT 'odometer',
  ADD CONSTRAINT deur_refuels_meter_evidence_check CHECK (
    (meter_dimension='odometer' AND odometer IS NOT NULL AND odometer>=0 AND hour_meter IS NULL)
    OR (meter_dimension='hourMeter' AND hour_meter IS NOT NULL AND hour_meter>=0 AND odometer IS NULL)
  );

CREATE OR REPLACE FUNCTION erp.command_record_deur_refuel(command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=erp,auth,extensions,pg_catalog AS $$
DECLARE
  tenant text:=erp.current_company_id(); scope jsonb; idem jsonb; payload_hash text;
  target erp.deurs%ROWTYPE; line erp.rental_equipment_lines%ROWTYPE; created erp.deur_refuels%ROWTYPE;
  now_at timestamptz:=erp.deur_operational_clock(); odometer_value numeric; hour_value numeric;
  liters_value numeric; predecessor numeric; policy text; dimension text; response jsonb;
BEGIN
  IF nullif(btrim(command->>'commandId'),'') IS NULL OR nullif(btrim(command->>'idempotencyKey'),'') IS NULL
    OR nullif(btrim(command->>'deurId'),'') IS NULL OR nullif(btrim(command->>'expectedVersion'),'') IS NULL
    OR nullif(btrim(command->>'liters'),'') IS NULL
  THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;
  scope:=erp.validate_deur_custody_command_scope(command,'deur.create');
  IF scope->>'code'<>'OK' THEN RETURN jsonb_build_object('success',false,'code',scope->>'code'); END IF;
  idem:=erp.begin_deur_command(command,'RECORD_DEUR_REFUEL');
  IF idem->>'state'='MISMATCH' THEN RETURN jsonb_build_object('success',false,'code','IDEMPOTENCY_MISMATCH'); END IF;
  IF idem->>'state'='REPLAY' THEN RETURN (idem->'response')||jsonb_build_object('disposition','REPLAYED'); END IF;
  payload_hash:=idem->>'payloadHash';
  SELECT * INTO target FROM erp.deurs WHERE id=command->>'deurId' AND company_id=tenant FOR UPDATE;
  IF target.id IS NULL THEN RETURN jsonb_build_object('success',false,'code','NOT_FOUND'); END IF;
  IF erp.current_deur_authorized_operator(target.id) IS DISTINCT FROM command->>'operatorId'
  THEN RETURN jsonb_build_object('success',false,'code','OWNERSHIP_MISMATCH'); END IF;
  BEGIN
    odometer_value:=nullif(btrim(command->>'odometer'),'')::numeric;
    hour_value:=nullif(btrim(command->>'hourMeter'),'')::numeric;
    liters_value:=(command->>'liters')::numeric;
    IF target.row_version<>(command->>'expectedVersion')::bigint
    THEN RETURN jsonb_build_object('success',false,'code','CONFLICT','currentVersion',target.row_version,'refreshRequired',true); END IF;
  EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range
    THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END;
  IF target.status<>'In Progress' OR liters_value<=0 OR
    (odometer_value IS NULL AND hour_value IS NULL) OR (odometer_value IS NOT NULL AND hour_value IS NOT NULL) OR
    coalesce(odometer_value<0,false) OR coalesce(hour_value<0,false)
  THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;
  IF EXISTS (SELECT 1 FROM erp.deur_events WHERE deur_id=target.id AND activity_type='shift' AND action='end')
  THEN RETURN jsonb_build_object('success',false,'code','INVALID_TRANSITION'); END IF;
  SELECT * INTO line FROM erp.rental_equipment_lines WHERE id=target.rental_equipment_line_id AND company_id=tenant;
  policy:=line.operational_metadata#>>'{deurExpectationSnapshot,meterRequirement}';
  IF line.id IS NULL OR NOT (
    (policy='hourMeter' AND hour_value IS NOT NULL AND odometer_value IS NULL) OR
    (policy IN ('odometer','both') AND odometer_value IS NOT NULL AND hour_value IS NULL))
  THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;
  IF nullif(btrim(command->>'locationName'),'') IS NOT NULL AND
    (length(btrim(command->>'locationName'))>200 OR command->>'locationName'~'[[:cntrl:]]')
  THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;
  dimension:=CASE WHEN hour_value IS NOT NULL THEN 'hourMeter' ELSE 'odometer' END;
  IF dimension='odometer' THEN
    SELECT max(candidate.reading) INTO predecessor FROM (
      SELECT refuel.odometer AS reading FROM erp.deur_refuels refuel
        WHERE refuel.company_id=tenant AND refuel.equipment_id=target.equipment_id AND refuel.meter_dimension='odometer'
      UNION ALL SELECT checkpoint.reading FROM erp.deur_meter_checkpoints checkpoint
        WHERE checkpoint.company_id=tenant AND checkpoint.equipment_id=target.equipment_id
          AND checkpoint.kind='checkpoint' AND checkpoint.meter_dimension='odometer'
      UNION ALL SELECT CASE WHEN policy='odometer' THEN coalesce(target.opening_odometer,target.opening_meter)
        ELSE target.opening_odometer END
    ) candidate WHERE candidate.reading IS NOT NULL;
  ELSE
    SELECT max(candidate.reading) INTO predecessor FROM (
      SELECT refuel.hour_meter AS reading FROM erp.deur_refuels refuel
        WHERE refuel.company_id=tenant AND refuel.equipment_id=target.equipment_id AND refuel.meter_dimension='hourMeter'
      UNION ALL SELECT coalesce(target.opening_hour_meter,target.opening_meter)
    ) candidate WHERE candidate.reading IS NOT NULL;
  END IF;
  IF predecessor IS NOT NULL AND coalesce(hour_value,odometer_value)<predecessor
  THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED',
    'message',CASE dimension WHEN 'hourMeter' THEN 'Hour-meter rollback is not allowed.'
      ELSE 'Odometer rollback is not allowed.' END); END IF;
  INSERT INTO erp.deur_refuels(company_id,equipment_id,rental_id,rental_equipment_line_id,assignment_id,
    deur_id,custodian_operator_id,odometer,hour_meter,meter_dimension,liters,location_name,
    client_occurred_at,server_accepted_at,created_by,command_id,idempotency_key)
  VALUES(tenant,target.equipment_id,target.rental_id,target.rental_equipment_line_id,target.assignment_id,
    target.id,command->>'operatorId',odometer_value,hour_value,dimension,liters_value,
    nullif(btrim(command->>'locationName'),''),nullif(command->>'clientOccurredAt','')::timestamptz,
    now_at,auth.uid(),command->>'commandId',command->>'idempotencyKey') RETURNING * INTO created;
  UPDATE erp.deurs SET updated_at=now_at,updated_by=auth.uid()::text WHERE id=target.id RETURNING * INTO target;
  response:=jsonb_build_object('success',true,'disposition','ACCEPTED','record',to_jsonb(target),
    'version',target.row_version,'serverOccurredAt',now_at,'value',
    jsonb_build_object('refuelId',created.id,'meterDimension',created.meter_dimension,
      'odometer',created.odometer,'hourMeter',created.hour_meter,'liters',created.liters));
  RETURN erp.finish_deur_command(command,'RECORD_DEUR_REFUEL',target.id,payload_hash,response);
END $$;

CREATE OR REPLACE FUNCTION erp.read_equipment_refuel_history(target_equipment_id text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=erp,auth,extensions,pg_catalog AS $$
DECLARE tenant text:=erp.current_company_id(); actor erp.users%ROWTYPE; history jsonb;
BEGIN
  IF tenant IS NULL OR auth.uid() IS NULL THEN RETURN jsonb_build_object('success',false,'code','UNAUTHENTICATED'); END IF;
  SELECT * INTO actor FROM erp.users WHERE id=auth.uid() AND company_id=tenant AND status='active';
  IF actor.id IS NULL THEN RETURN jsonb_build_object('success',false,'code','UNAUTHENTICATED'); END IF;
  IF actor.operator_id IS NULL AND NOT (erp.current_user_has_permission('deur.read')
    OR erp.current_user_has_permission('deur.review') OR erp.current_user_has_permission('deur.acknowledge'))
  THEN RETURN jsonb_build_object('success',false,'code','FORBIDDEN'); END IF;
  IF actor.operator_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM erp.deur_refuels r
      WHERE r.company_id=tenant AND r.equipment_id=target_equipment_id AND r.custodian_operator_id=actor.operator_id)
    AND NOT EXISTS (SELECT 1 FROM erp.deurs d WHERE d.company_id=tenant AND d.equipment_id=target_equipment_id
      AND erp.current_deur_authorized_operator(d.id)=actor.operator_id)
  THEN RETURN jsonb_build_object('success',false,'code','OWNERSHIP_MISMATCH'); END IF;
  SELECT coalesce(jsonb_agg(row_payload ORDER BY server_accepted_at DESC),'[]'::jsonb) INTO history FROM (
    SELECT r.server_accepted_at,jsonb_build_object('refuelId',r.id,'deurId',r.deur_id,
      'meterDimension',r.meter_dimension,'odometer',r.odometer,'hourMeter',r.hour_meter,
      'liters',r.liters,'locationName',r.location_name,'clientOccurredAt',r.client_occurred_at,
      'serverAcceptedAt',r.server_accepted_at,'fuelEfficiency',
      CASE WHEN r.meter_dimension='odometer' THEN
        (r.odometer-lag(r.odometer) OVER (PARTITION BY r.meter_dimension ORDER BY r.server_accepted_at,r.id))/nullif(r.liters,0)
        ELSE NULL END) row_payload
    FROM erp.deur_refuels r WHERE r.company_id=tenant AND r.equipment_id=target_equipment_id
  ) projected;
  RETURN jsonb_build_object('success',true,'equipmentId',target_equipment_id,'refuels',history);
END $$;

ALTER FUNCTION erp.command_record_deur_refuel(jsonb) OWNER TO postgres;
ALTER FUNCTION erp.read_equipment_refuel_history(text) OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.command_record_deur_refuel(jsonb),erp.read_equipment_refuel_history(text)
  FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION erp.command_record_deur_refuel(jsonb),erp.read_equipment_refuel_history(text)
  TO authenticated;
COMMIT;
