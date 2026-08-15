BEGIN;
SET search_path TO erp, auth, pg_catalog;

CREATE FUNCTION erp.command_prepare_reserved_rental_aggregate(command jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path=erp,auth,pg_catalog AS $$
DECLARE
  tenant text; actor text; target erp.rentals; line_row erp.rental_equipment_lines;
  equipment_row erp.equipment; assignment_row erp.assignments; cost_row erp.cost_codes;
  activity_row erp.activity_codes; work_row erp.work_descriptions;
  line_input jsonb; first_line jsonb; terms jsonb; policy jsonb; shifts jsonb; shift_item jsonb;
  idem jsonb; payload_hash text; now_at timestamptz=clock_timestamp(); response jsonb;
  metadata jsonb; snapshot jsonb; readiness jsonb; projections jsonb='[]'::jsonb;
  billing erp.billing_method; meter text; expected_version bigint;
  supplied_ids text[]; active_ids text[]; supplied_count integer; active_count integer;
BEGIN
  tenant=(SELECT company_id FROM erp.users WHERE id=auth.uid() AND status='active'); actor=auth.uid()::text;
  IF tenant IS NULL THEN RETURN jsonb_build_object('success',false,'code','UNAUTHENTICATED','message','Authentication is required.','retryable',false,'refreshRequired',false); END IF;
  IF NOT erp.current_user_has_permission('rental.manage') THEN RETURN jsonb_build_object('success',false,'code','FORBIDDEN','message','Rental management permission is required.','retryable',false,'refreshRequired',false); END IF;
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(command) k(key) WHERE key NOT IN('commandId','idempotencyKey','expectedRentalVersion','rentalId','lines'))
     OR command ?| ARRAY['companyId','company_id','tenantId','tenant_id','actor','actorId','userId','frozenSnapshot','deurExpectationSnapshot','fingerprint']
     OR nullif(trim(command->>'commandId'),'') IS NULL OR nullif(trim(command->>'idempotencyKey'),'') IS NULL
     OR nullif(trim(command->>'rentalId'),'') IS NULL OR jsonb_typeof(command->'lines')<>'array'
     OR jsonb_array_length(command->'lines')=0 THEN
    RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED','message','Aggregate Rental preparation payload is invalid.','retryable',false,'refreshRequired',false);
  END IF;

  SELECT * INTO target FROM erp.rentals WHERE id=command->>'rentalId' AND company_id=tenant FOR UPDATE;
  IF target.id IS NULL THEN RETURN jsonb_build_object('success',false,'code','NOT_FOUND','message','Rental was not found.','retryable',false,'refreshRequired',false); END IF;
  IF target.status<>'Reserved' THEN RETURN jsonb_build_object('success',false,'code','INVALID_TRANSITION','message','Only a Reserved Rental can be prepared.','retryable',false,'refreshRequired',false); END IF;
  SELECT count(*),array_agg(value->>'lineId' ORDER BY value->>'lineId') INTO supplied_count,supplied_ids FROM jsonb_array_elements(command->'lines');
  IF supplied_count<>(SELECT count(DISTINCT value->>'lineId') FROM jsonb_array_elements(command->'lines')) THEN RETURN jsonb_build_object('success',false,'code','DUPLICATE_LINE','message','A Rental line was supplied more than once.','retryable',false,'refreshRequired',false); END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(command->'lines') value WHERE nullif(trim(value->>'lineId'),'') IS NULL) THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED','message','Every aggregate line requires a line ID.','retryable',false,'refreshRequired',false); END IF;

  SELECT count(*),array_agg(id ORDER BY id) INTO active_count,active_ids FROM erp.rental_equipment_lines WHERE rental_id=target.id AND company_id=tenant AND status='Reserved' AND deleted_at IS NULL;
  IF supplied_ids IS DISTINCT FROM active_ids THEN
    IF supplied_ids <@ active_ids THEN RETURN jsonb_build_object('success',false,'code','MISSING_LINE','message','The complete active Rental line set is required.','retryable',false,'refreshRequired',false); END IF;
    RETURN jsonb_build_object('success',false,'code','FOREIGN_RENTAL_LINE','message','The payload contains a line outside the active Rental line set.','retryable',false,'refreshRequired',false);
  END IF;

  PERFORM 1 FROM erp.rental_equipment_lines WHERE id=ANY(active_ids) ORDER BY id FOR UPDATE;
  PERFORM 1 FROM erp.equipment WHERE id IN(SELECT equipment_id FROM erp.rental_equipment_lines WHERE id=ANY(active_ids)) ORDER BY id FOR UPDATE;
  PERFORM 1 FROM erp.assignments WHERE id IN(SELECT assignment_id FROM erp.rental_equipment_lines WHERE id=ANY(active_ids)) ORDER BY id FOR UPDATE;
  PERFORM 1 FROM erp.operators WHERE id IN(SELECT operator_id FROM erp.rental_equipment_lines WHERE id=ANY(active_ids)) ORDER BY id FOR UPDATE;

  idem=erp.begin_operational_command(command,'PREPARE_RESERVED_RENTAL_AGGREGATE','RENTAL',target.id,tenant,actor);
  IF idem->>'state'='INVALID' THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED','message','An idempotency key is required.','retryable',false,'refreshRequired',false); END IF;
  IF idem->>'state'='MISMATCH' THEN RETURN jsonb_build_object('success',false,'code','IDEMPOTENCY_MISMATCH','message','Idempotency key payload mismatch.','retryable',false,'refreshRequired',false); END IF;
  IF idem->>'state'='REPLAY' THEN RETURN (idem->'response')||jsonb_build_object('disposition','REPLAYED'); END IF;
  payload_hash=idem->>'payloadHash'; first_line=command#>'{lines,0}';
  BEGIN expected_version=(command->>'expectedRentalVersion')::bigint; EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED','message','Expected Rental version is invalid.','retryable',false,'refreshRequired',false); END;
  IF expected_version IS NULL OR expected_version<>target.row_version THEN RETURN jsonb_build_object('success',false,'code','CONFLICT','message','Rental version is stale.','retryable',false,'refreshRequired',true,'currentVersion',target.row_version); END IF;

  -- Validate every line before any canonical preparation state is written.
  FOR line_input IN SELECT value FROM jsonb_array_elements(command->'lines') ORDER BY value->>'lineId' LOOP
    IF EXISTS(SELECT 1 FROM jsonb_object_keys(line_input) k(key) WHERE key NOT IN('lineId','commercialTerms','costCodeId','activityCodeId','workDescriptionId','operationalRemarks','deurPolicy','shiftWindows','workDate','meterRequirement'))
       OR line_input ?| ARRAY['companyId','company_id','tenantId','tenant_id','actor','actorId','userId','frozenSnapshot','deurExpectationSnapshot','fingerprint']
       OR jsonb_typeof(line_input->'commercialTerms')<>'object' OR jsonb_typeof(line_input->'deurPolicy')<>'object' OR jsonb_typeof(line_input->'shiftWindows')<>'array' THEN
      RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED','message','A Rental preparation line is invalid.','retryable',false,'refreshRequired',false);
    END IF;
    SELECT * INTO line_row FROM erp.rental_equipment_lines WHERE id=line_input->>'lineId' AND rental_id=target.id AND company_id=tenant AND status='Reserved' AND deleted_at IS NULL;
    IF line_row.operational_metadata ? 'deurExpectationSnapshot' OR EXISTS(SELECT 1 FROM erp.commercial_snapshots WHERE rental_equipment_line_id=line_row.id) THEN RETURN jsonb_build_object('success',false,'code','CONFLICT','message','A Rental line is already prepared.','retryable',false,'refreshRequired',true); END IF;
    SELECT * INTO equipment_row FROM erp.equipment WHERE id=line_row.equipment_id AND company_id=tenant AND active AND deleted_at IS NULL;
    SELECT * INTO assignment_row FROM erp.assignments WHERE id=line_row.assignment_id AND company_id=tenant AND status='Active' AND deleted_at IS NULL AND equipment_id=line_row.equipment_id AND operator_id=line_row.operator_id AND project_id=target.project_id;
    IF equipment_row.id IS NULL OR assignment_row.id IS NULL OR NOT EXISTS(SELECT 1 FROM erp.operators WHERE id=line_row.operator_id AND company_id=tenant AND status='Active' AND deleted_at IS NULL) OR NOT EXISTS(SELECT 1 FROM erp.projects WHERE id=target.project_id AND company_id=tenant AND active AND deleted_at IS NULL) THEN RETURN jsonb_build_object('success',false,'code','MISSING_RELATIONSHIP','message','A Rental line relationship is invalid.','retryable',false,'refreshRequired',false); END IF;
    IF line_input->>'costCodeId' IS DISTINCT FROM equipment_row.cost_code_id OR line_input->>'activityCodeId' IS DISTINCT FROM assignment_row.activity_code_id THEN RETURN jsonb_build_object('success',false,'code','MISSING_RELATIONSHIP','message','Cost and Activity Codes must match canonical Equipment and Assignment configuration.','retryable',false,'refreshRequired',false); END IF;
    SELECT * INTO cost_row FROM erp.cost_codes WHERE id=line_input->>'costCodeId' AND active AND deleted_at IS NULL;
    SELECT * INTO activity_row FROM erp.activity_codes WHERE id=line_input->>'activityCodeId' AND active AND deleted_at IS NULL;
    SELECT * INTO work_row FROM erp.work_descriptions WHERE id=line_input->>'workDescriptionId' AND active AND deleted_at IS NULL;
    IF cost_row.id IS NULL OR activity_row.id IS NULL OR work_row.id IS NULL THEN RETURN jsonb_build_object('success',false,'code','NOT_FOUND','message','Preparation reference data is unavailable.','retryable',false,'refreshRequired',false); END IF;
    IF work_row.requires_remarks AND nullif(trim(line_input->>'operationalRemarks'),'') IS NULL THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED','message','Operational remarks are required.','retryable',false,'refreshRequired',false); END IF;
    terms=line_input->'commercialTerms'; policy=line_input->'deurPolicy'; meter=line_input->>'meterRequirement';
    IF EXISTS(SELECT 1 FROM jsonb_object_keys(terms) k(key) WHERE key NOT IN('billingMethod','unitRate','minimumBillableHours','overtimeRate','standbyRate','mobilizationFee','demobilizationFee','fuelCharge','operatorIncluded','operatorRate','taxRate','withholdingTax','contractAmount','currency')) THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED','message','Commercial terms contain unsupported fields.','retryable',false,'refreshRequired',false); END IF;
    BEGIN
      billing=(terms->>'billingMethod')::erp.billing_method;
      IF nullif(terms->>'unitRate','') IS NULL OR (terms->>'unitRate')::numeric<0 OR coalesce((terms->>'minimumBillableHours')::numeric,0)<0 OR coalesce((terms->>'overtimeRate')::numeric,0)<0 OR coalesce((terms->>'standbyRate')::numeric,0)<0 OR coalesce((terms->>'mobilizationFee')::numeric,0)<0 OR coalesce((terms->>'demobilizationFee')::numeric,0)<0 OR coalesce((terms->>'fuelCharge')::numeric,0)<0 OR coalesce((terms->>'operatorRate')::numeric,0)<0 OR coalesce((terms->>'contractAmount')::numeric,0)<0 OR coalesce((terms->>'taxRate')::numeric,0) NOT BETWEEN 0 AND 100 OR coalesce((terms->>'withholdingTax')::numeric,0) NOT BETWEEN 0 AND 100 OR coalesce(length(terms->>'currency'),0)<>3 OR jsonb_typeof(terms->'operatorIncluded')<>'boolean' THEN RAISE EXCEPTION 'invalid terms'; END IF;
    EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED','message','Commercial terms are invalid.','retryable',false,'refreshRequired',false); END;
    IF meter NOT IN('none','odometer','hourMeter','both') OR (meter IN('odometer','both') AND coalesce(equipment_row.maintenance_type,'') NOT IN('Kilometers','Mileage')) OR (meter IN('hourMeter','both') AND coalesce(equipment_row.maintenance_type,'')<>'Engine Hours') THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED','message','Meter requirement is incompatible with Equipment configuration.','retryable',false,'refreshRequired',false); END IF;
    IF policy->>'frequency' NOT IN('PER_WORKDAY','PER_SHIFT','ON_DEMAND') OR nullif(policy->>'effectiveFrom','') IS NULL OR nullif(line_input->>'workDate','') IS NULL THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED','message','DEUR policy or work date is invalid.','retryable',false,'refreshRequired',false); END IF;
    BEGIN IF (policy->>'effectiveFrom')::date<target.date_out OR (target.expected_return IS NOT NULL AND (policy->>'effectiveFrom')::date>target.expected_return) OR (line_input->>'workDate')::date<>target.date_out THEN RAISE EXCEPTION 'invalid dates'; END IF; EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED','message','DEUR policy or work date is invalid.','retryable',false,'refreshRequired',false); END;
    IF policy->>'frequency'='PER_SHIFT' THEN
      IF jsonb_array_length(line_input->'shiftWindows')=0 THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED','message','A shift window is required.','retryable',false,'refreshRequired',false); END IF;
      FOR shift_item IN SELECT value FROM jsonb_array_elements(line_input->'shiftWindows') LOOP
        BEGIN IF shift_item->>'code' NOT IN('DAY','NIGHT') OR nullif(shift_item->>'label','') IS NULL OR (shift_item->>'startTime')::time IS NULL OR (shift_item->>'endTime')::time IS NULL OR nullif(shift_item->>'timezone','') IS NULL THEN RAISE EXCEPTION 'invalid shift'; END IF; EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED','message','Shift window is invalid.','retryable',false,'refreshRequired',false); END;
      END LOOP;
    ELSIF jsonb_array_length(line_input->'shiftWindows')>0 THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED','message','Shift windows are only valid for PER_SHIFT policy.','retryable',false,'refreshRequired',false); END IF;
    IF line_input->'deurPolicy' IS DISTINCT FROM first_line->'deurPolicy' OR line_input->'shiftWindows' IS DISTINCT FROM first_line->'shiftWindows' THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED','message','Rental-level DEUR policy and shift windows must be consistent across lines.','retryable',false,'refreshRequired',false); END IF;
  END LOOP;

  shifts='[]'::jsonb; policy=first_line->'deurPolicy';
  IF policy->>'frequency'='PER_SHIFT' THEN
    FOR shift_item IN SELECT value FROM jsonb_array_elements(first_line->'shiftWindows') ORDER BY value->>'code' LOOP
      shifts=shifts||jsonb_build_array(jsonb_build_object('code',shift_item->>'code','label',shift_item->>'label','startTime',shift_item->>'startTime','endTime',shift_item->>'endTime','timezone',shift_item->>'timezone','capturedAt',now_at));
      INSERT INTO erp.rental_shift_window_snapshots(id,rental_id,code,label,start_time,end_time,timezone,captured_at) VALUES(extensions.gen_random_uuid()::text,target.id,shift_item->>'code',shift_item->>'label',(shift_item->>'startTime')::time,(shift_item->>'endTime')::time,shift_item->>'timezone',now_at);
    END LOOP;
  END IF;

  UPDATE erp.rentals SET commercial_snapshot_required=true,deur_expectation_policy_required=true,deur_expectation_frequency=policy->>'frequency',deur_expectation_effective_from=(policy->>'effectiveFrom')::date,expected_shift_codes=CASE WHEN policy->>'frequency'='PER_SHIFT' THEN ARRAY(SELECT value->>'code' FROM jsonb_array_elements(first_line->'shiftWindows') ORDER BY value->>'code') ELSE NULL END,timezone=CASE WHEN policy->>'frequency'='PER_SHIFT' THEN first_line#>>'{shiftWindows,0,timezone}' ELSE NULL END,deur_expectation_captured_at=now_at,deur_expectation_frozen_at=now_at,updated_by=actor WHERE id=target.id RETURNING * INTO target;

  FOR line_input IN SELECT value FROM jsonb_array_elements(command->'lines') ORDER BY value->>'lineId' LOOP
    SELECT * INTO line_row FROM erp.rental_equipment_lines WHERE id=line_input->>'lineId';
    SELECT * INTO equipment_row FROM erp.equipment WHERE id=line_row.equipment_id;
    SELECT * INTO assignment_row FROM erp.assignments WHERE id=line_row.assignment_id;
    SELECT * INTO cost_row FROM erp.cost_codes WHERE id=line_input->>'costCodeId'; SELECT * INTO activity_row FROM erp.activity_codes WHERE id=line_input->>'activityCodeId'; SELECT * INTO work_row FROM erp.work_descriptions WHERE id=line_input->>'workDescriptionId';
    terms=line_input->'commercialTerms'; billing=(terms->>'billingMethod')::erp.billing_method; meter=line_input->>'meterRequirement';
    INSERT INTO erp.commercial_snapshots(id,rental_id,rental_equipment_line_id,billing_method,unit_rate,minimum_billable_hours,overtime_rate,standby_rate,mobilization_fee,demobilization_fee,fuel_charge,operator_included,operator_rate,tax_rate,withholding_tax,contract_amount,currency,captured_at,created_by,snapshot_hash)
    VALUES(extensions.gen_random_uuid()::text,target.id,line_row.id,billing,(terms->>'unitRate')::numeric,nullif(terms->>'minimumBillableHours','')::numeric,nullif(terms->>'overtimeRate','')::numeric,nullif(terms->>'standbyRate','')::numeric,nullif(terms->>'mobilizationFee','')::numeric,nullif(terms->>'demobilizationFee','')::numeric,nullif(terms->>'fuelCharge','')::numeric,(terms->>'operatorIncluded')::boolean,nullif(terms->>'operatorRate','')::numeric,nullif(terms->>'taxRate','')::numeric,nullif(terms->>'withholdingTax','')::numeric,nullif(terms->>'contractAmount','')::numeric,upper(terms->>'currency'),now_at,actor,encode(extensions.digest(terms::text,'sha256'),'hex'));
    metadata=jsonb_build_object('costCode',jsonb_build_object('id',cost_row.id,'code',cost_row.code,'name',cost_row.name),'activityCode',jsonb_build_object('id',activity_row.id,'code',activity_row.code,'name',activity_row.name),'workDescription',jsonb_build_object('id',work_row.id,'code',work_row.code,'name',work_row.name,'requiresRemarks',work_row.requires_remarks))||CASE WHEN nullif(trim(line_input->>'operationalRemarks'),'') IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('operationalRemarks',trim(line_input->>'operationalRemarks')) END;
    snapshot=jsonb_build_object('rentalEquipmentLineId',line_row.id,'rentalId',target.id,'equipmentId',line_row.equipment_id,'assignmentId',line_row.assignment_id,'operatorId',line_row.operator_id,'projectId',target.project_id,'customerId',target.customer_id,'policy',jsonb_build_object('frequency',policy->>'frequency','effectiveFrom',policy->>'effectiveFrom','expectedShiftCodes',CASE WHEN policy->>'frequency'='PER_SHIFT' THEN (SELECT jsonb_agg(value->>'code' ORDER BY value->>'code') FROM jsonb_array_elements(first_line->'shiftWindows')) ELSE NULL END,'capturedAt',now_at),'shiftWindows',shifts,'workDescription',metadata->'workDescription','operationalRemarks',metadata->>'operationalRemarks','workDateRule','RENTAL_DATE_OUT','workDate',line_input->>'workDate','meterRequirement',meter,'fuelEvidenceRequired',coalesce((terms->>'fuelCharge')::numeric,0)>0,'billingMethod',billing::text,'operationalMetadata',metadata-'workDescription'-'operationalRemarks','sourceFingerprint','PENDING','capturedAt',now_at);
    UPDATE erp.rental_equipment_lines SET operational_metadata=metadata||jsonb_build_object('deurExpectationSnapshot',snapshot),commercial_snapshot_required=true,updated_by=actor WHERE id=line_row.id RETURNING * INTO line_row;
    UPDATE erp.rental_equipment_lines SET operational_metadata=jsonb_set(operational_metadata,'{deurExpectationSnapshot,sourceFingerprint}',to_jsonb(erp.current_deur_expectation_fingerprint(id)),true) WHERE id=line_row.id RETURNING * INTO line_row;
    projections=projections||jsonb_build_array(jsonb_build_object('lineId',line_row.id,'assignmentId',line_row.assignment_id,'equipmentId',line_row.equipment_id,'operatorId',line_row.operator_id,'sourceFingerprint',line_row.operational_metadata#>>'{deurExpectationSnapshot,sourceFingerprint}','version',line_row.row_version));
  END LOOP;

  readiness=erp.rental_release_readiness(target.id);
  IF coalesce((readiness->>'eligible')::boolean,false)=false THEN RAISE EXCEPTION USING MESSAGE='PREPARATION_READINESS_INVARIANT'; END IF;
  INSERT INTO erp.audit_log(id,aggregate_type,aggregate_id,action,actor_id,occurred_at,correlation_id,new_values,metadata,company_id) VALUES(extensions.gen_random_uuid()::text,'Rental',target.id,'RENTAL_PREPARED',actor,now_at,command->>'commandId',jsonb_build_object('lineCount',active_count,'lineIds',to_jsonb(active_ids),'version',target.row_version,'releaseReady',true),jsonb_build_object('source','command_prepare_reserved_rental_aggregate'),tenant);
  response=jsonb_build_object('success',true,'disposition','ACCEPTED','serverOccurredAt',now_at,'refresh',jsonb_build_array(target.id)||to_jsonb(active_ids),'value',jsonb_build_object('rentalId',target.id,'companyId',tenant,'status',target.status,'version',target.row_version,'preparedLineCount',active_count,'releaseReady',true,'lines',projections));
  RETURN erp.finish_operational_command(command,'PREPARE_RESERVED_RENTAL_AGGREGATE','RENTAL',target.id,tenant,actor,payload_hash,response,target.row_version);
EXCEPTION WHEN unique_violation THEN RETURN jsonb_build_object('success',false,'code','CONFLICT','message','Aggregate Rental preparation conflicts with existing canonical state.','retryable',false,'refreshRequired',true);
WHEN OTHERS THEN RETURN jsonb_build_object('success',false,'code','PERSISTENCE_FAILURE','message','Aggregate Rental preparation could not be completed.','retryable',false,'refreshRequired',true);
END $$;

ALTER FUNCTION erp.command_prepare_reserved_rental_aggregate(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.command_prepare_reserved_rental_aggregate(jsonb) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION erp.command_prepare_reserved_rental_aggregate(jsonb) TO authenticated;
COMMIT;
