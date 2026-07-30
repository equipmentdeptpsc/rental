BEGIN;
SET search_path TO erp, pg_catalog;

-- Test determinism is owner-only and transaction-local. Normal PostgREST
-- sessions always receive the real database clock even if they set a custom GUC.
CREATE FUNCTION deur_operational_clock()
RETURNS timestamptz
LANGUAGE plpgsql
SET search_path=pg_catalog
AS $$
DECLARE
  configured text;
  database_owner name;
BEGIN
  SELECT pg_get_userbyid(datdba) INTO database_owner
  FROM pg_database WHERE datname=current_database();
  IF session_user=database_owner THEN
    configured=nullif(current_setting('erp.c4c_test_clock',true),'');
    IF configured IS NOT NULL THEN RETURN configured::timestamptz; END IF;
  END IF;
  RETURN clock_timestamp();
END $$;
REVOKE ALL ON FUNCTION deur_operational_clock() FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION enforce_deur_operational_clock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=erp,pg_catalog
AS $$
BEGIN
  IF NEW.source='server' THEN
    NEW.occurred_at=deur_operational_clock();
    NEW.server_accepted_at=NEW.occurred_at;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION enforce_deur_operational_clock() FROM PUBLIC,anon,authenticated,service_role;

DROP TRIGGER IF EXISTS deur_events_operational_clock ON deur_events;
CREATE TRIGGER deur_events_operational_clock
BEFORE INSERT ON deur_events
FOR EACH ROW EXECUTE FUNCTION enforce_deur_operational_clock();

ALTER TABLE deurs ADD COLUMN total_standby_minutes integer NOT NULL DEFAULT 0;
ALTER TABLE deurs DROP CONSTRAINT ck_deur_minutes;
ALTER TABLE deurs ADD CONSTRAINT ck_deur_minutes CHECK (
  total_operating_minutes>=0 AND total_idle_minutes>=0 AND
  total_standby_minutes>=0 AND total_maintenance_minutes>=0 AND
  total_meal_break_minutes>=0 AND total_mobilization_minutes>=0 AND
  total_demobilization_minutes>=0
);
ALTER TABLE deur_events DROP CONSTRAINT ck_deur_event_activity;
ALTER TABLE deur_events ADD CONSTRAINT ck_deur_event_activity
  CHECK (activity_type IN ('shift','operation','idle','standby','mealBreak','breakdown'));

CREATE OR REPLACE FUNCTION command_transition_deur_activity(command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,auth AS $$
DECLARE
  scope jsonb; idem jsonb; now_at timestamptz=deur_operational_clock();
  current_deur deurs; response jsonb; payload_hash text;
  next_activity text; next_sequence integer; open_activity text;
BEGIN
  scope=validate_deur_command_scope(command,'deur.create');
  IF scope->>'code'<>'OK' THEN RETURN jsonb_build_object('success',false,'code',scope->>'code'); END IF;
  idem=begin_deur_command(command,'ACTIVITY_TRANSITION');
  IF idem->>'state'='MISMATCH' THEN RETURN jsonb_build_object('success',false,'code','IDEMPOTENCY_MISMATCH'); END IF;
  IF idem->>'state'='REPLAY' THEN RETURN (idem->'response')||jsonb_build_object('disposition','REPLAYED'); END IF;
  payload_hash=idem->>'payloadHash';
  SELECT * INTO current_deur FROM deurs WHERE id=command->>'deurId' FOR UPDATE;
  IF current_deur.id IS NULL THEN RETURN jsonb_build_object('success',false,'code','NOT_FOUND'); END IF;
  IF current_deur.rental_equipment_line_id<>command->>'rentalLineId'
     OR current_deur.operator_id<>command->>'operatorId'
  THEN RETURN jsonb_build_object('success',false,'code','OWNERSHIP_MISMATCH'); END IF;
  IF current_deur.row_version<>(command->>'expectedVersion')::bigint THEN
    RETURN jsonb_build_object('success',false,'code','CONFLICT','aggregateId',current_deur.id,
      'expectedVersion',(command->>'expectedVersion')::bigint,'currentVersion',current_deur.row_version,'refreshRequired',true);
  END IF;
  IF current_deur.status<>'In Progress' THEN RETURN jsonb_build_object('success',false,'code','INVALID_TRANSITION'); END IF;
  SELECT activity_type INTO open_activity FROM deur_events
    WHERE deur_id=current_deur.id AND is_open AND activity_type<>'shift' FOR UPDATE;
  next_activity=CASE command->>'action'
    WHEN 'START_OPERATION' THEN 'operation' WHEN 'RESUME_OPERATION' THEN 'operation'
    WHEN 'START_IDLE' THEN 'idle' WHEN 'START_STANDBY' THEN 'standby'
    WHEN 'START_MEAL_BREAK' THEN 'mealBreak' WHEN 'START_BREAKDOWN' THEN 'breakdown'
    WHEN 'END_ACTIVITY' THEN NULL ELSE 'INVALID' END;
  IF next_activity='INVALID' OR next_activity IS NOT DISTINCT FROM open_activity THEN
    RETURN jsonb_build_object('success',false,'code','INVALID_TRANSITION');
  END IF;
  UPDATE deur_events SET is_open=false
    WHERE deur_id=current_deur.id AND is_open AND activity_type<>'shift';
  SELECT coalesce(max(sequence),0)+1 INTO next_sequence FROM deur_events WHERE deur_id=current_deur.id;
  IF open_activity IS NOT NULL THEN
    INSERT INTO deur_events(id,deur_id,activity_type,action,occurred_at,sequence,source,actor_id,server_accepted_at,client_created_at,command_id,idempotency_key,device_id,is_open)
    VALUES(gen_random_uuid()::text,current_deur.id,open_activity,'end',now_at,next_sequence,'server',auth.uid()::text,now_at,
      nullif(command->>'clientCreatedAt','')::timestamptz,command->>'commandId',command->>'idempotencyKey',command->>'deviceId',false);
    next_sequence=next_sequence+1;
  END IF;
  IF next_activity IS NOT NULL THEN
    INSERT INTO deur_events(id,deur_id,activity_type,action,occurred_at,sequence,source,actor_id,server_accepted_at,client_created_at,command_id,idempotency_key,device_id,is_open)
    VALUES(gen_random_uuid()::text,current_deur.id,next_activity,'start',now_at,next_sequence,'server',auth.uid()::text,now_at,
      nullif(command->>'clientCreatedAt','')::timestamptz,command->>'commandId',command->>'idempotencyKey',command->>'deviceId',true);
  END IF;
  UPDATE deurs SET updated_at=now_at,updated_by=auth.uid()::text
    WHERE id=current_deur.id RETURNING * INTO current_deur;
  INSERT INTO audit_log(id,aggregate_type,aggregate_id,action,actor_id,occurred_at,correlation_id,new_values)
  VALUES(gen_random_uuid()::text,'DEUR',current_deur.id,'ACTIVITY_TRANSITION',auth.uid()::text,now_at,
    command->>'commandId',jsonb_build_object('action',command->>'action'));
  response=jsonb_build_object('success',true,'disposition','ACCEPTED','record',to_jsonb(current_deur),
    'version',current_deur.row_version,'serverOccurredAt',now_at);
  RETURN finish_deur_command(command,'ACTIVITY_TRANSITION',current_deur.id,payload_hash,response);
END $$;

CREATE FUNCTION recalculate_deur_event_totals(target_deur_id text)
RETURNS TABLE(shift_minutes integer,operation_minutes integer,idle_minutes integer,standby_minutes integer,meal_break_minutes integer,breakdown_minutes integer)
LANGUAGE sql SECURITY DEFINER SET search_path=erp,pg_catalog AS $$
  WITH paired AS (
    SELECT activity_type,action,occurred_at,
      lead(action) OVER (PARTITION BY activity_type ORDER BY sequence) AS next_action,
      lead(occurred_at) OVER (PARTITION BY activity_type ORDER BY sequence) AS ended_at
    FROM deur_events WHERE deur_id=target_deur_id
  ), totals AS (
    SELECT activity_type,coalesce(sum(extract(epoch FROM (ended_at-occurred_at))/60),0)::integer AS minutes
    FROM paired WHERE action='start' AND next_action='end' GROUP BY activity_type
  )
  SELECT coalesce(max(minutes) FILTER(WHERE activity_type='shift'),0),
    coalesce(max(minutes) FILTER(WHERE activity_type='operation'),0),
    coalesce(max(minutes) FILTER(WHERE activity_type='idle'),0),
    coalesce(max(minutes) FILTER(WHERE activity_type='standby'),0),
    coalesce(max(minutes) FILTER(WHERE activity_type='mealBreak'),0),
    coalesce(max(minutes) FILTER(WHERE activity_type='breakdown'),0)
  FROM totals
$$;
REVOKE ALL ON FUNCTION recalculate_deur_event_totals(text) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION refresh_deur_totals_after_shift_end()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,pg_catalog AS $$
DECLARE calculated record;
BEGIN
  IF NEW.activity_type='shift' AND NEW.action='end' THEN
    SELECT * INTO calculated FROM recalculate_deur_event_totals(NEW.deur_id);
    UPDATE deurs SET
      total_operating_minutes=calculated.operation_minutes,
      total_idle_minutes=calculated.idle_minutes,
      total_standby_minutes=calculated.standby_minutes,
      total_meal_break_minutes=calculated.meal_break_minutes,
      total_maintenance_minutes=calculated.breakdown_minutes
    WHERE id=NEW.deur_id;
  END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION refresh_deur_totals_after_shift_end() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER deur_events_refresh_totals
AFTER INSERT ON deur_events FOR EACH ROW EXECUTE FUNCTION refresh_deur_totals_after_shift_end();

CREATE FUNCTION command_apply_deur_correction(command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,auth,pg_catalog AS $$
DECLARE
  tenant text=current_company_id(); target deurs; source deurs; event jsonb;
  idem jsonb; payload_hash text; response jsonb; now_at timestamptz=clock_timestamp();
  patch jsonb=coalesce(command->'patch','{}'::jsonb); allowed text[]=
    ARRAY['events','openingMeter','closingMeter','projectId','reason'];
  sequence_expected integer=1; shift_open boolean=false; shift_closed boolean=false;
  open_activity text=NULL; last_at timestamptz=NULL; event_at timestamptz;
  event_activity text; event_action text; calculated record; prior jsonb;
BEGIN
  IF tenant IS NULL OR NOT current_user_has_permission('deur.correct') THEN
    RETURN jsonb_build_object('success',false,'code','FORBIDDEN');
  END IF;
  IF jsonb_typeof(patch)<>'object'
     OR EXISTS(SELECT 1 FROM jsonb_object_keys(patch) key WHERE NOT key=ANY(allowed))
     OR nullif(btrim(patch->>'reason'),'') IS NULL
  THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED','message','A valid allowlisted patch and correction reason are required.'); END IF;
  SELECT * INTO target FROM deurs WHERE id=command->>'revisionId' AND company_id=tenant FOR UPDATE;
  IF target.id IS NULL THEN RETURN jsonb_build_object('success',false,'code','NOT_FOUND'); END IF;
  SELECT * INTO source FROM deurs WHERE id=target.previous_revision_id AND company_id=tenant;
  IF source.id IS NULL OR target.status<>'Draft' OR target.previous_revision_id IS NULL
     OR target.billing_locked OR target.superseded_by_revision_id IS NOT NULL
  THEN RETURN jsonb_build_object('success',false,'code','INVALID_TRANSITION'); END IF;
  IF target.row_version<>(command->>'expectedVersion')::bigint THEN
    RETURN jsonb_build_object('success',false,'code','CONFLICT','currentVersion',target.row_version,'refreshRequired',true);
  END IF;
  idem=begin_operational_command(command,'APPLY_DEUR_CORRECTION','DEUR',target.id,tenant,auth.uid()::text);
  IF idem->>'state'='MISMATCH' THEN RETURN jsonb_build_object('success',false,'code','IDEMPOTENCY_MISMATCH'); END IF;
  IF idem->>'state'='REPLAY' THEN RETURN (idem->'response')||jsonb_build_object('disposition','REPLAYED'); END IF;
  payload_hash=idem->>'payloadHash';
  IF jsonb_typeof(patch->'events')<>'array' OR jsonb_array_length(patch->'events')<4
     OR EXISTS(SELECT 1 FROM deur_events WHERE deur_id=target.id)
  THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED','message','A fresh complete canonical event timeline is required.'); END IF;

  FOR event IN SELECT value FROM jsonb_array_elements(patch->'events') LOOP
    IF (event->>'sequence')::integer<>sequence_expected THEN
      RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED','message','Event sequences must be unique and contiguous.');
    END IF;
    event_activity=event->>'activityType'; event_action=event->>'action'; event_at=(event->>'timestamp')::timestamptz;
    IF event_activity NOT IN('shift','operation','idle','standby','mealBreak','breakdown')
       OR event_action NOT IN('start','end') OR (last_at IS NOT NULL AND event_at<last_at)
    THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED','message','The corrected event timeline is invalid.'); END IF;
    IF event_activity='shift' THEN
      IF event_action='start' THEN
        IF shift_open OR shift_closed OR sequence_expected<>1 THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;
        shift_open=true;
      ELSE
        IF NOT shift_open OR open_activity IS NOT NULL THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;
        shift_open=false; shift_closed=true;
      END IF;
    ELSIF event_action='start' THEN
      IF NOT shift_open OR open_activity IS NOT NULL THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;
      open_activity=event_activity;
    ELSE
      IF NOT shift_open OR open_activity IS DISTINCT FROM event_activity THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;
      open_activity=NULL;
    END IF;
    last_at=event_at; sequence_expected=sequence_expected+1;
  END LOOP;
  IF NOT shift_closed OR shift_open OR open_activity IS NOT NULL THEN
    RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED','message','The corrected shift must be complete.');
  END IF;
  IF nullif(patch->>'openingMeter','') IS NOT NULL AND nullif(patch->>'closingMeter','') IS NOT NULL
     AND (patch->>'closingMeter')::numeric < (patch->>'openingMeter')::numeric
  THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED','message','Meter rollback is not allowed.'); END IF;
  IF patch ? 'projectId' AND NOT EXISTS(
    SELECT 1 FROM projects WHERE id=patch->>'projectId' AND company_id=tenant
  ) THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;

  prior=jsonb_build_object('openingMeter',target.opening_meter,'closingMeter',target.closing_meter,
    'projectId',target.project_id,'reason',target.correction_reason_details);
  FOR event IN SELECT value FROM jsonb_array_elements(patch->'events') ORDER BY (value->>'sequence')::integer LOOP
    INSERT INTO deur_events(id,deur_id,activity_type,action,occurred_at,sequence,source,actor_id,
      server_accepted_at,command_id,idempotency_key,is_open)
    VALUES(gen_random_uuid()::text,target.id,event->>'activityType',event->>'action',(event->>'timestamp')::timestamptz,
      (event->>'sequence')::integer,'correction',auth.uid()::text,now_at,command->>'commandId',command->>'idempotencyKey',false);
  END LOOP;
  SELECT * INTO calculated FROM recalculate_deur_event_totals(target.id);
  UPDATE deurs SET opening_meter=coalesce(nullif(patch->>'openingMeter','')::numeric,opening_meter),
    closing_meter=coalesce(nullif(patch->>'closingMeter','')::numeric,closing_meter),
    project_id=CASE WHEN patch ? 'projectId' THEN patch->>'projectId' ELSE project_id END,
    correction_reason_details=btrim(patch->>'reason'),
    total_operating_minutes=calculated.operation_minutes,total_idle_minutes=calculated.idle_minutes,
    total_standby_minutes=calculated.standby_minutes,total_meal_break_minutes=calculated.meal_break_minutes,
    total_maintenance_minutes=calculated.breakdown_minutes,updated_at=now_at,updated_by=auth.uid()::text
  WHERE id=target.id RETURNING * INTO target;
  INSERT INTO audit_log(id,company_id,aggregate_type,aggregate_id,action,actor_id,occurred_at,correlation_id,previous_values,new_values)
  VALUES(gen_random_uuid()::text,tenant,'DEUR',target.id,'APPLY_DEUR_CORRECTION',auth.uid()::text,now_at,
    command->>'commandId',prior,jsonb_build_object('openingMeter',target.opening_meter,'closingMeter',target.closing_meter,
      'projectId',target.project_id,'reason',target.correction_reason_details,'totals',to_jsonb(calculated)));
  response=jsonb_build_object('success',true,'disposition','ACCEPTED','serverOccurredAt',now_at,'refresh',jsonb_build_array(source.id,target.id),
    'value',jsonb_build_object('sourceRevisionId',source.id,'revisionId',target.id,'version',target.row_version,
      'operationMinutes',target.total_operating_minutes,'idleMinutes',target.total_idle_minutes,'standbyMinutes',target.total_standby_minutes));
  RETURN finish_operational_command(command,'APPLY_DEUR_CORRECTION','DEUR',target.id,tenant,auth.uid()::text,payload_hash,response,target.row_version);
EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow OR numeric_value_out_of_range THEN
  RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED');
END $$;
REVOKE ALL ON FUNCTION command_apply_deur_correction(jsonb) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION command_apply_deur_correction(jsonb) TO authenticated;

-- Standby charges are derived from canonical standby evidence, never idle.
CREATE OR REPLACE FUNCTION calculate_deur_billing_evidence(target_deur_id text, tenant text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp AS $$
DECLARE
  source deurs; terms commercial_snapshots; method billing_method;
  hours numeric(14,4); quantity numeric(19,6); unit text; rate numeric(19,6);
  operating numeric(19,4); standby numeric(19,4); mobilization numeric(19,4);
  demobilization numeric(19,4); operator_amount numeric(19,4); fuel numeric(19,4);
  subtotal numeric(19,4); vat_amount numeric(19,4); withholding numeric(19,4); total numeric(19,4);
BEGIN
  SELECT * INTO source FROM deurs WHERE id=target_deur_id AND company_id=tenant;
  IF source.id IS NULL THEN RETURN jsonb_build_object('success',false,'code','NOT_FOUND','message','DEUR is unavailable.'); END IF;
  IF source.status<>'Acknowledged' OR source.legacy OR source.superseded_by_revision_id IS NOT NULL THEN
    RETURN jsonb_build_object('success',false,'code','BILLING_INELIGIBLE','message','DEUR is not eligible for billing.');
  END IF;
  IF source.billing_locked OR source.billing_statement_id IS NOT NULL OR nullif(btrim(source.bill_id),'') IS NOT NULL OR source.status='Billed' THEN
    RETURN jsonb_build_object('success',false,'code','DUPLICATE_CONSUMPTION','message','DEUR is already associated with billing.');
  END IF;
  SELECT * INTO terms FROM commercial_snapshots WHERE id=source.commercial_snapshot_id AND rental_id=source.rental_id
    AND rental_equipment_line_id IS NOT DISTINCT FROM source.rental_equipment_line_id;
  IF terms.id IS NULL THEN RETURN jsonb_build_object('success',false,'code','BILLING_INELIGIBLE','message','Immutable commercial terms are required.'); END IF;
  method=terms.billing_method;
  IF source.billing_method_snapshot IS NOT NULL AND source.billing_method_snapshot<>method THEN
    RETURN jsonb_build_object('success',false,'code','BILLING_INELIGIBLE','message','DEUR and commercial billing methods differ.');
  END IF;
  IF method='Per Cubic Meter' THEN RETURN jsonb_build_object('success',false,'code','UNSUPPORTED_BILLING_METHOD','message','Per Cubic Meter automated billing is not supported.'); END IF;
  IF method NOT IN('Per Hour','Per Day','Per Week','Per Month','One Lot') THEN
    RETURN jsonb_build_object('success',false,'code','UNSUPPORTED_BILLING_METHOD','message','The billing method is not supported by this command.');
  END IF;
  hours=round(greatest(source.total_operating_minutes::numeric/60,coalesce(terms.minimum_billable_hours,0)),4);
  rate=terms.unit_rate; quantity=CASE WHEN method='Per Hour' THEN hours ELSE 1 END;
  unit=CASE method WHEN 'Per Hour' THEN 'HOUR' WHEN 'Per Day' THEN 'DAY' WHEN 'Per Week' THEN 'WEEK' WHEN 'Per Month' THEN 'MONTH' ELSE 'LOT' END;
  operating=round(CASE method WHEN 'Per Hour' THEN hours*rate WHEN 'One Lot' THEN coalesce(terms.contract_amount,rate) ELSE rate END,4);
  standby=round((source.total_standby_minutes::numeric/60)*coalesce(terms.standby_rate,0),4);
  mobilization=round(coalesce(terms.mobilization_fee,0),4); demobilization=round(coalesce(terms.demobilization_fee,0),4);
  operator_amount=round(CASE WHEN terms.operator_included THEN 0 ELSE coalesce(terms.operator_rate,0) END,4);
  fuel=round(coalesce(terms.fuel_charge,0),4);
  subtotal=operating+standby+mobilization+demobilization+operator_amount+fuel;
  vat_amount=round(subtotal*(coalesce(terms.tax_rate,0)/100),4);
  withholding=round(subtotal*(coalesce(terms.withholding_tax,0)/100),4); total=subtotal+vat_amount-withholding;
  RETURN jsonb_build_object('success',true,'deurId',source.id,'rentalId',source.rental_id,'rentalLineId',source.rental_equipment_line_id,
    'equipmentId',source.equipment_id,'operatorId',source.operator_id,'workDate',source.work_date,'billingMethod',method,
    'quantity',quantity,'unit',unit,'unitRate',rate,'hours',hours,'hourlyRate',CASE WHEN method='Per Hour' THEN rate ELSE 0 END,
    'operatingCharge',operating,'idleCharge',standby,'standbyCharge',standby,'mobilizationCharge',mobilization,
    'demobilizationCharge',demobilization,'operatorCharge',operator_amount,'fuelCharge',fuel,'subtotal',subtotal,
    'vat',vat_amount,'withholdingTax',withholding,'grandTotal',total,'commercialTermsSource','IMMUTABLE_SNAPSHOT',
    'commercialCapturedAt',terms.captured_at,'revisionChainId',coalesce(source.revision_chain_id,source.id),'revisionNumber',source.revision_number);
END $$;
REVOKE ALL ON FUNCTION calculate_deur_billing_evidence(text,text) FROM PUBLIC,anon,authenticated,service_role;

GRANT EXECUTE ON FUNCTION command_transition_deur_activity(jsonb) TO authenticated;

COMMIT;
