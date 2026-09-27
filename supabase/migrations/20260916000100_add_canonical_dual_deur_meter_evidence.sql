BEGIN;

SET LOCAL search_path=erp,auth,extensions,pg_catalog;

-- Forward-only canonical meter evidence.  Historical generic readings are
-- deliberately not copied: their meaning is resolved only at read time.
ALTER TABLE erp.deurs
  ADD COLUMN IF NOT EXISTS opening_hour_meter numeric(19,4),
  ADD COLUMN IF NOT EXISTS closing_hour_meter numeric(19,4),
  ADD COLUMN IF NOT EXISTS opening_odometer numeric(19,4),
  ADD COLUMN IF NOT EXISTS closing_odometer numeric(19,4);

ALTER TABLE erp.deurs
  ADD CONSTRAINT ck_deurs_explicit_meters_nonnegative CHECK (
    (opening_hour_meter IS NULL OR opening_hour_meter >= 0) AND
    (closing_hour_meter IS NULL OR closing_hour_meter >= 0) AND
    (opening_odometer IS NULL OR opening_odometer >= 0) AND
    (closing_odometer IS NULL OR closing_odometer >= 0)
  ) NOT VALID,
  ADD CONSTRAINT ck_deurs_explicit_hour_meter_order CHECK (
    opening_hour_meter IS NULL OR closing_hour_meter IS NULL OR closing_hour_meter >= opening_hour_meter
  ) NOT VALID,
  ADD CONSTRAINT ck_deurs_explicit_odometer_order CHECK (
    opening_odometer IS NULL OR closing_odometer IS NULL OR closing_odometer >= opening_odometer
  ) NOT VALID;

-- One compatibility interpretation used by every new canonical projection.
CREATE OR REPLACE FUNCTION erp.canonical_deur_meter_evidence(
  meter_requirement text,
  opening_hour numeric, closing_hour numeric,
  opening_odo numeric, closing_odo numeric,
  legacy_opening numeric, legacy_closing numeric
) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE explicit_any boolean:=opening_hour IS NOT NULL OR closing_hour IS NOT NULL OR opening_odo IS NOT NULL OR closing_odo IS NOT NULL;
BEGIN
  RETURN jsonb_strip_nulls(jsonb_build_object(
    'meterRequirement',meter_requirement,
    'openingHourMeter',CASE WHEN opening_hour IS NOT NULL THEN opening_hour WHEN meter_requirement='hourMeter' THEN legacy_opening END,
    'closingHourMeter',CASE WHEN closing_hour IS NOT NULL THEN closing_hour WHEN meter_requirement='hourMeter' THEN legacy_closing END,
    'openingOdometer',CASE WHEN opening_odo IS NOT NULL THEN opening_odo WHEN meter_requirement='odometer' THEN legacy_opening END,
    'closingOdometer',CASE WHEN closing_odo IS NOT NULL THEN closing_odo WHEN meter_requirement='odometer' THEN legacy_closing END,
    -- Generic aliases are retained only for a single-meter compatibility path.
    'openingMeter',CASE WHEN meter_requirement='hourMeter' THEN coalesce(opening_hour,legacy_opening) WHEN meter_requirement='odometer' THEN coalesce(opening_odo,legacy_opening) END,
    'closingMeter',CASE WHEN meter_requirement='hourMeter' THEN coalesce(closing_hour,legacy_closing) WHEN meter_requirement='odometer' THEN coalesce(closing_odo,legacy_closing) END,
    'legacyMeterEvidenceState',CASE WHEN meter_requirement='both' AND NOT explicit_any AND (legacy_opening IS NOT NULL OR legacy_closing IS NOT NULL) THEN 'LEGACY_AMBIGUOUS_DUAL_METER' END
  ));
END $$;

CREATE OR REPLACE FUNCTION erp.command_start_deur_shift(command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,auth,extensions,pg_catalog AS $$
DECLARE
  scope jsonb; idem jsonb; now_at timestamptz:=erp.deur_operational_clock(); new_deur erp.deurs%ROWTYPE;
  response jsonb; payload_hash text; line erp.rental_equipment_lines%ROWTYPE; snap jsonb; policy text;
  selected_shift text; effective_date date; opening_hour numeric; opening_odo numeric;
BEGIN
  scope:=erp.validate_deur_command_scope(command,'deur.create');
  IF scope->>'code'<>'OK' THEN RETURN jsonb_build_object('success',false,'code',scope->>'code'); END IF;
  SELECT * INTO line FROM erp.rental_equipment_lines WHERE id=command->>'rentalLineId' AND company_id=erp.current_company_id() FOR UPDATE;
  snap:=nullif(line.operational_metadata->'deurExpectationSnapshot','null'::jsonb);
  policy:=snap->>'meterRequirement';
  IF line.id IS NULL OR snap IS NULL OR policy NOT IN ('none','hourMeter','odometer','both') THEN RETURN jsonb_build_object('success',false,'code','DEUR_EXPECTATION_REQUIRED'); END IF;
  BEGIN
    opening_hour:=nullif(trim(command->'draft'->>'openingHourMeter'),'')::numeric;
    opening_odo:=nullif(trim(command->'draft'->>'openingOdometer'),'')::numeric;
  EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END;
  IF (opening_hour IS NOT NULL AND opening_hour<0) OR (opening_odo IS NOT NULL AND opening_odo<0) THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;
  IF (policy='hourMeter' AND (opening_hour IS NULL OR opening_odo IS NOT NULL))
     OR (policy='odometer' AND (opening_odo IS NULL OR opening_hour IS NOT NULL))
     OR (policy='both' AND (opening_hour IS NULL OR opening_odo IS NULL))
     OR (policy='none' AND (opening_hour IS NOT NULL OR opening_odo IS NOT NULL))
  THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;
  idem:=erp.begin_deur_command(command,'START_SHIFT');
  IF idem->>'state'='MISMATCH' THEN RETURN jsonb_build_object('success',false,'code','IDEMPOTENCY_MISMATCH'); END IF;
  IF idem->>'state'='REPLAY' THEN RETURN (idem->'response')||jsonb_build_object('disposition','REPLAYED'); END IF;
  payload_hash:=idem->>'payloadHash';
  selected_shift:=nullif(command->'draft'->>'shift','');
  effective_date:=erp.resolve_uat_limited_pilot_work_date(line.id,(snap->>'workDate')::date);
  INSERT INTO erp.deurs(id,deur_number,rental_id,rental_equipment_line_id,assignment_id,equipment_id,operator_id,project_id,customer_id,commercial_snapshot_id,commercial_snapshot_required,creation_source,work_date,shift,status,evidence_mode,billing_method_snapshot,opening_meter,opening_hour_meter,opening_odometer,operational_metadata,operational_remarks,created_at,created_by,updated_at,updated_by,row_version,company_id)
  SELECT command->'draft'->>'id',erp.next_deur_number(),snap->>'rentalId',line.id,snap->>'assignmentId',snap->>'equipmentId',snap->>'operatorId',snap->>'projectId',snap->>'customerId',cs.id,true,'OPERATOR_DIGITAL',effective_date,selected_shift,'In Progress',
    CASE snap->>'billingMethod' WHEN 'Per Kilometer' THEN 'ODOMETER_TRIP' WHEN 'Per Cubic Meter' THEN 'QUANTITY' WHEN 'One Lot' THEN 'COMPLETION' WHEN 'Per Lot' THEN 'COMPLETION' ELSE 'TIME_TIMELINE' END,
    (snap->>'billingMethod')::erp.billing_method,CASE policy WHEN 'hourMeter' THEN opening_hour WHEN 'odometer' THEN opening_odo END,
    CASE WHEN policy IN ('hourMeter','both') THEN opening_hour END,CASE WHEN policy IN ('odometer','both') THEN opening_odo END,
    (snap->'operationalMetadata')||jsonb_build_object('workDescription',snap->'workDescription'),coalesce(nullif(command->'draft'->>'operationalRemarks',''),snap->>'operationalRemarks'),now_at,auth.uid()::text,now_at,auth.uid()::text,1,erp.current_company_id()
  FROM erp.commercial_snapshots cs WHERE cs.rental_equipment_line_id=line.id AND cs.rental_id=line.rental_id RETURNING * INTO new_deur;
  IF new_deur.id IS NULL THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;
  INSERT INTO erp.deur_events(id,deur_id,activity_type,action,occurred_at,sequence,source,actor_id,server_accepted_at,client_created_at,command_id,idempotency_key,device_id,is_open,company_id)
  VALUES(extensions.gen_random_uuid()::text,new_deur.id,'shift','start',now_at,1,'server',auth.uid()::text,now_at,nullif(command->>'clientCreatedAt','')::timestamptz,command->>'commandId',command->>'idempotencyKey',command->>'deviceId',true,new_deur.company_id),(extensions.gen_random_uuid()::text,new_deur.id,'operation','start',now_at,2,'server',auth.uid()::text,now_at,nullif(command->>'clientCreatedAt','')::timestamptz,command->>'commandId',command->>'idempotencyKey',command->>'deviceId',true,new_deur.company_id);
  response:=jsonb_build_object('success',true,'disposition','ACCEPTED','record',to_jsonb(new_deur)||erp.canonical_deur_meter_evidence(policy,new_deur.opening_hour_meter,new_deur.closing_hour_meter,new_deur.opening_odometer,new_deur.closing_odometer,new_deur.opening_meter,new_deur.closing_meter),'version',new_deur.row_version,'serverOccurredAt',now_at);
  RETURN erp.finish_deur_command(command,'START_SHIFT',new_deur.id,payload_hash,response);
EXCEPTION WHEN unique_violation THEN RETURN jsonb_build_object('success',false,'code','DUPLICATE_ACTIVE_DEUR');
END $$;

CREATE OR REPLACE FUNCTION erp.command_complete_deur_shift(command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,auth,extensions,pg_catalog AS $$
DECLARE
  tenant text:=erp.current_company_id(); scope jsonb; idem jsonb; now_at timestamptz:=erp.deur_operational_clock(); current_deur erp.deurs%ROWTYPE; response jsonb; payload_hash text; next_sequence integer; open_activity text; policy text; closing_hour numeric; closing_odo numeric;
BEGIN
  scope:=erp.validate_deur_custody_command_scope(command,'deur.create'); IF scope->>'code'<>'OK' THEN RETURN jsonb_build_object('success',false,'code',scope->>'code'); END IF;
  idem:=erp.begin_deur_command(command,'COMPLETE_SHIFT'); IF idem->>'state'='MISMATCH' THEN RETURN jsonb_build_object('success',false,'code','IDEMPOTENCY_MISMATCH'); END IF; IF idem->>'state'='REPLAY' THEN RETURN (idem->'response')||jsonb_build_object('disposition','REPLAYED'); END IF; payload_hash:=idem->>'payloadHash';
  SELECT * INTO current_deur FROM erp.deurs WHERE id=command->>'deurId' AND company_id=tenant FOR UPDATE;
  IF current_deur.id IS NULL THEN RETURN jsonb_build_object('success',false,'code','NOT_FOUND'); END IF;
  IF erp.current_deur_authorized_operator(current_deur.id)<>command->>'operatorId' THEN RETURN jsonb_build_object('success',false,'code','OWNERSHIP_MISMATCH'); END IF;
  IF current_deur.row_version<>(command->>'expectedVersion')::bigint THEN RETURN jsonb_build_object('success',false,'code','CONFLICT','aggregateId',current_deur.id,'expectedVersion',(command->>'expectedVersion')::bigint,'currentVersion',current_deur.row_version,'refreshRequired',true); END IF;
  IF current_deur.status<>'In Progress' THEN RETURN jsonb_build_object('success',false,'code','INVALID_TRANSITION'); END IF;
  SELECT line.operational_metadata#>>'{deurExpectationSnapshot,meterRequirement}' INTO policy FROM erp.rental_equipment_lines line WHERE line.id=current_deur.rental_equipment_line_id AND line.company_id=tenant;
  IF policy NOT IN ('none','hourMeter','odometer','both') THEN RETURN jsonb_build_object('success',false,'code','METER_POLICY_INVALID'); END IF;
  BEGIN closing_hour:=nullif(trim(command->>'closingHourMeter'),'')::numeric; closing_odo:=nullif(trim(command->>'closingOdometer'),'')::numeric; EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END;
  IF (closing_hour IS NOT NULL AND (closing_hour<0 OR (current_deur.opening_hour_meter IS NOT NULL AND closing_hour<current_deur.opening_hour_meter))) OR (closing_odo IS NOT NULL AND (closing_odo<0 OR (current_deur.opening_odometer IS NOT NULL AND closing_odo<current_deur.opening_odometer))) THEN RETURN jsonb_build_object('success',false,'code','CLOSING_METER_BELOW_OPENING'); END IF;
  IF (policy='hourMeter' AND (closing_hour IS NULL OR closing_odo IS NOT NULL)) OR (policy='odometer' AND (closing_odo IS NULL OR closing_hour IS NOT NULL)) OR (policy='both' AND (closing_hour IS NULL OR closing_odo IS NULL)) OR (policy='none' AND (closing_hour IS NOT NULL OR closing_odo IS NOT NULL)) THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;
  SELECT activity_type INTO open_activity FROM erp.deur_events WHERE deur_id=current_deur.id AND is_open AND activity_type<>'shift' FOR UPDATE;
  UPDATE erp.deur_events SET is_open=false WHERE deur_id=current_deur.id AND is_open;
  SELECT coalesce(max(sequence),0)+1 INTO next_sequence FROM erp.deur_events WHERE deur_id=current_deur.id;
  IF open_activity IS NOT NULL THEN INSERT INTO erp.deur_events(id,deur_id,activity_type,action,occurred_at,sequence,source,actor_id,server_accepted_at,client_created_at,command_id,idempotency_key,device_id,is_open,company_id) VALUES(extensions.gen_random_uuid()::text,current_deur.id,open_activity,'end',now_at,next_sequence,'server',auth.uid()::text,now_at,nullif(command->>'clientCreatedAt','')::timestamptz,command->>'commandId',command->>'idempotencyKey',command->>'deviceId',false,tenant); next_sequence:=next_sequence+1; END IF;
  INSERT INTO erp.deur_events(id,deur_id,activity_type,action,occurred_at,sequence,source,actor_id,server_accepted_at,client_created_at,command_id,idempotency_key,device_id,is_open,company_id) VALUES(extensions.gen_random_uuid()::text,current_deur.id,'shift','end',now_at,next_sequence,'server',auth.uid()::text,now_at,nullif(command->>'clientCreatedAt','')::timestamptz,command->>'commandId',command->>'idempotencyKey',command->>'deviceId',false,tenant);
  UPDATE erp.deurs SET closing_hour_meter=CASE WHEN policy IN ('hourMeter','both') THEN closing_hour ELSE NULL END,closing_odometer=CASE WHEN policy IN ('odometer','both') THEN closing_odo ELSE NULL END,closing_meter=CASE WHEN policy='hourMeter' THEN closing_hour WHEN policy='odometer' THEN closing_odo ELSE NULL END,updated_at=now_at,updated_by=auth.uid()::text WHERE id=current_deur.id RETURNING * INTO current_deur;
  response:=jsonb_build_object('success',true,'disposition','ACCEPTED','record',to_jsonb(current_deur)||erp.canonical_deur_meter_evidence(policy,current_deur.opening_hour_meter,current_deur.closing_hour_meter,current_deur.opening_odometer,current_deur.closing_odometer,current_deur.opening_meter,current_deur.closing_meter),'version',current_deur.row_version,'serverOccurredAt',now_at);
  RETURN erp.finish_deur_command(command,'COMPLETE_SHIFT',current_deur.id,payload_hash,response);
END $$;

-- Submission remains lifecycle-authoritative and adds the only missing dual
-- meter guard.  Generic legacy values can never satisfy a BOTH policy.
CREATE OR REPLACE FUNCTION erp.command_submit_deur(command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,auth,extensions,pg_catalog AS $$
DECLARE scope jsonb; idem jsonb; now_at timestamptz:=clock_timestamp(); current_deur erp.deurs%ROWTYPE; response jsonb; payload_hash text; corrected_complete boolean:=false; policy text;
BEGIN
  scope:=erp.validate_deur_custody_command_scope(command,'deur.create'); IF scope->>'code'<>'OK' THEN RETURN jsonb_build_object('success',false,'code',scope->>'code'); END IF;
  idem:=erp.begin_deur_command(command,'SUBMIT_DEUR'); IF idem->>'state'='MISMATCH' THEN RETURN jsonb_build_object('success',false,'code','IDEMPOTENCY_MISMATCH'); END IF; IF idem->>'state'='REPLAY' THEN RETURN (idem->'response')||jsonb_build_object('disposition','REPLAYED'); END IF; payload_hash:=idem->>'payloadHash';
  SELECT * INTO current_deur FROM erp.deurs WHERE id=command->>'deurId' AND company_id=erp.current_company_id() FOR UPDATE;
  IF current_deur.id IS NULL THEN RETURN jsonb_build_object('success',false,'code','NOT_FOUND'); END IF;
  IF erp.current_deur_authorized_operator(current_deur.id)<>command->>'operatorId' THEN RETURN jsonb_build_object('success',false,'code','OWNERSHIP_MISMATCH'); END IF;
  IF current_deur.row_version<>(command->>'expectedVersion')::bigint THEN RETURN jsonb_build_object('success',false,'code','CONFLICT','aggregateId',current_deur.id,'expectedVersion',(command->>'expectedVersion')::bigint,'currentVersion',current_deur.row_version,'refreshRequired',true); END IF;
  SELECT line.operational_metadata#>>'{deurExpectationSnapshot,meterRequirement}' INTO policy FROM erp.rental_equipment_lines line WHERE line.id=current_deur.rental_equipment_line_id AND line.company_id=current_deur.company_id;
  IF policy='both' AND (current_deur.opening_hour_meter IS NULL OR current_deur.closing_hour_meter IS NULL OR current_deur.opening_odometer IS NULL OR current_deur.closing_odometer IS NULL) THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;
  corrected_complete:=current_deur.status='Draft' AND current_deur.previous_revision_id IS NOT NULL AND EXISTS(SELECT 1 FROM erp.deur_events event_record WHERE event_record.deur_id=current_deur.id AND event_record.source='correction' AND event_record.activity_type='shift' AND event_record.action='end') AND NOT EXISTS(SELECT 1 FROM erp.deur_events event_record WHERE event_record.deur_id=current_deur.id AND event_record.source<>'correction');
  IF (current_deur.status<>'In Progress' AND NOT corrected_complete) OR EXISTS(SELECT 1 FROM erp.deur_events event_record WHERE event_record.deur_id=current_deur.id AND event_record.is_open) OR NOT EXISTS(SELECT 1 FROM erp.deur_events event_record WHERE event_record.deur_id=current_deur.id AND event_record.activity_type='shift' AND event_record.action='end') THEN RETURN jsonb_build_object('success',false,'code','INVALID_TRANSITION'); END IF;
  UPDATE erp.deurs SET status='Submitted',submitted_at=now_at,submitted_by=auth.uid()::text,updated_at=now_at,updated_by=auth.uid()::text WHERE id=current_deur.id RETURNING * INTO current_deur;
  response:=jsonb_build_object('success',true,'disposition','ACCEPTED','record',to_jsonb(current_deur)||erp.canonical_deur_meter_evidence(policy,current_deur.opening_hour_meter,current_deur.closing_hour_meter,current_deur.opening_odometer,current_deur.closing_odometer,current_deur.opening_meter,current_deur.closing_meter),'version',current_deur.row_version,'serverOccurredAt',now_at);
  RETURN erp.finish_deur_command(command,'SUBMIT_DEUR',current_deur.id,payload_hash,response);
END $$;

CREATE OR REPLACE FUNCTION erp.read_current_operator_deur_turnover_work()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=erp,auth,extensions,pg_catalog AS $$
DECLARE tenant text:=erp.current_company_id(); actor erp.users%ROWTYPE; work_items jsonb:='[]'::jsonb;
BEGIN
  IF tenant IS NULL OR auth.uid() IS NULL THEN RETURN jsonb_build_object('success',false,'code','UNAUTHENTICATED'); END IF;
  SELECT * INTO actor FROM erp.users u WHERE u.id=auth.uid() AND u.company_id=tenant AND u.status='active'; IF actor.id IS NULL OR actor.operator_id IS NULL THEN RETURN jsonb_build_object('success',false,'code','OPERATOR_LINK_REQUIRED'); END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('turnoverId',t.id,'turnoverStatus',t.status,'turnoverToOperatorId',t.to_operator_id,'deur',jsonb_build_object('id',d.id,'deurNumber',d.deur_number,'rentalId',d.rental_id,'rentalEquipmentLineId',d.rental_equipment_line_id,'assignmentId',d.assignment_id,'equipmentId',d.equipment_id,'workDate',d.work_date,'status',d.status,'version',d.row_version,'operatorId',d.operator_id)||erp.canonical_deur_meter_evidence(l.operational_metadata#>>'{deurExpectationSnapshot,meterRequirement}',d.opening_hour_meter,d.closing_hour_meter,d.opening_odometer,d.closing_odometer,d.opening_meter,d.closing_meter),'line',jsonb_build_object('id',l.id,'operationalMetadata',l.operational_metadata)) ORDER BY t.initiated_at,t.id),'[]'::jsonb) INTO work_items
  FROM erp.deur_turnovers t JOIN erp.deurs d ON d.id=t.deur_id AND d.company_id=tenant AND d.previous_revision_id IS NULL JOIN erp.rental_equipment_lines l ON l.id=d.rental_equipment_line_id AND l.company_id=tenant
  WHERE t.company_id=tenant AND (t.from_operator_id=actor.operator_id OR t.to_operator_id=actor.operator_id) AND t.status IN ('PENDING','ACCEPTED');
  RETURN jsonb_build_object('success',true,'operatorId',actor.operator_id,'work',work_items);
END $$;

ALTER FUNCTION erp.canonical_deur_meter_evidence(text,numeric,numeric,numeric,numeric,numeric,numeric) OWNER TO postgres;
ALTER FUNCTION erp.command_start_deur_shift(jsonb) OWNER TO postgres;
ALTER FUNCTION erp.command_complete_deur_shift(jsonb) OWNER TO postgres;
ALTER FUNCTION erp.command_submit_deur(jsonb) OWNER TO postgres;
ALTER FUNCTION erp.read_current_operator_deur_turnover_work() OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.canonical_deur_meter_evidence(text,numeric,numeric,numeric,numeric,numeric,numeric) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION erp.command_start_deur_shift(jsonb),erp.command_complete_deur_shift(jsonb),erp.command_submit_deur(jsonb),erp.read_current_operator_deur_turnover_work() FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION erp.command_start_deur_shift(jsonb),erp.command_complete_deur_shift(jsonb),erp.command_submit_deur(jsonb),erp.read_current_operator_deur_turnover_work() TO authenticated;

-- Persisted review and notification surfaces are fed by immutable snapshots.
-- Canonicalize only new rows at insertion; historical snapshots stay byte-for-byte
-- intact and no builder independently reinterprets a legacy generic pair.
CREATE OR REPLACE FUNCTION erp.enforce_canonical_review_meter_snapshot()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,pg_catalog AS $$
DECLARE target erp.deurs%ROWTYPE; line erp.rental_equipment_lines%ROWTYPE; evidence jsonb;
BEGIN
  SELECT * INTO target FROM erp.deurs WHERE id=NEW.revision_id AND company_id=NEW.company_id;
  SELECT * INTO line FROM erp.rental_equipment_lines WHERE id=target.rental_equipment_line_id AND company_id=target.company_id;
  IF target.id IS NULL OR line.id IS NULL THEN RAISE EXCEPTION 'canonical review meter evidence scope is invalid' USING ERRCODE='23503'; END IF;
  evidence:=erp.canonical_deur_meter_evidence(line.operational_metadata#>>'{deurExpectationSnapshot,meterRequirement}',target.opening_hour_meter,target.closing_hour_meter,target.opening_odometer,target.closing_odometer,target.opening_meter,target.closing_meter);
  NEW.snapshot:=(coalesce(NEW.snapshot,'{}'::jsonb)-'openingMeter'-'closingMeter'-'openingHourMeter'-'closingHourMeter'-'openingOdometer'-'closingOdometer'-'meterRequirement'-'legacyMeterEvidenceState')||evidence;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION erp.enforce_canonical_grouped_meter_snapshot()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,pg_catalog AS $$
DECLARE target erp.deurs%ROWTYPE; line erp.rental_equipment_lines%ROWTYPE; evidence jsonb;
BEGIN
  IF NEW.revision_id IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO target FROM erp.deurs WHERE id=NEW.revision_id AND company_id=NEW.company_id;
  SELECT * INTO line FROM erp.rental_equipment_lines WHERE id=target.rental_equipment_line_id AND company_id=target.company_id;
  IF target.id IS NULL OR line.id IS NULL THEN RAISE EXCEPTION 'canonical grouped meter evidence scope is invalid' USING ERRCODE='23503'; END IF;
  evidence:=erp.canonical_deur_meter_evidence(line.operational_metadata#>>'{deurExpectationSnapshot,meterRequirement}',target.opening_hour_meter,target.closing_hour_meter,target.opening_odometer,target.closing_odometer,target.opening_meter,target.closing_meter);
  NEW.item_snapshot:=(coalesce(NEW.item_snapshot,'{}'::jsonb)-'openingMeter'-'closingMeter'-'openingHourMeter'-'closingHourMeter'-'openingOdometer'-'closingOdometer'-'meterRequirement'-'legacyMeterEvidenceState')||evidence;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS zz_canonical_customer_review_meter_snapshot ON erp.customer_review_requests;
CREATE TRIGGER zz_canonical_customer_review_meter_snapshot
BEFORE INSERT ON erp.customer_review_requests
FOR EACH ROW EXECUTE FUNCTION erp.enforce_canonical_review_meter_snapshot();
DROP TRIGGER IF EXISTS zz_canonical_manager_review_meter_snapshot ON erp.manager_review_requests;
CREATE TRIGGER zz_canonical_manager_review_meter_snapshot
BEFORE INSERT ON erp.manager_review_requests
FOR EACH ROW EXECUTE FUNCTION erp.enforce_canonical_review_meter_snapshot();
DROP TRIGGER IF EXISTS zz_canonical_grouped_review_meter_snapshot ON erp.customer_review_batch_items;
CREATE TRIGGER zz_canonical_grouped_review_meter_snapshot
BEFORE INSERT ON erp.customer_review_batch_items
FOR EACH ROW EXECUTE FUNCTION erp.enforce_canonical_grouped_meter_snapshot();

ALTER FUNCTION erp.enforce_canonical_review_meter_snapshot() OWNER TO postgres;
ALTER FUNCTION erp.enforce_canonical_grouped_meter_snapshot() OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.enforce_canonical_review_meter_snapshot(),erp.enforce_canonical_grouped_meter_snapshot() FROM PUBLIC,anon,authenticated,service_role;

COMMIT;
