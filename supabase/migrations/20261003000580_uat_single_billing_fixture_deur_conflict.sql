BEGIN;
SET LOCAL search_path=erp,auth,extensions,pg_catalog;

CREATE OR REPLACE FUNCTION erp.provision_uat_single_billing_fixture_deur(command jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=erp,auth,extensions,pg_catalog AS $$
#variable_conflict use_variable
DECLARE
  tenant text:=trim(command->>'companyId');
  scenario_key text:=trim(command->>'scenarioKey');
  profile text:=trim(command->>'profileVersion');
  rental_id text:=trim(command->>'rentalId');
  line_id text:=trim(command->>'rentalEquipmentLineId');
  deur_id text:=trim(command->>'deurId');
  actor_id text:=trim(command->>'actorId');
  work_day date;
  start_at timestamptz;
  end_at timestamptz;
  target erp.deurs;
  rental erp.rentals;
  line erp.rental_equipment_lines;
  commercial erp.commercial_snapshots;
  existing_count integer;
BEGIN
  IF tenant<>'TENANT-LOCAL-001'
     OR scenario_key<>'BILLING_SINGLE_RENTAL_V1'
     OR profile<>'UAT_BILLING_SINGLE_RENTAL_V1'
     OR nullif(actor_id,'') IS NULL
     OR nullif(deur_id,'') IS NULL
     OR nullif(rental_id,'') IS NULL
     OR nullif(line_id,'') IS NULL
     OR nullif(command->>'commandId','') IS NULL
     OR nullif(command->>'idempotencyKey','') IS NULL
  THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;

  BEGIN
    work_day=(command->>'workDate')::date;
    start_at=(command#>>'{evidence,shiftStart}')::timestamptz;
    end_at=(command#>>'{evidence,shiftEnd}')::timestamptz;
  EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END;
  IF work_day IS NULL OR end_at<=start_at OR end_at-start_at<>interval '1 hour'
     OR (command#>>'{evidence,intervals,0,activityType}')<>'operation'
     OR (command#>>'{evidence,intervals,0,start}')::timestamptz<>start_at
     OR (command#>>'{evidence,intervals,0,end}')::timestamptz<>end_at
  THEN RETURN jsonb_build_object('success',false,'code','INVALID_EVIDENCE'); END IF;

  IF NOT EXISTS (
    SELECT 1 FROM erp.uat_single_billing_fixture_scenarios s
    WHERE s.company_id=tenant AND s.scenario_key=scenario_key
      AND s.profile_version=profile AND s.state='PROVISIONING'
      AND s.scenario->>'rentalId'=rental_id AND s.scenario->>'lineId'=line_id
      AND s.scenario->>'deurId'=deur_id
  ) THEN RETURN jsonb_build_object('success',false,'code','SCENARIO_NOT_CLAIMED'); END IF;

  SELECT * INTO rental FROM erp.rentals WHERE id=rental_id AND company_id=tenant FOR SHARE;
  SELECT * INTO line FROM erp.rental_equipment_lines WHERE id=line_id AND rental_id=rental_id AND company_id=tenant AND deleted_at IS NULL FOR SHARE;
  SELECT * INTO commercial FROM erp.commercial_snapshots WHERE rental_id=rental_id AND rental_equipment_line_id=line_id ORDER BY captured_at DESC LIMIT 1;
  IF rental.id IS NULL OR line.id IS NULL OR commercial.id IS NULL
     OR rental.status::text NOT IN('Released','Active','Returned','Closed')
  THEN RETURN jsonb_build_object('success',false,'code','FIXTURE_RELATIONSHIP_INVALID'); END IF;

  SELECT count(*) INTO existing_count FROM erp.deurs
  WHERE company_id=tenant AND rental_equipment_line_id=line_id AND work_date=work_day AND status<>'Rejected';
  IF existing_count>0 THEN
    SELECT * INTO target FROM erp.deurs WHERE company_id=tenant AND id=deur_id;
    IF target.id IS NULL THEN RETURN jsonb_build_object('success',false,'code','CONFLICTING_DEUR_EXISTS'); END IF;
    RETURN jsonb_build_object('success',true,'disposition','REPLAYED','deurId',target.id,'status',target.status);
  END IF;
  IF EXISTS(SELECT 1 FROM erp.deurs WHERE company_id=tenant AND id=deur_id) THEN
    RETURN jsonb_build_object('success',false,'code','DEUR_ID_CONFLICT');
  END IF;

  INSERT INTO erp.deurs(
    id,deur_number,rental_id,rental_equipment_line_id,assignment_id,equipment_id,operator_id,
    project_id,customer_id,commercial_snapshot_id,commercial_snapshot_required,creation_source,
    entry_mode,late_entry_reason,late_recorded_at,late_recorded_by,work_date,report_date,shift,
    status,evidence_mode,billing_method_snapshot,total_operating_minutes,total_idle_minutes,
    total_meal_break_minutes,total_maintenance_minutes,operational_metadata,operational_remarks,
    submitted_at,submitted_by,revision_chain_id,revision_number,original_deur_id,created_at,
    created_by,updated_at,updated_by,row_version,company_id
  ) VALUES(
    deur_id,erp.next_deur_number(),rental.id,line.id,line.assignment_id,line.equipment_id,line.operator_id,
    rental.project_id,rental.customer_id,commercial.id,true,'UAT_SYNTHETIC','LATE_ENTRY',
    'Synthetic UAT billing certification evidence.',clock_timestamp(),actor_id,work_day,work_day,'Day',
    'Submitted','TIME_TIMELINE',commercial.billing_method,60,0,0,0,
    coalesce(line.operational_metadata->'deurExpectationSnapshot'->'operationalMetadata','{}'::jsonb)
      ||jsonb_build_object('lateEntry',jsonb_build_object('recordedAt',clock_timestamp(),'reason','Synthetic UAT billing certification evidence.')),
    'Synthetic isolated-UAT billing certification runtime.',clock_timestamp(),actor_id, deur_id,1,deur_id,
    clock_timestamp(),actor_id,clock_timestamp(),actor_id,1,tenant
  ) RETURNING * INTO target;

  INSERT INTO erp.deur_events(id,deur_id,activity_type,action,occurred_at,sequence,source,actor_id,server_accepted_at,command_id,idempotency_key,is_open,company_id)
  VALUES
    (extensions.gen_random_uuid()::text,target.id,'shift','start',start_at,1,'uat-synthetic',actor_id,clock_timestamp(),command->>'commandId',command->>'idempotencyKey',false,tenant),
    (extensions.gen_random_uuid()::text,target.id,'operation','start',start_at,2,'uat-synthetic',actor_id,clock_timestamp(),command->>'commandId',command->>'idempotencyKey',false,tenant),
    (extensions.gen_random_uuid()::text,target.id,'operation','end',end_at,3,'uat-synthetic',actor_id,clock_timestamp(),command->>'commandId',command->>'idempotencyKey',false,tenant),
    (extensions.gen_random_uuid()::text,target.id,'shift','end',end_at,4,'uat-synthetic',actor_id,clock_timestamp(),command->>'commandId',command->>'idempotencyKey',false,tenant);
  INSERT INTO erp.audit_log(id,company_id,aggregate_type,aggregate_id,action,actor_id,occurred_at,correlation_id,new_values,metadata)
  VALUES(extensions.gen_random_uuid()::text,tenant,'DEUR',target.id,'DEUR_UAT_SYNTHETIC_CREATED',actor_id,clock_timestamp(),command->>'commandId',
    jsonb_build_object('workDate',work_day,'entryMode','LATE_ENTRY','operatingMinutes',60),
    jsonb_build_object('rentalId',rental.id,'rentalEquipmentLineId',line.id,'scenarioKey',scenario_key));
  RETURN jsonb_build_object('success',true,'disposition','ACCEPTED','deurId',target.id,'status',target.status,'operatingMinutes',60);
EXCEPTION WHEN unique_violation THEN
  RETURN jsonb_build_object('success',false,'code','CONFLICTING_DEUR_EXISTS');
WHEN OTHERS THEN
  RETURN jsonb_build_object('success',false,'code','HELPER_ERROR','sqlstate',SQLSTATE);
END $$;

ALTER FUNCTION erp.provision_uat_single_billing_fixture_deur(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.provision_uat_single_billing_fixture_deur(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION erp.provision_uat_single_billing_fixture_deur(jsonb) TO service_role;
COMMIT;
