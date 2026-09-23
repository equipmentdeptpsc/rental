BEGIN;

SET LOCAL search_path=erp,auth,extensions,pg_catalog;

-- The existing table remains the immutable evidence store.  These nullable
-- additions deliberately leave historical/generic meter rows untouched.
ALTER TABLE erp.deur_meter_checkpoints
  ADD COLUMN IF NOT EXISTS sequence_no integer,
  ADD COLUMN IF NOT EXISTS meter_dimension text,
  ADD COLUMN IF NOT EXISTS location_name text,
  ADD COLUMN IF NOT EXISTS custodian_operator_id text REFERENCES erp.operators(id);

ALTER TABLE erp.deur_meter_checkpoints
  ADD CONSTRAINT ck_deur_meter_checkpoints_canonical_travel_shape CHECK (
    meter_dimension IS NULL
    OR (
      kind='checkpoint'
      AND meter_dimension='odometer'
      AND sequence_no IS NOT NULL AND sequence_no>0
      AND custodian_operator_id IS NOT NULL
    )
  ) NOT VALID;

CREATE UNIQUE INDEX IF NOT EXISTS uq_deur_meter_checkpoints_travel_sequence
  ON erp.deur_meter_checkpoints(deur_id,sequence_no)
  WHERE kind='checkpoint' AND meter_dimension='odometer';
CREATE INDEX IF NOT EXISTS ix_deur_meter_checkpoints_travel_history
  ON erp.deur_meter_checkpoints(company_id,deur_id,sequence_no)
  WHERE kind='checkpoint' AND meter_dimension='odometer';

CREATE OR REPLACE FUNCTION erp.command_record_deur_travel_checkpoint(command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=erp,auth,extensions,pg_catalog AS $$
DECLARE
  tenant text:=erp.current_company_id(); scope jsonb; idem jsonb; payload_hash text;
  now_at timestamptz:=erp.deur_operational_clock(); current_deur erp.deurs%ROWTYPE;
  line erp.rental_equipment_lines%ROWTYPE; checkpoint erp.deur_meter_checkpoints%ROWTYPE;
  policy text; odometer numeric; predecessor numeric; next_sequence integer;
  client_occurred_at timestamptz; latitude numeric; longitude numeric; location jsonb;
  response jsonb;
BEGIN
  IF nullif(btrim(command->>'commandId'),'') IS NULL OR nullif(btrim(command->>'idempotencyKey'),'') IS NULL
     OR nullif(btrim(command->>'deurId'),'') IS NULL OR nullif(btrim(command->>'expectedVersion'),'') IS NULL
     OR nullif(btrim(command->>'odometer'),'') IS NULL THEN
    RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED');
  END IF;
  scope:=erp.validate_deur_custody_command_scope(command,'deur.create');
  IF scope->>'code'<>'OK' THEN RETURN jsonb_build_object('success',false,'code',scope->>'code'); END IF;
  idem:=erp.begin_deur_command(command,'RECORD_DEUR_TRAVEL_CHECKPOINT');
  IF idem->>'state'='MISMATCH' THEN RETURN jsonb_build_object('success',false,'code','IDEMPOTENCY_MISMATCH'); END IF;
  IF idem->>'state'='REPLAY' THEN RETURN (idem->'response')||jsonb_build_object('disposition','REPLAYED'); END IF;
  payload_hash:=idem->>'payloadHash';
  SELECT * INTO current_deur FROM erp.deurs WHERE id=command->>'deurId' AND company_id=tenant FOR UPDATE;
  IF current_deur.id IS NULL THEN RETURN jsonb_build_object('success',false,'code','NOT_FOUND'); END IF;
  IF erp.current_deur_authorized_operator(current_deur.id) IS DISTINCT FROM command->>'operatorId' THEN
    RETURN jsonb_build_object('success',false,'code','OWNERSHIP_MISMATCH');
  END IF;
  BEGIN
    IF current_deur.row_version<>(command->>'expectedVersion')::bigint THEN
      RETURN jsonb_build_object('success',false,'code','CONFLICT','aggregateId',current_deur.id,
        'expectedVersion',(command->>'expectedVersion')::bigint,'currentVersion',current_deur.row_version,'refreshRequired',true);
    END IF;
    odometer:=(command->>'odometer')::numeric;
    client_occurred_at:=nullif(command->>'clientOccurredAt','')::timestamptz;
    latitude:=nullif(command->>'latitude','')::numeric;
    longitude:=nullif(command->>'longitude','')::numeric;
  EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
    RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED');
  END;
  IF current_deur.status<>'In Progress' OR odometer<0 THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;
  SELECT * INTO line FROM erp.rental_equipment_lines WHERE id=current_deur.rental_equipment_line_id AND company_id=tenant;
  policy:=line.operational_metadata#>>'{deurExpectationSnapshot,meterRequirement}';
  IF policy NOT IN ('odometer','both') THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;
  IF (latitude IS NULL)<>(longitude IS NULL) OR (latitude IS NOT NULL AND (latitude<-90 OR latitude>90 OR longitude<-180 OR longitude>180)) THEN
    RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED');
  END IF;
  IF nullif(btrim(command->>'locationName'),'') IS NOT NULL AND (length(btrim(command->>'locationName'))>200 OR command->>'locationName'~'[[:cntrl:]]') THEN
    RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED');
  END IF;
  SELECT reading INTO predecessor FROM erp.deur_meter_checkpoints
    WHERE deur_id=current_deur.id AND kind='checkpoint' AND meter_dimension='odometer'
    ORDER BY sequence_no DESC LIMIT 1;
  IF predecessor IS NULL THEN
    predecessor:=CASE WHEN policy='odometer' THEN coalesce(current_deur.opening_odometer,current_deur.opening_meter)
                      ELSE current_deur.opening_odometer END;
  END IF;
  IF predecessor IS NOT NULL AND odometer<predecessor THEN
    RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED','message','Odometer rollback is not allowed.');
  END IF;
  SELECT coalesce(max(sequence_no),0)+1 INTO next_sequence FROM erp.deur_meter_checkpoints
    WHERE deur_id=current_deur.id AND kind='checkpoint' AND meter_dimension='odometer';
  location:=CASE WHEN latitude IS NULL THEN NULL ELSE jsonb_build_object('latitude',latitude,'longitude',longitude) END;
  INSERT INTO erp.deur_meter_checkpoints(company_id,deur_id,rental_equipment_line_id,equipment_id,operator_id,kind,reading,client_occurred_at,location,created_by,sequence_no,meter_dimension,location_name,custodian_operator_id)
  VALUES(tenant,current_deur.id,current_deur.rental_equipment_line_id,current_deur.equipment_id,current_deur.operator_id,'checkpoint',odometer,client_occurred_at,location,auth.uid(),next_sequence,'odometer',nullif(btrim(command->>'locationName'),''),command->>'operatorId')
  RETURNING * INTO checkpoint;
  UPDATE erp.deurs SET updated_at=now_at,updated_by=auth.uid()::text WHERE id=current_deur.id RETURNING * INTO current_deur;
  INSERT INTO erp.audit_log(id,company_id,aggregate_type,aggregate_id,action,actor_id,occurred_at,correlation_id,new_values)
  VALUES(extensions.gen_random_uuid()::text,tenant,'DEUR',current_deur.id,'RECORD_DEUR_TRAVEL_CHECKPOINT',auth.uid()::text,now_at,command->>'commandId',
    jsonb_build_object('checkpointId',checkpoint.id,'sequence',checkpoint.sequence_no,'odometer',checkpoint.reading,'custodianOperatorId',checkpoint.custodian_operator_id));
  response:=jsonb_build_object('success',true,'disposition','ACCEPTED','record',to_jsonb(current_deur),'version',current_deur.row_version,'serverOccurredAt',now_at,
    'value',jsonb_build_object('checkpointId',checkpoint.id,'sequence',checkpoint.sequence_no,'odometer',checkpoint.reading));
  RETURN erp.finish_deur_command(command,'RECORD_DEUR_TRAVEL_CHECKPOINT',current_deur.id,payload_hash,response);
END $$;

CREATE OR REPLACE FUNCTION erp.read_deur_travel_checkpoint_history(target_deur_id text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=erp,auth,extensions,pg_catalog AS $$
DECLARE tenant text:=erp.current_company_id(); actor erp.users%ROWTYPE; target erp.deurs%ROWTYPE; checkpoints jsonb;
BEGIN
  IF tenant IS NULL OR auth.uid() IS NULL THEN RETURN jsonb_build_object('success',false,'code','UNAUTHENTICATED'); END IF;
  SELECT * INTO actor FROM erp.users WHERE id=auth.uid() AND company_id=tenant AND status='active';
  SELECT * INTO target FROM erp.deurs WHERE id=target_deur_id AND company_id=tenant;
  IF target.id IS NULL THEN RETURN jsonb_build_object('success',false,'code','NOT_FOUND'); END IF;
  IF actor.operator_id IS NOT NULL AND erp.current_deur_authorized_operator(target.id) IS DISTINCT FROM actor.operator_id THEN
    RETURN jsonb_build_object('success',false,'code','OWNERSHIP_MISMATCH');
  END IF;
  IF actor.operator_id IS NULL AND NOT erp.current_user_has_any_read_permission(ARRAY['deur.read','deur.review','deur.acknowledge']) THEN
    RETURN jsonb_build_object('success',false,'code','FORBIDDEN');
  END IF;
  SELECT coalesce(jsonb_agg(history.payload ORDER BY history.sequence_no),'[]'::jsonb) INTO checkpoints
  FROM (
    SELECT checkpoint.sequence_no,jsonb_build_object('checkpointId',checkpoint.id,'sequence',checkpoint.sequence_no,
      'displayLabel','Point '||checkpoint.sequence_no,'odometer',checkpoint.reading,'clientOccurredAt',checkpoint.client_occurred_at,
      'serverAcceptedAt',checkpoint.server_accepted_at,'locationName',checkpoint.location_name,
      'latitude',checkpoint.location->>'latitude','longitude',checkpoint.location->>'longitude,
      'distanceFromPrevious',checkpoint.reading-coalesce(lag(checkpoint.reading) over (ORDER BY checkpoint.sequence_no),
        CASE WHEN (SELECT operational_metadata#>>'{deurExpectationSnapshot,meterRequirement}' FROM erp.rental_equipment_lines WHERE id=target.rental_equipment_line_id)='odometer' THEN coalesce(target.opening_odometer,target.opening_meter) ELSE target.opening_odometer END),
      'custodianOperatorId',checkpoint.custodian_operator_id,'source','TRAVEL_ODOMETER') AS payload
    FROM erp.deur_meter_checkpoints checkpoint
    WHERE checkpoint.deur_id=target.id AND checkpoint.kind='checkpoint' AND checkpoint.meter_dimension='odometer'
  ) AS history;
  RETURN jsonb_build_object('success',true,'deurId',target.id,'checkpoints',checkpoints);
END $$;

REVOKE ALL ON FUNCTION erp.command_record_deur_travel_checkpoint(jsonb),erp.read_deur_travel_checkpoint_history(text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION erp.command_record_deur_travel_checkpoint(jsonb),erp.read_deur_travel_checkpoint_history(text) TO authenticated;

COMMIT;
