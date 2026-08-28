BEGIN;

ALTER TABLE erp.deurs
  ADD COLUMN entry_mode text NOT NULL DEFAULT 'NORMAL',
  ADD COLUMN late_entry_reason text,
  ADD COLUMN late_recorded_at timestamptz,
  ADD COLUMN late_recorded_by uuid;

ALTER TABLE erp.deurs ADD CONSTRAINT ck_deur_late_entry_provenance CHECK (
  (entry_mode='NORMAL' AND late_entry_reason IS NULL AND late_recorded_at IS NULL AND late_recorded_by IS NULL)
  OR
  (entry_mode='LATE_ENTRY' AND length(btrim(late_entry_reason))>=10 AND late_recorded_at IS NOT NULL AND late_recorded_by IS NOT NULL)
);

DROP INDEX IF EXISTS erp.uq_active_deur_line_work_shift;
CREATE UNIQUE INDEX uq_deur_line_workday_origin
  ON erp.deurs(company_id,rental_equipment_line_id,work_date)
  WHERE previous_revision_id IS NULL;

CREATE OR REPLACE FUNCTION erp.command_start_deur_shift(command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,public,auth AS $$
DECLARE scope jsonb; idem jsonb; now_at timestamptz=clock_timestamp(); new_deur deurs; response jsonb; payload_hash text; line rental_equipment_lines; snap jsonb; expected_fingerprint text; selected_shift text; effective_work_date date;
BEGIN
  scope=validate_deur_command_scope(command,'deur.create'); IF scope->>'code'<>'OK' THEN RETURN jsonb_build_object('success',false,'code',scope->>'code'); END IF;
  SELECT * INTO line FROM rental_equipment_lines WHERE id=command->>'rentalLineId' FOR UPDATE;
  snap=nullif(line.operational_metadata->'deurExpectationSnapshot','null'::jsonb);
  IF snap IS NULL THEN RETURN jsonb_build_object('success',false,'code','DEUR_EXPECTATION_REQUIRED'); END IF;
  expected_fingerprint=current_deur_expectation_fingerprint(line.id);
  IF snap->>'sourceFingerprint' IS DISTINCT FROM expected_fingerprint THEN RETURN jsonb_build_object('success',false,'code','SNAPSHOT_STALE'); END IF;
  selected_shift=nullif(command->'draft'->>'shift','');
  effective_work_date=timezone(coalesce(nullif(snap#>>'{policy,timezone}',''),'UTC'),now_at)::date;
  idem=begin_deur_command(command,'START_SHIFT'); IF idem->>'state'='MISMATCH' THEN RETURN jsonb_build_object('success',false,'code','IDEMPOTENCY_MISMATCH'); END IF;
  IF idem->>'state'='REPLAY' THEN RETURN (idem->'response')||jsonb_build_object('disposition','REPLAYED'); END IF; payload_hash=idem->>'payloadHash';
  INSERT INTO deurs(id,deur_number,rental_id,rental_equipment_line_id,assignment_id,equipment_id,operator_id,project_id,customer_id,commercial_snapshot_id,commercial_snapshot_required,creation_source,work_date,shift,status,evidence_mode,billing_method_snapshot,opening_meter,operational_metadata,operational_remarks,created_at,created_by,updated_at,updated_by,row_version)
  SELECT command->'draft'->>'id',next_deur_number(),snap->>'rentalId',snap->>'rentalEquipmentLineId',snap->>'assignmentId',snap->>'equipmentId',snap->>'operatorId',snap->>'projectId',snap->>'customerId',cs.id,true,'OPERATOR_DIGITAL',effective_work_date,selected_shift,'In Progress',
    CASE snap->>'billingMethod' WHEN 'Per Kilometer' THEN 'ODOMETER_TRIP' WHEN 'Per Cubic Meter' THEN 'QUANTITY' WHEN 'One Lot' THEN 'COMPLETION' WHEN 'Per Lot' THEN 'COMPLETION' ELSE 'TIME_TIMELINE' END,
    (snap->>'billingMethod')::billing_method,CASE WHEN snap->>'meterRequirement' IN ('hourMeter','odometer','both') THEN nullif(command->'draft'->>'openingMeter','')::numeric END,
    (snap->'operationalMetadata')||jsonb_build_object('workDescription',snap->'workDescription'),coalesce(nullif(command->'draft'->>'operationalRemarks',''),snap->>'operationalRemarks'),now_at,auth.uid()::text,now_at,auth.uid()::text,1
  FROM commercial_snapshots cs WHERE cs.rental_equipment_line_id=line.id AND cs.rental_id=line.rental_id RETURNING * INTO new_deur;
  IF new_deur.id IS NULL THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;
  INSERT INTO deur_events(id,deur_id,activity_type,action,occurred_at,sequence,source,actor_id,server_accepted_at,client_created_at,command_id,idempotency_key,device_id,is_open)
  VALUES(extensions.gen_random_uuid()::text,new_deur.id,'shift','start',now_at,1,'server',auth.uid()::text,now_at,nullif(command->>'clientCreatedAt','')::timestamptz,command->>'commandId',command->>'idempotencyKey',command->>'deviceId',true),(extensions.gen_random_uuid()::text,new_deur.id,'operation','start',now_at,2,'server',auth.uid()::text,now_at,nullif(command->>'clientCreatedAt','')::timestamptz,command->>'commandId',command->>'idempotencyKey',command->>'deviceId',true);
  INSERT INTO audit_log(id,aggregate_type,aggregate_id,action,actor_id,occurred_at,correlation_id,new_values) VALUES(extensions.gen_random_uuid()::text,'DEUR',new_deur.id,'START_SHIFT',auth.uid()::text,now_at,command->>'commandId',to_jsonb(new_deur));
  response=jsonb_build_object('success',true,'disposition','ACCEPTED','record',to_jsonb(new_deur),'version',1,'serverOccurredAt',now_at);
  RETURN finish_deur_command(command,'START_SHIFT',new_deur.id,payload_hash,response);
EXCEPTION WHEN unique_violation THEN RETURN jsonb_build_object('success',false,'code','DUPLICATE_ACTIVE_DEUR');
END $$;

INSERT INTO erp.app_permissions(id,code,name,resource,action,catalog_version,active,deprecated_at,replacement_permission,risk_class)
VALUES(extensions.gen_random_uuid()::text,'deur.lateEntry.create','Create auditable late DEUR entry','deur','lateEntry.create','2.0-extension',true,NULL,ARRAY[]::text[],'APPROVAL')
ON CONFLICT(code) DO UPDATE SET name=EXCLUDED.name,resource=EXCLUDED.resource,action=EXCLUDED.action,catalog_version=EXCLUDED.catalog_version,active=true,deprecated_at=NULL,replacement_permission=ARRAY[]::text[],risk_class=EXCLUDED.risk_class;

INSERT INTO erp.role_permissions(role_id,permission_id)
SELECT role.id,permission.id FROM erp.app_roles role CROSS JOIN erp.app_permissions permission
WHERE role.code='system-administrator' AND role.active AND role.deprecated_at IS NULL AND permission.code='deur.lateEntry.create'
ON CONFLICT DO NOTHING;

DELETE FROM erp.role_permissions mapping USING erp.app_roles role,erp.app_permissions permission
WHERE mapping.role_id=role.id AND mapping.permission_id=permission.id
  AND permission.code='deur.lateEntry.create' AND role.code<>'system-administrator';

CREATE FUNCTION erp.command_create_late_deur(command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,auth,extensions,pg_catalog AS $$
DECLARE
  tenant text=erp.current_company_id(); actor uuid=auth.uid(); now_at timestamptz=clock_timestamp();
  target erp.rentals; line erp.rental_equipment_lines; snapshot jsonb; commercial erp.commercial_snapshots;
  work_day date; local_today date; release_day date; return_day date; timezone_name text;
  shift_start timestamptz; shift_end timestamptz; selected_shift text; reason_text text;
  interval_item jsonb; interval_start timestamptz; interval_end timestamptz; previous_end timestamptz;
  activity text; sequence_no integer=2; operation_minutes integer=0; idle_minutes integer=0;
  meal_minutes integer=0; breakdown_minutes integer=0; duration_minutes integer;
  idem jsonb; payload_hash text; response jsonb; created_deur erp.deurs;
BEGIN
  IF tenant IS NULL OR actor IS NULL THEN RETURN jsonb_build_object('success',false,'code','UNAUTHENTICATED'); END IF;
  IF NOT erp.current_user_has_permission('deur.lateEntry.create') THEN RETURN jsonb_build_object('success',false,'code','FORBIDDEN'); END IF;
  IF command ?| ARRAY['companyId','company_id','tenantId','tenant_id','actor','actorId','actor_id','recordedAt','recorded_at','recordedBy','recorded_by','createdAt','created_at','createdBy','created_by']
    OR nullif(btrim(command->>'rentalId'),'') IS NULL OR nullif(btrim(command->>'rentalEquipmentLineId'),'') IS NULL
    OR nullif(btrim(command->>'workDate'),'') IS NULL OR nullif(btrim(command->>'reason'),'') IS NULL
    OR nullif(btrim(command->>'commandId'),'') IS NULL OR nullif(btrim(command->>'idempotencyKey'),'') IS NULL
    OR jsonb_typeof(command->'evidence')<>'object' OR jsonb_typeof(command->'evidence'->'intervals')<>'array'
  THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;
  reason_text=btrim(command->>'reason');
  IF length(reason_text)<10 OR length(reason_text)>1000 THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;
  BEGIN
    work_day=(command->>'workDate')::date;
    shift_start=(command#>>'{evidence,shiftStart}')::timestamptz;
    shift_end=(command#>>'{evidence,shiftEnd}')::timestamptz;
  EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END;

  SELECT * INTO target FROM erp.rentals WHERE id=command->>'rentalId' AND company_id=tenant FOR SHARE;
  IF target.id IS NULL THEN RETURN jsonb_build_object('success',false,'code','NOT_FOUND'); END IF;
  SELECT * INTO line FROM erp.rental_equipment_lines WHERE id=command->>'rentalEquipmentLineId' AND rental_id=target.id AND company_id=tenant AND deleted_at IS NULL FOR SHARE;
  IF line.id IS NULL THEN RETURN jsonb_build_object('success',false,'code','NOT_FOUND'); END IF;
  IF (command ? 'equipmentId' AND command->>'equipmentId'<>line.equipment_id)
    OR (command ? 'assignmentId' AND command->>'assignmentId'<>line.assignment_id)
    OR (command ? 'operatorId' AND command->>'operatorId'<>line.operator_id)
  THEN RETURN jsonb_build_object('success',false,'code','RELATIONSHIP_MISMATCH'); END IF;

  snapshot=line.operational_metadata->'deurExpectationSnapshot';
  timezone_name=coalesce(nullif(snapshot#>>'{policy,timezone}',''),'UTC');
  IF NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=timezone_name) THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;
  local_today=timezone(timezone_name,now_at)::date;
  release_day=timezone(timezone_name,target.released_at)::date;
  return_day=CASE WHEN target.returned_at IS NULL THEN NULL ELSE timezone(timezone_name,target.returned_at)::date END;
  IF target.status::text NOT IN('Released','Active','Returned','Closed') OR snapshot IS NULL
    OR snapshot#>>'{policy,frequency}'<>'PER_WORKDAY' OR work_day>=local_today
    OR work_day<greatest((snapshot#>>'{policy,effectiveFrom}')::date,release_day)
    OR (return_day IS NOT NULL AND work_day>return_day)
    OR coalesce(snapshot#>'{policy,excludeDates}','[]'::jsonb) ? work_day::text
  THEN RETURN jsonb_build_object('success',false,'code','EXPECTATION_NOT_ELIGIBLE'); END IF;
  IF timezone(timezone_name,shift_start)::date<>work_day OR shift_end<=shift_start OR shift_end>shift_start+interval '36 hours'
  THEN RETURN jsonb_build_object('success',false,'code','INVALID_EVIDENCE'); END IF;
  selected_shift=nullif(command#>>'{evidence,shift}','');
  IF selected_shift IS NOT NULL THEN
    selected_shift=btrim(selected_shift);
    IF selected_shift='' OR length(selected_shift)>80 OR selected_shift~'[[:cntrl:]]' THEN RETURN jsonb_build_object('success',false,'code','INVALID_EVIDENCE'); END IF;
  END IF;
  IF jsonb_array_length(command->'evidence'->'intervals')=0 THEN RETURN jsonb_build_object('success',false,'code','INVALID_EVIDENCE'); END IF;

  FOR interval_item IN SELECT value FROM jsonb_array_elements(command->'evidence'->'intervals') ORDER BY value->>'start' LOOP
    BEGIN interval_start=(interval_item->>'start')::timestamptz;interval_end=(interval_item->>'end')::timestamptz;
    EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('success',false,'code','INVALID_EVIDENCE'); END;
    activity=interval_item->>'activityType';
    IF activity NOT IN('operation','idle','mealBreak','breakdown') OR interval_end<=interval_start
      OR interval_start<shift_start OR interval_end>shift_end OR (previous_end IS NOT NULL AND interval_start<previous_end)
      OR timezone(timezone_name,interval_start)::date<work_day OR interval_end>shift_start+interval '36 hours'
    THEN RETURN jsonb_build_object('success',false,'code','INVALID_EVIDENCE'); END IF;
    duration_minutes=floor(extract(epoch FROM interval_end-interval_start)/60)::integer;
    IF duration_minutes<=0 THEN RETURN jsonb_build_object('success',false,'code','INVALID_EVIDENCE'); END IF;
    IF activity='operation' THEN operation_minutes:=operation_minutes+duration_minutes;
    ELSIF activity='idle' THEN idle_minutes:=idle_minutes+duration_minutes;
    ELSIF activity='mealBreak' THEN meal_minutes:=meal_minutes+duration_minutes;
    ELSE breakdown_minutes:=breakdown_minutes+duration_minutes;
    END IF;
    previous_end=interval_end;
  END LOOP;
  IF operation_minutes=0 THEN RETURN jsonb_build_object('success',false,'code','INVALID_EVIDENCE'); END IF;
  IF EXISTS(SELECT 1 FROM erp.deur_expectation_dispositions d WHERE d.company_id=tenant AND d.rental_id=target.id AND d.rental_equipment_line_id=line.id AND d.work_date=work_day)
  THEN RETURN jsonb_build_object('success',false,'code','EXPECTATION_WAIVED'); END IF;
  IF EXISTS(SELECT 1 FROM erp.deurs d WHERE d.company_id=tenant AND d.rental_id=target.id AND d.rental_equipment_line_id=line.id AND d.work_date=work_day)
  THEN RETURN jsonb_build_object('success',false,'code','EXPECTATION_HAS_DEUR'); END IF;
  SELECT * INTO commercial FROM erp.commercial_snapshots cs WHERE cs.rental_id=target.id AND cs.rental_equipment_line_id=line.id ORDER BY cs.captured_at DESC LIMIT 1;
  IF commercial.id IS NULL THEN RETURN jsonb_build_object('success',false,'code','MISSING_RELATIONSHIP'); END IF;

  idem=erp.begin_operational_command(command,'CREATE_LATE_DEUR','DEUR_EXPECTATION',line.id||':'||work_day::text,tenant,actor::text);
  IF idem->>'state'='INVALID' THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); ELSIF idem->>'state'='MISMATCH' THEN RETURN jsonb_build_object('success',false,'code','IDEMPOTENCY_MISMATCH'); ELSIF idem->>'state'='REPLAY' THEN RETURN (idem->'response')||jsonb_build_object('disposition','REPLAYED'); END IF;
  payload_hash=idem->>'payloadHash';
  INSERT INTO erp.deurs(id,deur_number,rental_id,rental_equipment_line_id,assignment_id,equipment_id,operator_id,project_id,customer_id,commercial_snapshot_id,commercial_snapshot_required,
    creation_source,entry_mode,late_entry_reason,late_recorded_at,late_recorded_by,work_date,report_date,shift,status,evidence_mode,billing_method_snapshot,
    total_operating_minutes,total_idle_minutes,total_meal_break_minutes,total_maintenance_minutes,operational_metadata,operational_remarks,submitted_at,submitted_by,
    revision_chain_id,revision_number,original_deur_id,created_at,created_by,updated_at,updated_by,row_version,company_id)
  VALUES(command->>'deurId',erp.next_deur_number(),target.id,line.id,line.assignment_id,line.equipment_id,line.operator_id,target.project_id,target.customer_id,commercial.id,true,
    'LATE_ENTRY','LATE_ENTRY',reason_text,now_at,actor,work_day,work_day,selected_shift,'Submitted','TIME_TIMELINE',commercial.billing_method,
    operation_minutes,idle_minutes,meal_minutes,breakdown_minutes,(snapshot->'operationalMetadata')||jsonb_build_object('workDescription',snapshot->'workDescription','lateEntry',jsonb_build_object('recordedAt',now_at,'reason',reason_text)),snapshot->>'operationalRemarks',now_at,actor::text,
    command->>'deurId',1,command->>'deurId',now_at,actor::text,now_at,actor::text,1,tenant) RETURNING * INTO created_deur;

  INSERT INTO erp.deur_events(id,deur_id,activity_type,action,occurred_at,sequence,source,actor_id,server_accepted_at,command_id,idempotency_key,is_open,company_id)
  VALUES(extensions.gen_random_uuid()::text,created_deur.id,'shift','start',shift_start,1,'late-entry',actor::text,now_at,command->>'commandId',command->>'idempotencyKey',false,tenant);
  FOR interval_item IN SELECT value FROM jsonb_array_elements(command->'evidence'->'intervals') ORDER BY value->>'start' LOOP
    INSERT INTO erp.deur_events(id,deur_id,activity_type,action,occurred_at,sequence,source,actor_id,server_accepted_at,command_id,idempotency_key,is_open,company_id)
    VALUES(extensions.gen_random_uuid()::text,created_deur.id,interval_item->>'activityType','start',(interval_item->>'start')::timestamptz,sequence_no,'late-entry',actor::text,now_at,command->>'commandId',command->>'idempotencyKey',false,tenant),
      (extensions.gen_random_uuid()::text,created_deur.id,interval_item->>'activityType','end',(interval_item->>'end')::timestamptz,sequence_no+1,'late-entry',actor::text,now_at,command->>'commandId',command->>'idempotencyKey',false,tenant);
    sequence_no=sequence_no+2;
  END LOOP;
  INSERT INTO erp.deur_events(id,deur_id,activity_type,action,occurred_at,sequence,source,actor_id,server_accepted_at,command_id,idempotency_key,is_open,company_id)
  VALUES(extensions.gen_random_uuid()::text,created_deur.id,'shift','end',shift_end,sequence_no,'late-entry',actor::text,now_at,command->>'commandId',command->>'idempotencyKey',false,tenant);
  INSERT INTO erp.audit_log(id,company_id,aggregate_type,aggregate_id,action,actor_id,occurred_at,correlation_id,new_values,metadata)
  VALUES(extensions.gen_random_uuid()::text,tenant,'DEUR',created_deur.id,'DEUR_LATE_ENTRY_CREATED',actor::text,now_at,command->>'commandId',
    jsonb_build_object('workDate',work_day,'entryMode','LATE_ENTRY','recordedAt',now_at,'reason',reason_text),
    jsonb_build_object('rentalId',target.id,'rentalEquipmentLineId',line.id,'equipmentId',line.equipment_id,'assignmentId',line.assignment_id,'operatorId',line.operator_id));
  response=jsonb_build_object('success',true,'disposition','ACCEPTED','value',jsonb_build_object('rentalId',target.id,'rentalEquipmentLineId',line.id,'deurId',created_deur.id,'workDate',work_day,'status','Submitted','version',1,'entryMode','LATE_ENTRY','recordedAt',now_at));
  RETURN erp.finish_operational_command(command,'CREATE_LATE_DEUR','DEUR_EXPECTATION',line.id||':'||work_day::text,tenant,actor::text,payload_hash,response,1);
EXCEPTION WHEN unique_violation THEN RETURN jsonb_build_object('success',false,'code','EXPECTATION_HAS_DEUR');
END $$;

CREATE FUNCTION erp.enrich_late_deur_customer_review_snapshot() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,pg_catalog AS $$
DECLARE target erp.deurs;
BEGIN
  SELECT * INTO target FROM erp.deurs WHERE id=coalesce(NEW.revision_id,NEW.deur_id) AND company_id=NEW.company_id;
  IF target.entry_mode='LATE_ENTRY' THEN NEW.snapshot=NEW.snapshot||jsonb_build_object('entryMode','LATE_ENTRY','recordedLaterAt',target.late_recorded_at,'lateEntryReason',target.late_entry_reason); END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER zz_late_deur_customer_review_snapshot BEFORE INSERT ON erp.customer_review_requests FOR EACH ROW EXECUTE FUNCTION erp.enrich_late_deur_customer_review_snapshot();

CREATE FUNCTION erp.enrich_late_deur_batch_item_snapshot() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,pg_catalog AS $$
DECLARE target erp.deurs;
BEGIN
  SELECT * INTO target FROM erp.deurs WHERE id=NEW.deur_id AND company_id=NEW.company_id;
  IF target.entry_mode='LATE_ENTRY' THEN NEW.item_snapshot=NEW.item_snapshot||jsonb_build_object('entryMode','LATE_ENTRY','recordedLaterAt',target.late_recorded_at,'lateEntryReason',target.late_entry_reason); END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER zz_late_deur_batch_item_snapshot BEFORE INSERT ON erp.customer_review_batch_items FOR EACH ROW EXECUTE FUNCTION erp.enrich_late_deur_batch_item_snapshot();

ALTER FUNCTION erp.command_create_late_deur(jsonb) OWNER TO postgres;
ALTER FUNCTION erp.command_start_deur_shift(jsonb) OWNER TO postgres;
ALTER FUNCTION erp.enrich_late_deur_customer_review_snapshot() OWNER TO postgres;
ALTER FUNCTION erp.enrich_late_deur_batch_item_snapshot() OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.command_create_late_deur(jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION erp.command_create_late_deur(jsonb) TO authenticated;
REVOKE ALL ON FUNCTION erp.command_start_deur_shift(jsonb) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION erp.command_start_deur_shift(jsonb) TO authenticated;
REVOKE ALL ON FUNCTION erp.enrich_late_deur_customer_review_snapshot(),erp.enrich_late_deur_batch_item_snapshot() FROM PUBLIC,anon,authenticated,service_role;

COMMENT ON FUNCTION erp.command_create_late_deur(jsonb) IS 'Creates a fully evidenced, explicitly late historical DEUR with server-derived recording provenance; it never changes normal Operator Start Shift date semantics.';
COMMIT;
