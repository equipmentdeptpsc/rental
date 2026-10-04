BEGIN;
SET LOCAL search_path=erp,auth,extensions,pg_catalog;
-- Immutable, tenant-scoped field evidence.  Fuel efficiency is intentionally
-- derived by the read model below, never stored as mutable business authority.
CREATE TABLE erp.deur_refuels (
  id text PRIMARY KEY DEFAULT extensions.gen_random_uuid()::text,
  company_id text NOT NULL REFERENCES erp.companies(id),
  equipment_id text NOT NULL REFERENCES erp.equipment(id),
  rental_id text NOT NULL REFERENCES erp.rentals(id),
  rental_equipment_line_id text NOT NULL REFERENCES erp.rental_equipment_lines(id),
  assignment_id text REFERENCES erp.assignments(id),
  deur_id text NOT NULL REFERENCES erp.deurs(id),
  custodian_operator_id text NOT NULL REFERENCES erp.operators(id),
  odometer numeric NOT NULL CHECK (odometer >= 0),
  liters numeric NOT NULL CHECK (liters > 0),
  location_name text,
  client_occurred_at timestamptz,
  server_accepted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  created_by uuid NOT NULL REFERENCES erp.users(id),
  command_id text NOT NULL,
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT ck_deur_refuels_location_name CHECK (location_name IS NULL OR (length(location_name) <= 200 AND location_name !~ '[[:cntrl:]]')),
  CONSTRAINT uq_deur_refuels_command UNIQUE (company_id, command_id),
  CONSTRAINT uq_deur_refuels_idempotency UNIQUE (company_id, idempotency_key)
);
CREATE INDEX ix_deur_refuels_equipment_feed ON erp.deur_refuels(company_id,equipment_id,server_accepted_at DESC);
CREATE INDEX ix_deur_refuels_deur_history ON erp.deur_refuels(company_id,deur_id,server_accepted_at DESC);
CREATE OR REPLACE FUNCTION erp.command_record_deur_refuel(command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=erp,auth,extensions,pg_catalog AS $$
DECLARE
  tenant text:=erp.current_company_id(); scope jsonb; idem jsonb; payload_hash text;
  target erp.deurs%ROWTYPE; line erp.rental_equipment_lines%ROWTYPE; created erp.deur_refuels%ROWTYPE;
  now_at timestamptz:=erp.deur_operational_clock(); odometer_value numeric; liters_value numeric;
  predecessor numeric; response jsonb;
BEGIN
  IF nullif(btrim(command->>'commandId'),'') IS NULL OR nullif(btrim(command->>'idempotencyKey'),'') IS NULL
    OR nullif(btrim(command->>'deurId'),'') IS NULL OR nullif(btrim(command->>'expectedVersion'),'') IS NULL
    OR nullif(btrim(command->>'odometer'),'') IS NULL OR nullif(btrim(command->>'liters'),'') IS NULL THEN
    RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED');
  END IF;
  scope:=erp.validate_deur_custody_command_scope(command,'deur.create');
  IF scope->>'code'<>'OK' THEN RETURN jsonb_build_object('success',false,'code',scope->>'code'); END IF;
  idem:=erp.begin_deur_command(command,'RECORD_DEUR_REFUEL');
  IF idem->>'state'='MISMATCH' THEN RETURN jsonb_build_object('success',false,'code','IDEMPOTENCY_MISMATCH'); END IF;
  IF idem->>'state'='REPLAY' THEN RETURN (idem->'response')||jsonb_build_object('disposition','REPLAYED'); END IF;
  payload_hash:=idem->>'payloadHash';
  SELECT * INTO target FROM erp.deurs WHERE id=command->>'deurId' AND company_id=tenant FOR UPDATE;
  IF target.id IS NULL THEN RETURN jsonb_build_object('success',false,'code','NOT_FOUND'); END IF;
  IF erp.current_deur_authorized_operator(target.id) IS DISTINCT FROM command->>'operatorId' THEN RETURN jsonb_build_object('success',false,'code','OWNERSHIP_MISMATCH'); END IF;
  BEGIN
    odometer_value:=(command->>'odometer')::numeric; liters_value:=(command->>'liters')::numeric;
    IF target.row_version<>(command->>'expectedVersion')::bigint THEN RETURN jsonb_build_object('success',false,'code','CONFLICT','currentVersion',target.row_version,'refreshRequired',true); END IF;
  EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END;
  IF target.status<>'In Progress' OR odometer_value<0 OR liters_value<=0 THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;
  SELECT * INTO line FROM erp.rental_equipment_lines WHERE id=target.rental_equipment_line_id AND company_id=tenant;
  IF line.id IS NULL OR line.operational_metadata#>>'{deurExpectationSnapshot,meterRequirement}' NOT IN ('odometer','both') THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;
  IF nullif(btrim(command->>'locationName'),'') IS NOT NULL AND (length(btrim(command->>'locationName'))>200 OR command->>'locationName'~'[[:cntrl:]]') THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;
  -- A monotonic predecessor never draws from ambiguous generic dual-meter evidence.
  SELECT max(candidate.reading) INTO predecessor FROM (
    SELECT refuel.odometer AS reading FROM erp.deur_refuels refuel WHERE refuel.company_id=tenant AND refuel.equipment_id=target.equipment_id
    UNION ALL
    SELECT checkpoint.reading FROM erp.deur_meter_checkpoints checkpoint WHERE checkpoint.company_id=tenant AND checkpoint.equipment_id=target.equipment_id AND checkpoint.kind='checkpoint' AND checkpoint.meter_dimension='odometer'
    UNION ALL
    SELECT CASE WHEN line.operational_metadata#>>'{deurExpectationSnapshot,meterRequirement}'='odometer' THEN coalesce(target.opening_odometer,target.opening_meter) ELSE target.opening_odometer END
  ) candidate WHERE candidate.reading IS NOT NULL;
  IF predecessor IS NOT NULL AND odometer_value<predecessor THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED','message','Odometer rollback is not allowed.'); END IF;
  INSERT INTO erp.deur_refuels(company_id,equipment_id,rental_id,rental_equipment_line_id,assignment_id,deur_id,custodian_operator_id,odometer,liters,location_name,client_occurred_at,server_accepted_at,created_by,command_id,idempotency_key)
  VALUES(tenant,target.equipment_id,target.rental_id,target.rental_equipment_line_id,target.assignment_id,target.id,command->>'operatorId',odometer_value,liters_value,nullif(btrim(command->>'locationName'),''),nullif(command->>'clientOccurredAt','')::timestamptz,now_at,auth.uid(),command->>'commandId',command->>'idempotencyKey') RETURNING * INTO created;
  UPDATE erp.deurs SET updated_at=now_at,updated_by=auth.uid()::text WHERE id=target.id RETURNING * INTO target;
  response:=jsonb_build_object('success',true,'disposition','ACCEPTED','record',to_jsonb(target),'version',target.row_version,'serverOccurredAt',now_at,'value',jsonb_build_object('refuelId',created.id,'odometer',created.odometer,'liters',created.liters));
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
  IF actor.operator_id IS NULL AND NOT (erp.current_user_has_permission('deur.read') OR erp.current_user_has_permission('deur.review') OR erp.current_user_has_permission('deur.acknowledge')) THEN RETURN jsonb_build_object('success',false,'code','FORBIDDEN'); END IF;
  IF actor.operator_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM erp.deur_refuels r WHERE r.company_id=tenant AND r.equipment_id=target_equipment_id AND r.custodian_operator_id=actor.operator_id) AND NOT EXISTS (SELECT 1 FROM erp.deurs d WHERE d.company_id=tenant AND d.equipment_id=target_equipment_id AND erp.current_deur_authorized_operator(d.id)=actor.operator_id) THEN RETURN jsonb_build_object('success',false,'code','OWNERSHIP_MISMATCH'); END IF;
  SELECT coalesce(jsonb_agg(row_payload ORDER BY server_accepted_at DESC),'[]'::jsonb) INTO history FROM (
    SELECT r.server_accepted_at,jsonb_build_object('refuelId',r.id,'deurId',r.deur_id,'odometer',r.odometer,'liters',r.liters,'locationName',r.location_name,'clientOccurredAt',r.client_occurred_at,'serverAcceptedAt',r.server_accepted_at,'fuelEfficiency',CASE WHEN lag(r.odometer) OVER (ORDER BY r.server_accepted_at) IS NULL THEN NULL ELSE (r.odometer-lag(r.odometer) OVER (ORDER BY r.server_accepted_at))/nullif(r.liters,0) END) row_payload
    FROM erp.deur_refuels r WHERE r.company_id=tenant AND r.equipment_id=target_equipment_id
  ) projected;
  RETURN jsonb_build_object('success',true,'equipmentId',target_equipment_id,'refuels',history);
END $$;
ALTER TABLE erp.deur_refuels ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON erp.deur_refuels FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION erp.command_record_deur_refuel(jsonb),erp.read_equipment_refuel_history(text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION erp.command_record_deur_refuel(jsonb),erp.read_equipment_refuel_history(text) TO authenticated;
COMMIT;
