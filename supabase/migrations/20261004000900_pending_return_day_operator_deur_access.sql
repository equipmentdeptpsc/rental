BEGIN;

SET LOCAL search_path=erp,auth,extensions,pg_catalog;

-- A returned line is not normally operational work.  The sole exception is a
-- same-business-day, still-unresolved PER_WORKDAY expectation for the line's
-- own linked operator.  Keep that exception server-derived and deliberately
-- bounded so completed history never becomes a general work queue.
CREATE OR REPLACE FUNCTION erp.read_pending_return_day_deur_eligibility(target_line_id text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=erp,auth,extensions,pg_catalog AS $$
DECLARE
  tenant text:=erp.current_company_id(); actor erp.users%ROWTYPE;
  line erp.rental_equipment_lines%ROWTYPE; rental erp.rentals%ROWTYPE;
  assignment erp.assignments%ROWTYPE; snapshot jsonb; timezone_name text;
  work_day date; operational_day date; in_progress boolean:=false;
BEGIN
  IF auth.uid() IS NULL OR tenant IS NULL THEN RETURN jsonb_build_object('success',false,'code','UNAUTHENTICATED'); END IF;
  SELECT * INTO actor FROM erp.users WHERE id=auth.uid() AND company_id=tenant AND status='active';
  IF actor.id IS NULL OR actor.operator_id IS NULL THEN RETURN jsonb_build_object('success',false,'code','OPERATOR_LINK_REQUIRED'); END IF;
  SELECT * INTO line FROM erp.rental_equipment_lines
    WHERE id=target_line_id AND company_id=tenant AND operator_id=actor.operator_id AND deleted_at IS NULL;
  IF line.id IS NULL THEN RETURN jsonb_build_object('success',true,'eligible',false); END IF;
  SELECT * INTO rental FROM erp.rentals WHERE id=line.rental_id AND company_id=tenant;
  SELECT * INTO assignment FROM erp.assignments WHERE id=line.assignment_id AND company_id=tenant;
  snapshot:=nullif(line.operational_metadata->'deurExpectationSnapshot','null'::jsonb);
  IF rental.id IS NULL OR assignment.id IS NULL OR snapshot IS NULL
    OR rental.status::text NOT IN ('Active','Returned')
    OR line.status::text<>'Returned' OR line.actual_return_date IS NULL
    OR assignment.status::text<>'Completed' OR assignment.returned_date IS DISTINCT FROM line.actual_return_date
    OR snapshot#>>'{policy,frequency}'<>'PER_WORKDAY'
    OR snapshot->>'rentalId' IS DISTINCT FROM rental.id
    OR snapshot->>'rentalEquipmentLineId' IS DISTINCT FROM line.id
    OR snapshot->>'equipmentId' IS DISTINCT FROM line.equipment_id
    OR snapshot->>'assignmentId' IS DISTINCT FROM assignment.id
    OR snapshot->>'operatorId' IS DISTINCT FROM actor.operator_id
  THEN RETURN jsonb_build_object('success',true,'eligible',false); END IF;
  timezone_name:=coalesce(nullif(snapshot#>>'{policy,timezone}',''),nullif(rental.timezone,''),'Asia/Manila');
  IF NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=timezone_name) THEN RETURN jsonb_build_object('success',true,'eligible',false); END IF;
  work_day:=line.actual_return_date;
  operational_day:=timezone(timezone_name,erp.deur_operational_clock())::date;
  IF work_day<>operational_day
    OR work_day<greatest((snapshot#>>'{policy,effectiveFrom}')::date,timezone(timezone_name,rental.released_at)::date)
    OR coalesce(snapshot#>'{policy,excludeDates}','[]'::jsonb) ? work_day::text
  THEN RETURN jsonb_build_object('success',true,'eligible',false); END IF;
  SELECT EXISTS(
    SELECT 1 FROM erp.deurs d WHERE d.company_id=tenant AND d.rental_id=rental.id
      AND d.rental_equipment_line_id=line.id AND d.assignment_id=assignment.id
      AND d.equipment_id=line.equipment_id AND d.operator_id=actor.operator_id
      AND d.work_date=work_day AND d.status='In Progress' AND d.previous_revision_id IS NULL
  ) INTO in_progress;
  IF in_progress THEN RETURN jsonb_build_object('success',true,'eligible',true,'state','IN_PROGRESS','workDate',work_day); END IF;
  IF EXISTS(SELECT 1 FROM erp.deur_expectation_dispositions d WHERE d.company_id=tenant AND d.rental_id=rental.id AND d.rental_equipment_line_id=line.id AND d.work_date=work_day)
    OR EXISTS(SELECT 1 FROM erp.deurs d WHERE d.company_id=tenant AND d.rental_equipment_line_id=line.id AND d.work_date=work_day AND d.previous_revision_id IS NULL)
  THEN RETURN jsonb_build_object('success',true,'eligible',false); END IF;
  RETURN jsonb_build_object('success',true,'eligible',true,'state','PENDING','workDate',work_day);
END $$;

CREATE OR REPLACE FUNCTION erp.read_pending_operator_return_day_deur_work()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=erp,auth,extensions,pg_catalog AS $$
DECLARE
  tenant text:=erp.current_company_id(); actor erp.users%ROWTYPE; item record;
  eligibility jsonb; work_items jsonb:='[]'::jsonb;
BEGIN
  IF auth.uid() IS NULL OR tenant IS NULL THEN RETURN jsonb_build_object('success',false,'code','UNAUTHENTICATED'); END IF;
  SELECT * INTO actor FROM erp.users WHERE id=auth.uid() AND company_id=tenant AND status='active';
  IF actor.id IS NULL OR actor.operator_id IS NULL THEN RETURN jsonb_build_object('success',false,'code','OPERATOR_LINK_REQUIRED'); END IF;
  FOR item IN
    SELECT line.*, assignment.project_id, assignment.status AS assignment_status,
      equipment.equipment_name, equipment.asset_no, equipment.current_reading,
      rental.rental_number, rental.status AS rental_status
    FROM erp.rental_equipment_lines line
    JOIN erp.assignments assignment ON assignment.id=line.assignment_id AND assignment.company_id=tenant
    JOIN erp.equipment equipment ON equipment.id=line.equipment_id AND equipment.company_id=tenant
    JOIN erp.rentals rental ON rental.id=line.rental_id AND rental.company_id=tenant
    WHERE line.company_id=tenant AND line.operator_id=actor.operator_id AND line.deleted_at IS NULL
    ORDER BY rental.rental_number, equipment.asset_no, line.id
  LOOP
    eligibility:=erp.read_pending_return_day_deur_eligibility(item.id);
    IF eligibility->>'eligible'<>'true' THEN CONTINUE; END IF;
    work_items:=work_items||jsonb_build_array(jsonb_build_object(
      'assignment',jsonb_build_object('id',item.assignment_id,'projectId',item.project_id,'status',item.assignment_status),
      'equipment',jsonb_build_object('id',item.equipment_id,'name',item.equipment_name,'assetNumber',item.asset_no,'currentReading',item.current_reading),
      'rental',jsonb_build_object('id',item.rental_id,'rentalNumber',item.rental_number,'status',item.rental_status),
      'rentalLine',jsonb_build_object('id',item.id,'status',item.status,'operationalMetadata',coalesce(item.operational_metadata,'{}'::jsonb)),
      'deurEligibility',jsonb_build_object('kind','PENDING_RETURN_DAY','workDate',eligibility->>'workDate','state',eligibility->>'state')
    ));
  END LOOP;
  RETURN jsonb_build_object('success',true,'operatorId',actor.operator_id,'work',work_items);
END $$;

CREATE OR REPLACE FUNCTION erp.validate_deur_command_scope(command jsonb, required_permission text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=erp,auth,extensions,pg_catalog AS $$
DECLARE
  tenant text:=erp.current_company_id(); app_user erp.users%ROWTYPE;
  target_operator erp.operators%ROWTYPE; target_rental erp.rentals%ROWTYPE;
  target_line erp.rental_equipment_lines%ROWTYPE; target_assignment erp.assignments%ROWTYPE;
  return_day jsonb;
BEGIN
  IF auth.uid() IS NULL OR tenant IS NULL THEN RETURN jsonb_build_object('code','UNAUTHENTICATED'); END IF;
  SELECT * INTO app_user FROM erp.users WHERE id=auth.uid() AND company_id=tenant AND status='active';
  IF app_user.id IS NULL THEN RETURN jsonb_build_object('code','USER_INACTIVE'); END IF;
  IF NOT erp.current_user_has_permission(required_permission) THEN RETURN jsonb_build_object('code','FORBIDDEN'); END IF;
  IF app_user.operator_id IS NULL OR app_user.operator_id<>command->>'operatorId' THEN RETURN jsonb_build_object('code','OWNERSHIP_MISMATCH'); END IF;
  SELECT * INTO target_operator FROM erp.operators WHERE id=command->>'operatorId' AND company_id=tenant;
  IF target_operator.id IS NULL THEN RETURN jsonb_build_object('code','NOT_FOUND'); END IF;
  IF target_operator.status<>'Active' THEN RETURN jsonb_build_object('code','OPERATOR_INACTIVE'); END IF;
  SELECT * INTO target_rental FROM erp.rentals WHERE id=command->>'rentalId' AND company_id=tenant;
  IF target_rental.id IS NULL THEN RETURN jsonb_build_object('code','NOT_FOUND'); END IF;
  SELECT * INTO target_line FROM erp.rental_equipment_lines WHERE id=command->>'rentalLineId' AND company_id=tenant;
  IF target_line.id IS NULL THEN RETURN jsonb_build_object('code','NOT_FOUND'); END IF;
  IF target_line.rental_id<>target_rental.id OR target_line.equipment_id<>command->>'equipmentId' OR target_line.operator_id<>app_user.operator_id OR target_line.assignment_id IS DISTINCT FROM command->>'assignmentId' THEN RETURN jsonb_build_object('code','VALIDATION_REJECTED'); END IF;
  SELECT * INTO target_assignment FROM erp.assignments WHERE id=command->>'assignmentId' AND company_id=tenant;
  IF target_assignment.id IS NULL OR target_assignment.equipment_id<>target_line.equipment_id OR target_assignment.operator_id<>target_line.operator_id THEN RETURN jsonb_build_object('code','ASSIGNMENT_MISMATCH'); END IF;
  IF target_rental.status::text IN ('Released','Active') AND target_line.status::text IN ('Released','Active') AND target_line.deleted_at IS NULL AND target_assignment.status::text='Active' AND target_assignment.deleted_at IS NULL THEN
    RETURN jsonb_build_object('code','OK','userId',app_user.id,'operatorId',app_user.operator_id);
  END IF;
  return_day:=erp.read_pending_return_day_deur_eligibility(target_line.id);
  IF return_day->>'eligible'='true' AND return_day->>'state'='PENDING' THEN
    RETURN jsonb_build_object('code','OK','userId',app_user.id,'operatorId',app_user.operator_id,'historicalReturnDay',true,'workDate',return_day->>'workDate');
  END IF;
  IF target_rental.status::text NOT IN ('Released','Active','Returned') THEN RETURN jsonb_build_object('code','RENTAL_INACTIVE'); END IF;
  IF target_line.status::text NOT IN ('Released','Active') OR target_line.deleted_at IS NOT NULL THEN RETURN jsonb_build_object('code','RENTAL_LINE_INACTIVE'); END IF;
  RETURN jsonb_build_object('code','ASSIGNMENT_INACTIVE');
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
  snap:=nullif(line.operational_metadata->'deurExpectationSnapshot','null'::jsonb); policy:=snap->>'meterRequirement';
  IF line.id IS NULL OR snap IS NULL OR policy NOT IN ('none','hourMeter','odometer','both') THEN RETURN jsonb_build_object('success',false,'code','DEUR_EXPECTATION_REQUIRED'); END IF;
  BEGIN opening_hour:=nullif(trim(command->'draft'->>'openingHourMeter'),'')::numeric; opening_odo:=nullif(trim(command->'draft'->>'openingOdometer'),'')::numeric;
  EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END;
  IF (opening_hour IS NOT NULL AND opening_hour<0) OR (opening_odo IS NOT NULL AND opening_odo<0) THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;
  IF ((policy IN ('odometer','both')) AND opening_odo IS NULL) OR (policy='odometer' AND opening_hour IS NOT NULL) OR (policy='hourMeter' AND opening_odo IS NOT NULL) OR (policy='none' AND (opening_hour IS NOT NULL OR opening_odo IS NOT NULL)) THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;
  IF scope->>'historicalReturnDay'='true' THEN
    effective_date:=line.actual_return_date;
    IF EXISTS(SELECT 1 FROM erp.deur_expectation_dispositions d WHERE d.company_id=erp.current_company_id() AND d.rental_id=line.rental_id AND d.rental_equipment_line_id=line.id AND d.work_date=effective_date) THEN RETURN jsonb_build_object('success',false,'code','EXPECTATION_WAIVED'); END IF;
    IF EXISTS(SELECT 1 FROM erp.deurs d WHERE d.company_id=erp.current_company_id() AND d.rental_equipment_line_id=line.id AND d.work_date=effective_date AND d.previous_revision_id IS NULL) THEN RETURN jsonb_build_object('success',false,'code','DEUR_ALREADY_OPEN'); END IF;
  ELSE
    effective_date:=erp.resolve_uat_limited_pilot_work_date(line.id,(snap->>'workDate')::date);
  END IF;
  idem:=erp.begin_deur_command(command,'START_SHIFT');
  IF idem->>'state'='MISMATCH' THEN RETURN jsonb_build_object('success',false,'code','IDEMPOTENCY_MISMATCH'); END IF;
  IF idem->>'state'='REPLAY' THEN RETURN (idem->'response')||jsonb_build_object('disposition','REPLAYED'); END IF;
  payload_hash:=idem->>'payloadHash'; selected_shift:=nullif(command->'draft'->>'shift','');
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

ALTER FUNCTION erp.read_pending_return_day_deur_eligibility(text) OWNER TO postgres;
ALTER FUNCTION erp.read_pending_operator_return_day_deur_work() OWNER TO postgres;
ALTER FUNCTION erp.validate_deur_command_scope(jsonb,text) OWNER TO postgres;
ALTER FUNCTION erp.command_start_deur_shift(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.read_pending_return_day_deur_eligibility(text),erp.read_pending_operator_return_day_deur_work() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION erp.read_pending_operator_return_day_deur_work() TO authenticated;
REVOKE ALL ON FUNCTION erp.command_start_deur_shift(jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION erp.command_start_deur_shift(jsonb) TO authenticated;

COMMIT;
