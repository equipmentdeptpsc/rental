BEGIN;
SET LOCAL search_path=erp,auth,extensions,pg_catalog;

ALTER TABLE erp.rentals
  ADD COLUMN approval_status text NOT NULL DEFAULT 'NotSubmitted',
  ADD COLUMN approval_requested_at timestamptz,
  ADD COLUMN approval_requested_by uuid REFERENCES erp.users(id),
  ADD COLUMN approval_decided_at timestamptz,
  ADD COLUMN approval_decided_by uuid REFERENCES erp.users(id),
  ADD COLUMN approval_decision_remarks text,
  ADD CONSTRAINT ck_rental_approval_status CHECK(approval_status IN('NotSubmitted','Pending','Approved','Rejected')),
  ADD CONSTRAINT ck_rental_approval_evidence CHECK(
    (approval_status='NotSubmitted' AND approval_requested_at IS NULL AND approval_requested_by IS NULL AND approval_decided_at IS NULL AND approval_decided_by IS NULL)
    OR (approval_status='Pending' AND approval_requested_at IS NOT NULL AND approval_requested_by IS NOT NULL AND approval_decided_at IS NULL AND approval_decided_by IS NULL)
    OR (approval_status IN('Approved','Rejected') AND approval_requested_at IS NOT NULL AND approval_requested_by IS NOT NULL AND approval_decided_at IS NOT NULL AND approval_decided_by IS NOT NULL)
  ),
  ADD CONSTRAINT ck_rental_rejection_remarks CHECK(approval_status<>'Rejected' OR nullif(btrim(approval_decision_remarks),'') IS NOT NULL);

DROP INDEX IF EXISTS erp.uq_rentals_number;
CREATE UNIQUE INDEX uq_rentals_number
ON erp.rentals(company_id,lower(rental_number))
WHERE rental_number IS NOT NULL;

CREATE UNIQUE INDEX uq_rental_lines_company_non_final_equipment
ON erp.rental_equipment_lines(company_id,equipment_id)
WHERE deleted_at IS NULL AND status IN('Draft','Assigned','Reserved','Released','Active');

CREATE FUNCTION erp.next_rental_number() RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,auth,pg_catalog AS $$
DECLARE tenant text=erp.current_company_id(); sequence_value bigint; rental_sequence_year integer=extract(year from clock_timestamp())::integer;
BEGIN
 IF tenant IS NULL THEN RAISE EXCEPTION 'authenticated company required' USING ERRCODE='42501';END IF;
 INSERT INTO erp.number_sequences(company_id,scope,sequence_year,current_value,prefix)
 VALUES(tenant,'RENTAL',rental_sequence_year,1,'RNT')
 ON CONFLICT(company_id,scope,sequence_year) DO UPDATE SET current_value=erp.number_sequences.current_value+1,updated_at=clock_timestamp(),row_version=erp.number_sequences.row_version+1
 RETURNING current_value INTO sequence_value;
 RETURN 'RNT-'||rental_sequence_year||'-'||lpad(sequence_value::text,6,'0');
END $$;

CREATE FUNCTION erp.command_create_draft_rental(command jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,auth,extensions,pg_catalog AS $$
DECLARE tenant text=erp.current_company_id();actor text=auth.uid()::text;now_at timestamptz=clock_timestamp();target_id text;number_value text;
 customer_row erp.customers;project_row erp.projects;item jsonb;requested int;valid int;idem jsonb;payload_hash text;response jsonb;line_ids jsonb='[]'::jsonb;new_line_id text;violated_constraint text;
BEGIN
 IF tenant IS NULL OR NOT EXISTS(SELECT 1 FROM erp.companies WHERE id=tenant AND active) THEN RETURN jsonb_build_object('success',false,'code','UNAUTHENTICATED');END IF;
 IF NOT erp.current_user_has_permission('rental.manage') THEN RETURN jsonb_build_object('success',false,'code','FORBIDDEN');END IF;
 IF command ?| ARRAY['companyId','company_id','tenantId','tenant_id','actor','actorId','userId','status','rentalNumber']
 OR nullif(btrim(command->>'commandId'),'') IS NULL OR nullif(btrim(command->>'idempotencyKey'),'') IS NULL
 OR nullif(btrim(command->>'customerId'),'') IS NULL OR nullif(btrim(command->>'projectId'),'') IS NULL
 OR nullif(btrim(command->>'dateOut'),'') IS NULL OR command->>'rentalType' NOT IN('Bare Rental','Operated Rental')
 OR jsonb_typeof(command->'lines') IS DISTINCT FROM 'array' OR jsonb_array_length(command->'lines')=0
 THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED');END IF;
 BEGIN IF nullif(command->>'expectedReturn','') IS NOT NULL AND (command->>'expectedReturn')::date<(command->>'dateOut')::date THEN RAISE EXCEPTION 'dates';END IF;
 EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED');END;
 target_id=command->>'commandId';idem=erp.begin_operational_command(command,'CREATE_DRAFT_RENTAL','RENTAL',target_id,tenant,actor);
 IF idem->>'state'='MISMATCH' THEN RETURN jsonb_build_object('success',false,'code','IDEMPOTENCY_MISMATCH');ELSIF idem->>'state'='REPLAY' THEN RETURN (idem->'response')||jsonb_build_object('disposition','REPLAYED');ELSIF idem->>'state'<>'NEW' THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED');END IF;payload_hash=idem->>'payloadHash';
 SELECT * INTO customer_row FROM erp.customers WHERE id=command->>'customerId' AND company_id=tenant AND active AND deleted_at IS NULL;
 SELECT * INTO project_row FROM erp.projects WHERE id=command->>'projectId' AND company_id=tenant AND customer_id=customer_row.id AND active AND deleted_at IS NULL;
 IF customer_row.id IS NULL OR project_row.id IS NULL THEN RETURN jsonb_build_object('success',false,'code','NOT_FOUND');END IF;
 SELECT count(*),count(DISTINCT value->>'assignmentId') INTO requested,valid FROM jsonb_array_elements(command->'lines');
 IF requested<>valid OR EXISTS(SELECT 1 FROM jsonb_array_elements(command->'lines') x WHERE nullif(x.value->>'assignmentId','') IS NULL OR (x.value-'assignmentId')<>'{}'::jsonb)
 THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED');END IF;
 PERFORM a.id FROM erp.assignments a JOIN jsonb_array_elements(command->'lines') x ON x.value->>'assignmentId'=a.id WHERE a.company_id=tenant ORDER BY a.id FOR UPDATE;
 PERFORM e.id FROM erp.equipment e JOIN erp.assignments a ON a.equipment_id=e.id JOIN jsonb_array_elements(command->'lines') x ON x.value->>'assignmentId'=a.id WHERE e.company_id=tenant ORDER BY e.id FOR UPDATE;
 SELECT count(*) INTO valid FROM jsonb_array_elements(command->'lines') x JOIN erp.assignments a ON a.id=x.value->>'assignmentId' AND a.company_id=tenant AND a.project_id=project_row.id AND a.status='Active' AND a.deleted_at IS NULL JOIN erp.equipment e ON e.id=a.equipment_id AND e.company_id=tenant AND e.active AND e.deleted_at IS NULL JOIN erp.operators o ON o.id=a.operator_id AND o.company_id=tenant AND o.status='Active' AND o.deleted_at IS NULL;
 IF valid<>requested THEN RETURN jsonb_build_object('success',false,'code','MISSING_RELATIONSHIP');END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(command->'lines') x JOIN erp.assignments a ON a.id=x.value->>'assignmentId' JOIN erp.rental_equipment_lines l ON l.company_id=tenant AND l.equipment_id=a.equipment_id AND l.deleted_at IS NULL AND l.status IN('Draft','Assigned','Reserved','Released','Active')) THEN RETURN jsonb_build_object('success',false,'code','EQUIPMENT_UNAVAILABLE','message','This equipment already has an active or pending Rental.');END IF;
 IF EXISTS(SELECT 1 FROM erp.rentals WHERE id=target_id) THEN RETURN jsonb_build_object('success',false,'code','RENTAL_CONFLICT');END IF;
 number_value=erp.next_rental_number();
 INSERT INTO erp.rentals(id,rental_number,customer_id,project_id,customer_snapshot,project_snapshot,date_out,expected_return,rental_type,status,approval_status,created_by,updated_by,company_id)
 VALUES(target_id,number_value,customer_row.id,project_row.id,customer_row.name,project_row.name,(command->>'dateOut')::date,nullif(command->>'expectedReturn','')::date,command->>'rentalType','Draft','NotSubmitted',actor,actor,tenant);
 FOR item IN SELECT value FROM jsonb_array_elements(command->'lines') ORDER BY value->>'assignmentId' LOOP
  INSERT INTO erp.rental_equipment_lines(id,rental_id,equipment_id,assignment_id,operator_id,status,created_by,updated_by,company_id)
  SELECT gen_random_uuid()::text,target_id,a.equipment_id,a.id,a.operator_id,'Draft',actor,actor,tenant FROM erp.assignments a WHERE a.id=item->>'assignmentId' RETURNING id INTO new_line_id;
  line_ids=line_ids||jsonb_build_array(new_line_id);
 END LOOP;
 INSERT INTO erp.audit_log(id,company_id,aggregate_type,aggregate_id,action,actor_id,occurred_at,correlation_id,new_values) VALUES(gen_random_uuid()::text,tenant,'Rental',target_id,'RENTAL_DRAFT_CREATED',actor,now_at,command->>'commandId',jsonb_build_object('rentalNumber',number_value,'lineIds',line_ids));
 response=jsonb_build_object('success',true,'disposition','ACCEPTED','value',jsonb_build_object('rentalId',target_id,'rentalNumber',number_value,'status','Draft','approvalStatus','NotSubmitted','version',1,'lineIds',line_ids));
 RETURN erp.finish_operational_command(command,'CREATE_DRAFT_RENTAL','RENTAL',target_id,tenant,actor,payload_hash,response,1);
EXCEPTION WHEN unique_violation THEN
 GET STACKED DIAGNOSTICS violated_constraint=CONSTRAINT_NAME;
 IF violated_constraint='uq_rental_lines_company_non_final_equipment' THEN
  RETURN jsonb_build_object('success',false,'code','EQUIPMENT_UNAVAILABLE','message','This equipment already has an active or pending Rental.');
 ELSIF violated_constraint='uq_rentals_number' THEN
  RETURN jsonb_build_object('success',false,'code','RENTAL_NUMBER_CONFLICT','message','A Rental with this number already exists for the company.');
 END IF;
 RETURN jsonb_build_object('success',false,'code','PERSISTENCE_FAILURE');
WHEN OTHERS THEN RETURN jsonb_build_object('success',false,'code','PERSISTENCE_FAILURE');END $$;

CREATE FUNCTION erp.command_update_draft_rental_terms(command jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,auth,extensions,pg_catalog AS $$
DECLARE tenant text=erp.current_company_id();actor text=auth.uid()::text;target erp.rentals;line_row erp.rental_equipment_lines;item jsonb;terms jsonb;idem jsonb;payload_hash text;response jsonb;expected bigint;now_at timestamptz=clock_timestamp();
BEGIN
 IF tenant IS NULL OR NOT erp.current_user_has_permission('rental.commercialTerms.manage') THEN RETURN jsonb_build_object('success',false,'code','FORBIDDEN');END IF;
 IF command ?| ARRAY['companyId','actorId','status'] OR jsonb_typeof(command->'lines') IS DISTINCT FROM 'array' OR jsonb_array_length(command->'lines')=0 THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED');END IF;
 SELECT * INTO target FROM erp.rentals WHERE id=command->>'rentalId' AND company_id=tenant FOR UPDATE;
 IF target.id IS NULL THEN RETURN jsonb_build_object('success',false,'code','NOT_FOUND');END IF;
 idem=erp.begin_operational_command(command,'UPDATE_DRAFT_RENTAL_TERMS','RENTAL',target.id,tenant,actor);IF idem->>'state'='MISMATCH' THEN RETURN jsonb_build_object('success',false,'code','IDEMPOTENCY_MISMATCH');ELSIF idem->>'state'='REPLAY' THEN RETURN (idem->'response')||jsonb_build_object('disposition','REPLAYED');END IF;payload_hash=idem->>'payloadHash';
 BEGIN expected=(command->>'expectedVersion')::bigint;EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED');END;
 IF target.status<>'Draft' THEN RETURN jsonb_build_object('success',false,'code','INVALID_TRANSITION');ELSIF expected<>target.row_version THEN RETURN jsonb_build_object('success',false,'code','CONFLICT','currentVersion',target.row_version);END IF;
 IF (SELECT array_agg(value->>'lineId' ORDER BY value->>'lineId') FROM jsonb_array_elements(command->'lines')) IS DISTINCT FROM (SELECT array_agg(id ORDER BY id) FROM erp.rental_equipment_lines WHERE rental_id=target.id AND company_id=tenant AND deleted_at IS NULL) THEN RETURN jsonb_build_object('success',false,'code','LINE_SET_MISMATCH');END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(command->'lines') LOOP
  terms=item->'commercialTerms';SELECT * INTO line_row FROM erp.rental_equipment_lines WHERE id=item->>'lineId' AND rental_id=target.id AND company_id=tenant FOR UPDATE;
  IF jsonb_typeof(terms) IS DISTINCT FROM 'object' OR terms->>'billingMethod' NOT IN('Per Hour','Per Day','Per Week','Per Month','Per Trip','Per Kilometer','Per Cubic Meter','One Lot','Per Lot') OR length(terms->>'currency')<>3 OR jsonb_typeof(terms->'operatorIncluded') IS DISTINCT FROM 'boolean' OR nullif(terms->>'unitRate','') IS NULL OR (terms->>'unitRate')::numeric<0 OR nullif(item->>'costCodeId','') IS NULL OR nullif(item->>'activityCodeId','') IS NULL OR nullif(item->>'workDescriptionId','') IS NULL OR jsonb_typeof(item->'deurPolicy') IS DISTINCT FROM 'object' THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED');END IF;
  IF NOT EXISTS(SELECT 1 FROM erp.equipment e WHERE e.id=line_row.equipment_id AND e.company_id=tenant AND e.cost_code_id=item->>'costCodeId') OR NOT EXISTS(SELECT 1 FROM erp.assignments a WHERE a.id=line_row.assignment_id AND a.company_id=tenant AND a.activity_code_id=item->>'activityCodeId') OR NOT EXISTS(SELECT 1 FROM erp.work_descriptions w WHERE w.id=item->>'workDescriptionId' AND w.active AND w.deleted_at IS NULL) THEN RETURN jsonb_build_object('success',false,'code','MISSING_RELATIONSHIP');END IF;
 END LOOP;
 DELETE FROM erp.rental_contracts WHERE rental_id=target.id AND status='Draft';
 FOR item IN SELECT value FROM jsonb_array_elements(command->'lines') LOOP terms=item->'commercialTerms';SELECT * INTO line_row FROM erp.rental_equipment_lines WHERE id=item->>'lineId';
  INSERT INTO erp.rental_contracts(id,rental_id,rental_equipment_line_id,contract_no,customer_id,equipment_id,project_id,rental_type,billing_method,currency,unit_rate,minimum_billable_hours,overtime_rate,standby_rate,mobilization_fee,demobilization_fee,fuel_charge,operator_included,operator_rate,contract_amount,tax_rate,withholding_tax,transaction_relationship,vat_applicability,remarks,start_date,expected_end_date,status,created_by,updated_by)
  VALUES(gen_random_uuid()::text,target.id,line_row.id,'DRAFT-'||target.rental_number,target.customer_id,line_row.equipment_id,target.project_id,target.rental_type,(terms->>'billingMethod')::erp.billing_method,upper(terms->>'currency'),(terms->>'unitRate')::numeric,nullif(terms->>'minimumBillableHours','')::numeric,nullif(terms->>'overtimeRate','')::numeric,nullif(terms->>'standbyRate','')::numeric,nullif(terms->>'mobilizationFee','')::numeric,nullif(terms->>'demobilizationFee','')::numeric,nullif(terms->>'fuelCharge','')::numeric,(terms->>'operatorIncluded')::boolean,nullif(terms->>'operatorRate','')::numeric,nullif(terms->>'contractAmount','')::numeric,nullif(terms->>'taxRate','')::numeric,nullif(terms->>'withholdingTax','')::numeric,coalesce(terms->>'transactionRelationship','Non-Affiliate'),coalesce(terms->>'vatApplicability','Applicable'),terms->>'remarks',target.date_out,coalesce(target.expected_return,target.date_out),'Draft',actor,actor);
  UPDATE erp.rental_equipment_lines SET operational_metadata=operational_metadata||jsonb_build_object('draftPreparation',item-'commercialTerms'),updated_by=actor WHERE id=line_row.id;
 END LOOP;
 UPDATE erp.rentals SET approval_status='NotSubmitted',approval_requested_at=NULL,approval_requested_by=NULL,approval_decided_at=NULL,approval_decided_by=NULL,approval_decision_remarks=NULL,updated_by=actor WHERE id=target.id RETURNING * INTO target;
 INSERT INTO erp.audit_log(id,company_id,aggregate_type,aggregate_id,action,actor_id,occurred_at,correlation_id,new_values) VALUES(gen_random_uuid()::text,tenant,'Rental',target.id,'RENTAL_TERMS_UPDATED',actor,now_at,command->>'commandId',jsonb_build_object('lineCount',jsonb_array_length(command->'lines'),'version',target.row_version));
 response=jsonb_build_object('success',true,'disposition','ACCEPTED','value',jsonb_build_object('rentalId',target.id,'status',target.status,'approvalStatus',target.approval_status,'version',target.row_version));RETURN erp.finish_operational_command(command,'UPDATE_DRAFT_RENTAL_TERMS','RENTAL',target.id,tenant,actor,payload_hash,response,target.row_version);
EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('success',false,'code','PERSISTENCE_FAILURE');END $$;

CREATE FUNCTION erp.command_submit_rental_approval(command jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,auth,extensions,pg_catalog AS $$
DECLARE tenant text=erp.current_company_id();actor uuid=auth.uid();target erp.rentals;idem jsonb;payload_hash text;response jsonb;expected bigint;now_at timestamptz=clock_timestamp();
BEGIN
 IF tenant IS NULL OR NOT erp.current_user_has_permission('rental.approval.submit') THEN RETURN jsonb_build_object('success',false,'code','FORBIDDEN');END IF;SELECT * INTO target FROM erp.rentals WHERE id=command->>'rentalId' AND company_id=tenant FOR UPDATE;IF target.id IS NULL THEN RETURN jsonb_build_object('success',false,'code','NOT_FOUND');END IF;
 idem=erp.begin_operational_command(command,'SUBMIT_RENTAL_APPROVAL','RENTAL',target.id,tenant,actor::text);IF idem->>'state'='MISMATCH' THEN RETURN jsonb_build_object('success',false,'code','IDEMPOTENCY_MISMATCH');ELSIF idem->>'state'='REPLAY' THEN RETURN (idem->'response')||jsonb_build_object('disposition','REPLAYED');END IF;payload_hash=idem->>'payloadHash';
 BEGIN expected=(command->>'expectedVersion')::bigint;EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED');END;IF expected<>target.row_version THEN RETURN jsonb_build_object('success',false,'code','CONFLICT','currentVersion',target.row_version);END IF;
 IF target.status<>'Draft' OR target.approval_status NOT IN('NotSubmitted','Rejected') OR EXISTS(SELECT 1 FROM erp.rental_equipment_lines l WHERE l.rental_id=target.id AND (NOT l.operational_metadata?'draftPreparation' OR NOT EXISTS(SELECT 1 FROM erp.rental_contracts c WHERE c.rental_equipment_line_id=l.id AND c.status='Draft'))) THEN RETURN jsonb_build_object('success',false,'code','INVALID_TRANSITION');END IF;
 UPDATE erp.rentals SET approval_status='Pending',approval_requested_at=now_at,approval_requested_by=actor,approval_decided_at=NULL,approval_decided_by=NULL,approval_decision_remarks=NULL,updated_by=actor::text WHERE id=target.id RETURNING * INTO target;
 INSERT INTO erp.audit_log(id,company_id,aggregate_type,aggregate_id,action,actor_id,occurred_at,correlation_id,new_values) VALUES(gen_random_uuid()::text,tenant,'Rental',target.id,'RENTAL_APPROVAL_SUBMITTED',actor::text,now_at,command->>'commandId',jsonb_build_object('approvalStatus','Pending','version',target.row_version));response=jsonb_build_object('success',true,'disposition','ACCEPTED','value',jsonb_build_object('rentalId',target.id,'status',target.status,'approvalStatus',target.approval_status,'version',target.row_version));RETURN erp.finish_operational_command(command,'SUBMIT_RENTAL_APPROVAL','RENTAL',target.id,tenant,actor::text,payload_hash,response,target.row_version);
END $$;

CREATE FUNCTION erp.command_decide_rental_approval(command jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,auth,extensions,pg_catalog AS $$
DECLARE tenant text=erp.current_company_id();actor uuid=auth.uid();target erp.rentals;decision text=command->>'decision';decision_remarks text=nullif(btrim(command->>'remarks'),'');idem jsonb;payload_hash text;response jsonb;expected bigint;now_at timestamptz=clock_timestamp();
BEGIN
 IF tenant IS NULL OR NOT erp.current_user_has_permission('rental.approval.decide') THEN RETURN jsonb_build_object('success',false,'code','FORBIDDEN');END IF;SELECT * INTO target FROM erp.rentals WHERE id=command->>'rentalId' AND company_id=tenant FOR UPDATE;IF target.id IS NULL THEN RETURN jsonb_build_object('success',false,'code','NOT_FOUND');END IF;
 idem=erp.begin_operational_command(command,'DECIDE_RENTAL_APPROVAL','RENTAL',target.id,tenant,actor::text);IF idem->>'state'='MISMATCH' THEN RETURN jsonb_build_object('success',false,'code','IDEMPOTENCY_MISMATCH');ELSIF idem->>'state'='REPLAY' THEN RETURN (idem->'response')||jsonb_build_object('disposition','REPLAYED');END IF;payload_hash=idem->>'payloadHash';
 BEGIN expected=(command->>'expectedVersion')::bigint;EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED');END;IF expected<>target.row_version THEN RETURN jsonb_build_object('success',false,'code','CONFLICT','currentVersion',target.row_version);END IF;
 IF target.status<>'Draft' OR target.approval_status<>'Pending' OR decision NOT IN('Approved','Rejected') OR actor=target.approval_requested_by OR (decision='Rejected' AND decision_remarks IS NULL) THEN RETURN jsonb_build_object('success',false,'code','INVALID_TRANSITION');END IF;
 UPDATE erp.rentals SET approval_status=decision,approval_decided_at=now_at,approval_decided_by=actor,approval_decision_remarks=decision_remarks,updated_by=actor::text WHERE id=target.id RETURNING * INTO target;
 INSERT INTO erp.audit_log(id,company_id,aggregate_type,aggregate_id,action,actor_id,occurred_at,correlation_id,new_values) VALUES(gen_random_uuid()::text,tenant,'Rental',target.id,CASE decision WHEN 'Approved' THEN 'RENTAL_APPROVED' ELSE 'RENTAL_REJECTED' END,actor::text,now_at,command->>'commandId',jsonb_build_object('approvalStatus',decision,'remarks',decision_remarks,'version',target.row_version));response=jsonb_build_object('success',true,'disposition','ACCEPTED','value',jsonb_build_object('rentalId',target.id,'status',target.status,'approvalStatus',target.approval_status,'version',target.row_version));RETURN erp.finish_operational_command(command,'DECIDE_RENTAL_APPROVAL','RENTAL',target.id,tenant,actor::text,payload_hash,response,target.row_version);
END $$;

CREATE FUNCTION erp.command_reserve_rental(command jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,auth,extensions,pg_catalog AS $$
DECLARE tenant text=erp.current_company_id();actor text=auth.uid()::text;target erp.rentals;line_row erp.rental_equipment_lines;contract_row erp.rental_contracts;prep jsonb;metadata jsonb;snapshot jsonb;idem jsonb;payload_hash text;response jsonb;expected bigint;now_at timestamptz=clock_timestamp();
BEGIN
 IF tenant IS NULL OR NOT erp.current_user_has_permission('rental.manage') THEN RETURN jsonb_build_object('success',false,'code','FORBIDDEN');END IF;SELECT * INTO target FROM erp.rentals WHERE id=command->>'rentalId' AND company_id=tenant FOR UPDATE;IF target.id IS NULL THEN RETURN jsonb_build_object('success',false,'code','NOT_FOUND');END IF;
 idem=erp.begin_operational_command(command,'RESERVE_RENTAL','RENTAL',target.id,tenant,actor);IF idem->>'state'='MISMATCH' THEN RETURN jsonb_build_object('success',false,'code','IDEMPOTENCY_MISMATCH');ELSIF idem->>'state'='REPLAY' THEN RETURN (idem->'response')||jsonb_build_object('disposition','REPLAYED');END IF;payload_hash=idem->>'payloadHash';
 BEGIN expected=(command->>'expectedVersion')::bigint;EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED');END;IF expected<>target.row_version THEN RETURN jsonb_build_object('success',false,'code','CONFLICT','currentVersion',target.row_version);END IF;IF target.status<>'Draft' OR target.approval_status<>'Approved' THEN RETURN jsonb_build_object('success',false,'code','INVALID_TRANSITION');END IF;
 PERFORM a.id FROM erp.assignments a JOIN erp.rental_equipment_lines l ON l.assignment_id=a.id WHERE l.rental_id=target.id ORDER BY a.id FOR UPDATE;PERFORM e.id FROM erp.equipment e JOIN erp.rental_equipment_lines l ON l.equipment_id=e.id WHERE l.rental_id=target.id ORDER BY e.id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM erp.rental_equipment_lines l LEFT JOIN erp.assignments a ON a.id=l.assignment_id AND a.company_id=tenant LEFT JOIN erp.equipment e ON e.id=l.equipment_id AND e.company_id=tenant LEFT JOIN erp.operators o ON o.id=l.operator_id AND o.company_id=tenant WHERE l.rental_id=target.id AND (a.id IS NULL OR a.status<>'Active' OR a.equipment_id<>l.equipment_id OR a.operator_id<>l.operator_id OR a.project_id<>target.project_id OR e.id IS NULL OR NOT e.active OR o.id IS NULL OR o.status<>'Active' OR NOT l.operational_metadata?'draftPreparation' OR NOT EXISTS(SELECT 1 FROM erp.rental_contracts c WHERE c.rental_equipment_line_id=l.id AND c.status='Draft'))) THEN RETURN jsonb_build_object('success',false,'code','MISSING_RELATIONSHIP');END IF;
 FOR line_row IN SELECT * FROM erp.rental_equipment_lines WHERE rental_id=target.id ORDER BY id LOOP SELECT * INTO contract_row FROM erp.rental_contracts WHERE rental_equipment_line_id=line_row.id AND status='Draft';prep=line_row.operational_metadata->'draftPreparation';
  INSERT INTO erp.commercial_snapshots(id,rental_id,rental_equipment_line_id,source_contract_id,billing_method,unit_rate,minimum_billable_hours,overtime_rate,standby_rate,mobilization_fee,demobilization_fee,fuel_charge,operator_included,operator_rate,tax_rate,withholding_tax,contract_amount,currency,captured_at,created_by,snapshot_hash) VALUES(gen_random_uuid()::text,target.id,line_row.id,contract_row.id,contract_row.billing_method,contract_row.unit_rate,contract_row.minimum_billable_hours,contract_row.overtime_rate,contract_row.standby_rate,contract_row.mobilization_fee,contract_row.demobilization_fee,contract_row.fuel_charge,contract_row.operator_included,contract_row.operator_rate,contract_row.tax_rate,contract_row.withholding_tax,contract_row.contract_amount,contract_row.currency,now_at,actor,encode(digest(to_jsonb(contract_row)::text,'sha256'),'hex'));
  metadata=jsonb_build_object('costCode',(SELECT jsonb_build_object('id',c.id,'code',c.code,'name',c.name) FROM erp.cost_codes c WHERE c.id=prep->>'costCodeId'),'activityCode',(SELECT jsonb_build_object('id',a.id,'code',a.code,'name',a.name) FROM erp.activity_codes a WHERE a.id=prep->>'activityCodeId'),'workDescription',(SELECT jsonb_build_object('id',w.id,'code',w.code,'name',w.name,'requiresRemarks',w.requires_remarks) FROM erp.work_descriptions w WHERE w.id=prep->>'workDescriptionId'))||CASE WHEN nullif(btrim(prep->>'operationalRemarks'),'') IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('operationalRemarks',prep->>'operationalRemarks') END;
  snapshot=jsonb_build_object('rentalEquipmentLineId',line_row.id,'rentalId',target.id,'equipmentId',line_row.equipment_id,'assignmentId',line_row.assignment_id,'operatorId',line_row.operator_id,'projectId',target.project_id,'customerId',target.customer_id,'policy',prep->'deurPolicy','shiftWindows',coalesce(prep->'shiftWindows','[]'::jsonb),'workDescription',metadata->'workDescription','operationalRemarks',metadata->>'operationalRemarks','workDateRule','RENTAL_DATE_OUT','workDate',coalesce(prep->>'workDate',target.date_out::text),'meterRequirement',coalesce(prep->>'meterRequirement','none'),'billingMethod',contract_row.billing_method::text,'fuelEvidenceRequired',coalesce(contract_row.fuel_charge,0)>0,'operationalMetadata',metadata-'workDescription'-'operationalRemarks','sourceFingerprint','PENDING','capturedAt',now_at);
  UPDATE erp.rental_equipment_lines SET status='Reserved',commercial_snapshot_required=true,operational_metadata=metadata||jsonb_build_object('deurExpectationSnapshot',snapshot),updated_by=actor WHERE id=line_row.id;
  UPDATE erp.rental_contracts SET status='Active',updated_by=actor WHERE id=contract_row.id;
 END LOOP;
 UPDATE erp.rentals SET status='Reserved',reserved_at=now_at,commercial_snapshot_required=true,deur_expectation_policy_required=true,deur_expectation_frequency=(SELECT operational_metadata#>>'{deurExpectationSnapshot,policy,frequency}' FROM erp.rental_equipment_lines WHERE rental_id=target.id ORDER BY id LIMIT 1),deur_expectation_effective_from=coalesce((SELECT nullif(operational_metadata#>>'{deurExpectationSnapshot,policy,effectiveFrom}','')::date FROM erp.rental_equipment_lines WHERE rental_id=target.id ORDER BY id LIMIT 1),target.date_out),expected_shift_codes=(SELECT ARRAY(SELECT value->>'code' FROM jsonb_array_elements(coalesce(l.operational_metadata#>'{deurExpectationSnapshot,shiftWindows}','[]'::jsonb)) ORDER BY value->>'code') FROM erp.rental_equipment_lines l WHERE l.rental_id=target.id ORDER BY l.id LIMIT 1),timezone=(SELECT l.operational_metadata#>>'{deurExpectationSnapshot,shiftWindows,0,timezone}' FROM erp.rental_equipment_lines l WHERE l.rental_id=target.id ORDER BY l.id LIMIT 1),deur_expectation_captured_at=now_at,deur_expectation_frozen_at=now_at,updated_by=actor WHERE id=target.id RETURNING * INTO target;
 UPDATE erp.rental_equipment_lines SET operational_metadata=jsonb_set(operational_metadata,'{deurExpectationSnapshot,sourceFingerprint}',to_jsonb(erp.current_deur_expectation_fingerprint(id)),true) WHERE rental_id=target.id AND deleted_at IS NULL;
 INSERT INTO erp.audit_log(id,company_id,aggregate_type,aggregate_id,action,actor_id,occurred_at,correlation_id,new_values) VALUES(gen_random_uuid()::text,tenant,'Rental',target.id,'RENTAL_RESERVED',actor,now_at,command->>'commandId',jsonb_build_object('status','Reserved','version',target.row_version));response=jsonb_build_object('success',true,'disposition','ACCEPTED','value',jsonb_build_object('rentalId',target.id,'rentalNumber',target.rental_number,'status','Reserved','approvalStatus',target.approval_status,'version',target.row_version));RETURN erp.finish_operational_command(command,'RESERVE_RENTAL','RENTAL',target.id,tenant,actor,payload_hash,response,target.row_version);
EXCEPTION WHEN unique_violation THEN RETURN jsonb_build_object('success',false,'code','EQUIPMENT_UNAVAILABLE');WHEN OTHERS THEN RETURN jsonb_build_object('success',false,'code','PERSISTENCE_FAILURE');END $$;

CREATE OR REPLACE FUNCTION erp.command_release_rental(command jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,auth,extensions,pg_catalog AS $$
DECLARE tenant text=erp.current_company_id();actor text=auth.uid()::text;target erp.rentals;idem jsonb;payload_hash text;response jsonb;expected bigint;now_at timestamptz=clock_timestamp();readiness jsonb;
BEGIN
 IF tenant IS NULL OR NOT erp.current_user_has_permission('rental.release') THEN RETURN jsonb_build_object('success',false,'code','FORBIDDEN');END IF;SELECT * INTO target FROM erp.rentals WHERE id=command->>'rentalId' AND company_id=tenant FOR UPDATE;IF target.id IS NULL THEN RETURN jsonb_build_object('success',false,'code','NOT_FOUND');END IF;
 idem=erp.begin_operational_command(command,'RELEASE_RENTAL','RENTAL',target.id,tenant,actor);IF idem->>'state'='MISMATCH' THEN RETURN jsonb_build_object('success',false,'code','IDEMPOTENCY_MISMATCH');ELSIF idem->>'state'='REPLAY' THEN RETURN (idem->'response')||jsonb_build_object('disposition','REPLAYED');END IF;payload_hash=idem->>'payloadHash';
 BEGIN expected=(command->>'expectedVersion')::bigint;EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED');END;IF expected<>target.row_version THEN RETURN jsonb_build_object('success',false,'code','CONFLICT','currentVersion',target.row_version);END IF;IF target.status<>'Reserved' OR NOT (target.approval_status='Approved' OR (target.approval_status='NotSubmitted' AND target.approval_requested_at IS NULL AND target.approval_requested_by IS NULL AND target.approval_decided_at IS NULL AND target.approval_decided_by IS NULL AND coalesce(target.legacy_payload->>'approvalStatus','')='Approved' AND NOT EXISTS(SELECT 1 FROM erp.audit_log a WHERE a.company_id=tenant AND a.aggregate_type='Rental' AND a.aggregate_id=target.id AND a.action='RENTAL_DRAFT_CREATED') AND NOT EXISTS(SELECT 1 FROM erp.operational_command_idempotency i WHERE i.company_id=tenant AND i.target_aggregate_type='RENTAL' AND i.target_aggregate_id=target.id AND i.command_type='CREATE_DRAFT_RENTAL' AND i.command_status='COMPLETED'))) THEN RETURN jsonb_build_object('success',false,'code','INVALID_TRANSITION');END IF;readiness=erp.rental_release_readiness(target.id);IF NOT coalesce((readiness->>'eligible')::boolean,false) THEN RETURN jsonb_build_object('success',false,'code','RELEASE_NOT_READY','details',readiness);END IF;UPDATE erp.rentals SET status='Released',released_at=now_at,rented_by=(SELECT display_name FROM erp.users WHERE id=auth.uid()),updated_by=actor WHERE id=target.id RETURNING * INTO target;UPDATE erp.rental_equipment_lines SET status='Released',updated_by=actor WHERE rental_id=target.id;UPDATE erp.equipment e SET status_id=(SELECT id FROM erp.equipment_statuses WHERE lower(code)='rented' LIMIT 1),updated_by=actor WHERE id IN(SELECT equipment_id FROM erp.rental_equipment_lines WHERE rental_id=target.id);
 INSERT INTO erp.audit_log(id,company_id,aggregate_type,aggregate_id,action,actor_id,occurred_at,correlation_id,new_values) VALUES(gen_random_uuid()::text,tenant,'Rental',target.id,'RELEASE_RENTAL',actor,now_at,command->>'commandId',jsonb_build_object('status','Released','version',target.row_version));response=jsonb_build_object('success',true,'disposition','ACCEPTED','value',jsonb_build_object('rentalId',target.id,'rentalNumber',target.rental_number,'status','Released','version',target.row_version));RETURN erp.finish_operational_command(command,'RELEASE_RENTAL','RENTAL',target.id,tenant,actor,payload_hash,response,target.row_version);
END $$;

ALTER FUNCTION erp.next_rental_number() OWNER TO postgres;
ALTER FUNCTION erp.command_create_draft_rental(jsonb) OWNER TO postgres;
ALTER FUNCTION erp.command_update_draft_rental_terms(jsonb) OWNER TO postgres;
ALTER FUNCTION erp.command_submit_rental_approval(jsonb) OWNER TO postgres;
ALTER FUNCTION erp.command_decide_rental_approval(jsonb) OWNER TO postgres;
ALTER FUNCTION erp.command_reserve_rental(jsonb) OWNER TO postgres;
ALTER FUNCTION erp.command_release_rental(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.next_rental_number(),erp.command_create_draft_rental(jsonb),erp.command_update_draft_rental_terms(jsonb),erp.command_submit_rental_approval(jsonb),erp.command_decide_rental_approval(jsonb),erp.command_reserve_rental(jsonb),erp.command_release_rental(jsonb) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION erp.command_create_draft_rental(jsonb),erp.command_update_draft_rental_terms(jsonb),erp.command_submit_rental_approval(jsonb),erp.command_decide_rental_approval(jsonb),erp.command_reserve_rental(jsonb),erp.command_release_rental(jsonb) TO authenticated;
COMMIT;
