BEGIN;
SET LOCAL search_path=erp,auth,extensions,pg_catalog;

-- Server-owned clock for the fixed isolated-UAT pilot only.  This is not a
-- tenant-wide or production business-date override.
CREATE TABLE IF NOT EXISTS erp.uat_limited_pilot_business_clock(
  company_id text NOT NULL REFERENCES erp.companies(id),
  scenario_key text NOT NULL,
  profile_version text NOT NULL,
  effective_business_date date NOT NULL,
  previous_business_date date,
  advance_count integer NOT NULL DEFAULT 0 CHECK(advance_count>=0),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(company_id,scenario_key)
);
ALTER TABLE erp.uat_limited_pilot_business_clock ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON erp.uat_limited_pilot_business_clock FROM PUBLIC,anon,authenticated;

INSERT INTO erp.uat_limited_pilot_business_clock(company_id,scenario_key,profile_version,effective_business_date)
VALUES('TENANT-LOCAL-001','LIMITED-OPERATIONAL-PILOT-2026-09','UAT_LIMITED_PILOT_V1','2026-09-01')
ON CONFLICT(company_id,scenario_key) DO NOTHING;

CREATE OR REPLACE FUNCTION erp.resolve_uat_limited_pilot_work_date(line_id text,fallback_date date)
RETURNS date LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=erp,auth,extensions,pg_catalog AS $$
DECLARE clock_date date; pilot boolean;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM erp.uat_limited_operational_pilot_scenarios s
    WHERE s.company_id='TENANT-LOCAL-001' AND s.scenario_key='LIMITED-OPERATIONAL-PILOT-2026-09'
      AND s.profile_version='UAT_LIMITED_PILOT_V1'
      AND (s.scenario->>'line1Id'=line_id OR s.scenario->>'line2Id'=line_id OR s.scenario->>'line3Id'=line_id)
  ) INTO pilot;
  IF NOT pilot THEN RETURN fallback_date; END IF;
  SELECT c.effective_business_date INTO clock_date
    FROM erp.uat_limited_pilot_business_clock c
   WHERE c.company_id='TENANT-LOCAL-001'
     AND c.scenario_key='LIMITED-OPERATIONAL-PILOT-2026-09'
     AND c.profile_version='UAT_LIMITED_PILOT_V1';
  RETURN coalesce(clock_date,fallback_date);
END $$;

-- Fixed, authenticated UAT-only date advance.  Repeating the current date is
-- idempotent; advancing more than one allowlisted day at a time is rejected.
CREATE OR REPLACE FUNCTION erp.advance_uat_limited_pilot_business_date(command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,auth,extensions,pg_catalog AS $$
DECLARE tenant text:=trim(command->>'companyId'); k text:=trim(command->>'scenarioKey'); p text:=trim(command->>'profileVersion'); target date; clock erp.uat_limited_pilot_business_clock%ROWTYPE; lines text[]; pilot_state text; open_count integer; pending_count integer; duplicate_count integer;
BEGIN
  IF tenant<>'TENANT-LOCAL-001' OR k<>'LIMITED-OPERATIONAL-PILOT-2026-09' OR p<>'UAT_LIMITED_PILOT_V1' THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;
  BEGIN target:=(command->>'targetBusinessDate')::date; EXCEPTION WHEN others THEN RETURN jsonb_build_object('success',false,'code','INVALID_BUSINESS_DATE'); END;
  IF target NOT BETWEEN DATE '2026-09-01' AND DATE '2026-09-05' THEN RETURN jsonb_build_object('success',false,'code','BUSINESS_DATE_NOT_ALLOWLISTED'); END IF;
  SELECT * INTO clock FROM erp.uat_limited_pilot_business_clock WHERE company_id=tenant AND scenario_key=k FOR UPDATE;
  IF clock.scenario_key IS NULL THEN RETURN jsonb_build_object('success',false,'code','CLOCK_NOT_INITIALIZED'); END IF;
  IF target<clock.effective_business_date THEN RETURN jsonb_build_object('success',false,'code','BUSINESS_DATE_BACKWARD','effectiveBusinessDate',clock.effective_business_date); END IF;
  IF target=clock.effective_business_date THEN RETURN jsonb_build_object('success',true,'state','IDEMPOTENT','effectiveBusinessDate',clock.effective_business_date,'previousBusinessDate',clock.previous_business_date,'advanceCount',clock.advance_count); END IF;
  IF target<>clock.effective_business_date+1 THEN RETURN jsonb_build_object('success',false,'code','BUSINESS_DATE_SEQUENCE_REQUIRED','effectiveBusinessDate',clock.effective_business_date); END IF;
  SELECT state,ARRAY[scenario->>'line1Id',scenario->>'line2Id',scenario->>'line3Id'] INTO pilot_state,lines FROM erp.uat_limited_operational_pilot_scenarios WHERE company_id=tenant AND scenario_key=k;
  IF pilot_state IS DISTINCT FROM 'DOMAIN_READY' OR array_position(lines,NULL) IS NOT NULL THEN RETURN jsonb_build_object('success',false,'code','SCENARIO_NOT_READY'); END IF;
  SELECT count(*) INTO open_count FROM erp.deurs d WHERE d.company_id=tenant AND d.rental_equipment_line_id=ANY(lines) AND d.work_date=clock.effective_business_date AND d.status IN('Draft','In Progress','Pending Acknowledgement');
  IF open_count>0 THEN RETURN jsonb_build_object('success',false,'code','OPEN_DEUR_BLOCKS_ADVANCE','openDeurCount',open_count); END IF;
  SELECT count(*) INTO pending_count FROM erp.deur_turnovers t JOIN erp.deurs d ON d.id=t.deur_id WHERE t.company_id=tenant AND d.rental_equipment_line_id=ANY(lines) AND t.status='PENDING';
  IF pending_count>0 THEN RETURN jsonb_build_object('success',false,'code','PENDING_TURNOVER_BLOCKS_ADVANCE','pendingTurnoverCount',pending_count); END IF;
  SELECT greatest(count(*)-count(DISTINCT d.rental_equipment_line_id),0) INTO duplicate_count FROM erp.deurs d WHERE d.company_id=tenant AND d.rental_equipment_line_id=ANY(lines) AND d.work_date=clock.effective_business_date;
  IF duplicate_count>0 THEN RETURN jsonb_build_object('success',false,'code','DUPLICATE_DAILY_DEUR','duplicateDailyDeurCount',duplicate_count); END IF;
  UPDATE erp.uat_limited_pilot_business_clock SET previous_business_date=effective_business_date,effective_business_date=target,advance_count=advance_count+1,updated_at=clock_timestamp() WHERE company_id=tenant AND scenario_key=k RETURNING * INTO clock;
  INSERT INTO erp.audit_log(id,company_id,aggregate_type,aggregate_id,action,actor_id,occurred_at,correlation_id,new_values)
  VALUES(extensions.gen_random_uuid()::text,tenant,'UAT_PILOT_BUSINESS_CLOCK',k,'ADVANCE_BUSINESS_DATE',auth.uid()::text,clock_timestamp(),command->>'commandId',jsonb_build_object('previousBusinessDate',clock.previous_business_date,'effectiveBusinessDate',clock.effective_business_date,'advanceCount',clock.advance_count));
  RETURN jsonb_build_object('success',true,'state','ADVANCED','effectiveBusinessDate',clock.effective_business_date,'previousBusinessDate',clock.previous_business_date,'advanceCount',clock.advance_count);
END $$;

CREATE OR REPLACE FUNCTION erp.inspect_uat_limited_pilot_business_date(command jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=erp,auth,extensions,pg_catalog AS $$
DECLARE base jsonb; clock erp.uat_limited_pilot_business_clock%ROWTYPE; rows jsonb;
BEGIN
  IF trim(command->>'companyId')<>'TENANT-LOCAL-001' OR trim(command->>'scenarioKey')<>'LIMITED-OPERATIONAL-PILOT-2026-09' OR trim(command->>'profileVersion')<>'UAT_LIMITED_PILOT_V1' THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;
  base:=erp.inspect_uat_limited_pilot_scenarios(command);
  IF coalesce((base->>'success')::boolean,false)=false THEN RETURN base; END IF;
  SELECT * INTO clock FROM erp.uat_limited_pilot_business_clock WHERE company_id='TENANT-LOCAL-001' AND scenario_key='LIMITED-OPERATIONAL-PILOT-2026-09';
  RETURN base||jsonb_build_object('effectiveBusinessDate',clock.effective_business_date,'allowedBusinessDates',jsonb_build_array('2026-09-01','2026-09-02','2026-09-03','2026-09-04','2026-09-05'),'previousBusinessDate',clock.previous_business_date,'advanceCount',clock.advance_count);
END $$;

-- Preserve the canonical command contract while resolving the server-owned
-- date only for the fixed pilot lines.
CREATE OR REPLACE FUNCTION command_start_deur_shift(command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,public,auth AS $$
DECLARE scope jsonb; idem jsonb; now_at timestamptz=clock_timestamp(); new_deur deurs; response jsonb; payload_hash text; effective_date date;
BEGIN
  scope=validate_deur_command_scope(command,'deur.create'); IF scope->>'code'<>'OK' THEN RETURN jsonb_build_object('success',false,'code',scope->>'code'); END IF;
  idem=begin_deur_command(command,'START_SHIFT'); IF idem->>'state'='MISMATCH' THEN RETURN jsonb_build_object('success',false,'code','IDEMPOTENCY_MISMATCH'); END IF;
  IF idem->>'state'='REPLAY' THEN RETURN (idem->'response')||jsonb_build_object('disposition','REPLAYED'); END IF; payload_hash=idem->>'payloadHash';
  effective_date=erp.resolve_uat_limited_pilot_work_date(command->>'rentalLineId',(command->'draft'->>'workDate')::date);
  INSERT INTO deurs(id,deur_number,rental_id,rental_equipment_line_id,assignment_id,equipment_id,operator_id,project_id,customer_id,work_date,shift,status,evidence_mode,opening_meter,operational_metadata,operational_remarks,created_at,created_by,updated_at,updated_by,row_version)
  SELECT command->'draft'->>'id',next_deur_number(),command->>'rentalId',command->>'rentalLineId',command->>'assignmentId',command->>'equipmentId',command->>'operatorId',r.project_id,r.customer_id,effective_date,command->'draft'->>'shift','In Progress',command->'draft'->>'evidenceMode',nullif(command->'draft'->>'openingMeter','')::numeric,coalesce(command->'draft'->'operationalMetadata','{}'::jsonb),command->'draft'->>'operationalRemarks',now_at,auth.uid()::text,now_at,auth.uid()::text,1 FROM rentals r WHERE r.id=command->>'rentalId' RETURNING * INTO new_deur;
  INSERT INTO deur_events(id,deur_id,activity_type,action,occurred_at,sequence,source,actor_id,server_accepted_at,client_created_at,command_id,idempotency_key,device_id,is_open)
  VALUES(gen_random_uuid()::text,new_deur.id,'shift','start',now_at,1,'server',auth.uid()::text,now_at,nullif(command->>'clientCreatedAt','')::timestamptz,command->>'commandId',command->>'idempotencyKey',command->>'deviceId',true),(gen_random_uuid()::text,new_deur.id,'operation','start',now_at,2,'server',auth.uid()::text,now_at,nullif(command->>'clientCreatedAt','')::timestamptz,command->>'commandId',command->>'idempotencyKey',command->>'deviceId',true);
  INSERT INTO audit_log(id,aggregate_type,aggregate_id,action,actor_id,occurred_at,correlation_id,new_values) VALUES(gen_random_uuid()::text,'DEUR',new_deur.id,'START_SHIFT',auth.uid()::text,now_at,command->>'commandId',to_jsonb(new_deur));
  response=jsonb_build_object('success',true,'disposition','ACCEPTED','record',to_jsonb(new_deur),'version',1,'serverOccurredAt',now_at);
  RETURN finish_deur_command(command,'START_SHIFT',new_deur.id,payload_hash,response);
EXCEPTION WHEN unique_violation THEN RETURN jsonb_build_object('success',false,'code','DUPLICATE_ACTIVE_DEUR');
END $$;

ALTER FUNCTION erp.resolve_uat_limited_pilot_work_date(text,date) OWNER TO postgres;
ALTER FUNCTION erp.advance_uat_limited_pilot_business_date(jsonb) OWNER TO postgres;
ALTER FUNCTION erp.inspect_uat_limited_pilot_business_date(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.resolve_uat_limited_pilot_work_date(text,date),erp.advance_uat_limited_pilot_business_date(jsonb),erp.inspect_uat_limited_pilot_business_date(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION erp.advance_uat_limited_pilot_business_date(jsonb),erp.inspect_uat_limited_pilot_business_date(jsonb) TO service_role;
COMMIT;
