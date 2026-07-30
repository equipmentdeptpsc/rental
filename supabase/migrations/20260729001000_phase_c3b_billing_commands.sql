BEGIN;
SET search_path TO erp, public;

CREATE FUNCTION next_billing_statement_number()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,auth AS $$
DECLARE
  sequence_value bigint;
  sequence_year integer=extract(year from clock_timestamp())::integer;
  tenant text=(SELECT company_id FROM users WHERE id=auth.uid() AND status='active');
BEGIN
  IF tenant IS NULL THEN RAISE EXCEPTION 'authenticated company required' USING ERRCODE='42501'; END IF;
  INSERT INTO number_sequences(company_id,scope,sequence_year,current_value,prefix)
  VALUES(tenant,'BILLING_STATEMENT',sequence_year,1,'BS')
  ON CONFLICT(company_id,scope,sequence_year) DO UPDATE
  SET current_value=number_sequences.current_value+1,updated_at=clock_timestamp(),row_version=number_sequences.row_version+1
  RETURNING current_value INTO sequence_value;
  RETURN 'BS-'||sequence_year||'-'||lpad(sequence_value::text,6,'0');
END $$;

CREATE FUNCTION calculate_deur_billing_evidence(target_deur_id text, tenant text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp AS $$
DECLARE
  source deurs; terms commercial_snapshots; method billing_method;
  hours numeric(14,4); quantity numeric(19,6); unit text; rate numeric(19,6);
  operating numeric(19,4); idle numeric(19,4); mobilization numeric(19,4);
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
  SELECT * INTO terms FROM commercial_snapshots
  WHERE id=source.commercial_snapshot_id AND rental_id=source.rental_id
    AND (rental_equipment_line_id IS NOT DISTINCT FROM source.rental_equipment_line_id);
  IF terms.id IS NULL THEN RETURN jsonb_build_object('success',false,'code','BILLING_INELIGIBLE','message','Immutable commercial terms are required.'); END IF;
  method=terms.billing_method;
  IF source.billing_method_snapshot IS NOT NULL AND source.billing_method_snapshot<>method THEN
    RETURN jsonb_build_object('success',false,'code','BILLING_INELIGIBLE','message','DEUR and commercial billing methods differ.');
  END IF;
  IF method='Per Cubic Meter' THEN
    RETURN jsonb_build_object('success',false,'code','UNSUPPORTED_BILLING_METHOD','message','Per Cubic Meter automated billing is not supported.');
  END IF;
  IF method NOT IN('Per Hour','Per Day','Per Week','Per Month','One Lot') THEN
    RETURN jsonb_build_object('success',false,'code','UNSUPPORTED_BILLING_METHOD','message','The billing method is not supported by this command.');
  END IF;

  hours=round(greatest(source.total_operating_minutes::numeric/60,coalesce(terms.minimum_billable_hours,0)),4);
  rate=terms.unit_rate;
  quantity=CASE WHEN method='Per Hour' THEN hours ELSE 1 END;
  unit=CASE method WHEN 'Per Hour' THEN 'HOUR' WHEN 'Per Day' THEN 'DAY' WHEN 'Per Week' THEN 'WEEK' WHEN 'Per Month' THEN 'MONTH' ELSE 'LOT' END;
  operating=round(CASE method WHEN 'Per Hour' THEN hours*rate WHEN 'One Lot' THEN coalesce(terms.contract_amount,rate) ELSE rate END,4);
  idle=round((source.total_idle_minutes::numeric/60)*coalesce(terms.standby_rate,0),4);
  mobilization=round(coalesce(terms.mobilization_fee,0),4);
  demobilization=round(coalesce(terms.demobilization_fee,0),4);
  operator_amount=round(CASE WHEN terms.operator_included THEN 0 ELSE coalesce(terms.operator_rate,0) END,4);
  fuel=round(coalesce(terms.fuel_charge,0),4);
  subtotal=operating+idle+mobilization+demobilization+operator_amount+fuel;
  vat_amount=round(subtotal*(coalesce(terms.tax_rate,0)/100),4);
  withholding=round(subtotal*(coalesce(terms.withholding_tax,0)/100),4);
  total=subtotal+vat_amount-withholding;
  RETURN jsonb_build_object(
    'success',true,'deurId',source.id,'rentalId',source.rental_id,'rentalLineId',source.rental_equipment_line_id,
    'equipmentId',source.equipment_id,'operatorId',source.operator_id,'workDate',source.work_date,
    'billingMethod',method,'quantity',quantity,'unit',unit,'unitRate',rate,'hours',hours,'hourlyRate',CASE WHEN method='Per Hour' THEN rate ELSE 0 END,
    'operatingCharge',operating,'idleCharge',idle,'mobilizationCharge',mobilization,'demobilizationCharge',demobilization,
    'operatorCharge',operator_amount,'fuelCharge',fuel,'subtotal',subtotal,'vat',vat_amount,'withholdingTax',withholding,'grandTotal',total,
    'commercialTermsSource','IMMUTABLE_SNAPSHOT','commercialCapturedAt',terms.captured_at,
    'revisionChainId',coalesce(source.revision_chain_id,source.id),'revisionNumber',source.revision_number
  );
END $$;

CREATE FUNCTION command_generate_billing_evidence(command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,auth AS $$
DECLARE tenant text; actor text; idem jsonb; evidence jsonb; response jsonb; payload_hash text; now_at timestamptz=clock_timestamp();
BEGIN
  tenant=(SELECT company_id FROM users WHERE id=auth.uid() AND status='active'); actor=auth.uid()::text;
  IF tenant IS NULL THEN RETURN jsonb_build_object('success',false,'code','UNAUTHENTICATED','message','Authentication is required.','retryable',false,'refreshRequired',false); END IF;
  IF NOT current_user_has_permission('billing.create') THEN RETURN jsonb_build_object('success',false,'code','FORBIDDEN','message','Billing creation permission is required.','retryable',false,'refreshRequired',false); END IF;
  IF nullif(command->>'deurId','') IS NULL OR command ? 'companyId' THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED','message','A valid DEUR is required.','retryable',false,'refreshRequired',false); END IF;
  idem=begin_operational_command(command,'GENERATE_BILLING_EVIDENCE','DEUR',command->>'deurId',tenant,actor);
  IF idem->>'state'='INVALID' THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED','message','An idempotency key is required.','retryable',false,'refreshRequired',false); END IF;
  IF idem->>'state'='MISMATCH' THEN RETURN jsonb_build_object('success',false,'code','IDEMPOTENCY_MISMATCH','message','Idempotency key payload mismatch.','retryable',false,'refreshRequired',false); END IF;
  IF idem->>'state'='REPLAY' THEN RETURN (idem->'response')||jsonb_build_object('disposition','REPLAYED'); END IF;
  payload_hash=idem->>'payloadHash'; evidence=calculate_deur_billing_evidence(command->>'deurId',tenant);
  IF NOT coalesce((evidence->>'success')::boolean,false) THEN
    RETURN jsonb_build_object('success',false,'code',evidence->>'code','message',evidence->>'message','retryable',false,'refreshRequired',false);
  END IF;
  response=jsonb_build_object('success',true,'disposition','ACCEPTED','serverOccurredAt',now_at,'refresh','[]'::jsonb,'value',evidence-'success');
  RETURN finish_operational_command(command,'GENERATE_BILLING_EVIDENCE','DEUR',command->>'deurId',tenant,actor,payload_hash,response,NULL);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success',false,'code','PERSISTENCE_FAILURE','message','Billing evidence could not be generated.','retryable',false,'refreshRequired',true);
END $$;

CREATE FUNCTION command_create_billing_statement(command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,auth AS $$
DECLARE tenant text; actor text; rental rentals; idem jsonb; payload_hash text; response jsonb; statement billing_statements; now_at timestamptz=clock_timestamp();
BEGIN
  tenant=(SELECT company_id FROM users WHERE id=auth.uid() AND status='active'); actor=auth.uid()::text;
  IF tenant IS NULL THEN RETURN jsonb_build_object('success',false,'code','UNAUTHENTICATED','message','Authentication is required.','retryable',false,'refreshRequired',false); END IF;
  IF NOT current_user_has_permission('billing.create') THEN RETURN jsonb_build_object('success',false,'code','FORBIDDEN','message','Billing creation permission is required.','retryable',false,'refreshRequired',false); END IF;
  IF nullif(command->>'statementId','') IS NULL OR nullif(command->>'rentalId','') IS NULL OR nullif(command->>'billingFrom','') IS NULL OR nullif(command->>'billingTo','') IS NULL OR
     (command->>'billingTo')::date<(command->>'billingFrom')::date OR command ? 'companyId' THEN
    RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED','message','Billing statement input is invalid.','retryable',false,'refreshRequired',false);
  END IF;
  SELECT * INTO rental FROM rentals WHERE id=command->>'rentalId' AND company_id=tenant FOR UPDATE;
  IF rental.id IS NULL THEN RETURN jsonb_build_object('success',false,'code','NOT_FOUND','message','Rental is unavailable.','retryable',false,'refreshRequired',false); END IF;
  idem=begin_operational_command(command,'CREATE_BILLING_STATEMENT','BILLING_STATEMENT',command->>'statementId',tenant,actor);
  IF idem->>'state'='INVALID' THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED','message','An idempotency key is required.','retryable',false,'refreshRequired',false); END IF;
  IF idem->>'state'='MISMATCH' THEN RETURN jsonb_build_object('success',false,'code','IDEMPOTENCY_MISMATCH','message','Idempotency key payload mismatch.','retryable',false,'refreshRequired',false); END IF;
  IF idem->>'state'='REPLAY' THEN RETURN (idem->'response')||jsonb_build_object('disposition','REPLAYED'); END IF; payload_hash=idem->>'payloadHash';
  INSERT INTO billing_statements(id,statement_no,rental_id,customer_snapshot,project_snapshot,billing_from,billing_to,currency,
    subtotal,vat,withholding_tax,grand_total,approval_status,invoice_status,created_by,updated_by,company_id)
  VALUES(command->>'statementId',next_billing_statement_number(),rental.id,rental.customer_snapshot,rental.project_snapshot,
    (command->>'billingFrom')::date,(command->>'billingTo')::date,coalesce(nullif(command->>'currency',''),'PHP'),
    0,0,0,0,'Draft','Not Invoiced',actor,actor,tenant) RETURNING * INTO statement;
  INSERT INTO audit_log(id,aggregate_type,aggregate_id,action,actor_id,occurred_at,correlation_id,new_values,metadata,company_id)
  VALUES(extensions.gen_random_uuid()::text,'BillingStatement',statement.id,'BILLING_STATEMENT_CREATED',actor,now_at,command->>'commandId',
    jsonb_build_object('statementNo',statement.statement_no,'status',statement.approval_status),jsonb_build_object('source','command_create_billing_statement'),tenant);
  response=jsonb_build_object('success',true,'disposition','ACCEPTED','serverOccurredAt',now_at,'refresh',jsonb_build_array(statement.id,rental.id),
    'value',jsonb_build_object('statementId',statement.id,'statementNumber',statement.statement_no,'approvalStatus',statement.approval_status,'invoiceStatus',statement.invoice_status,'version',statement.row_version));
  RETURN finish_operational_command(command,'CREATE_BILLING_STATEMENT','BILLING_STATEMENT',statement.id,tenant,actor,payload_hash,response,statement.row_version);
EXCEPTION WHEN unique_violation THEN
  RETURN jsonb_build_object('success',false,'code','CONFLICT','message','A billing statement already exists for this Rental period.','retryable',false,'refreshRequired',true);
WHEN OTHERS THEN
  RETURN jsonb_build_object('success',false,'code','PERSISTENCE_FAILURE','message','Billing statement could not be created.','retryable',false,'refreshRequired',true);
END $$;

CREATE FUNCTION command_consume_deur(command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,auth AS $$
DECLARE tenant text; actor text; source deurs; statement billing_statements; evidence jsonb; idem jsonb; payload_hash text; response jsonb; line_id text; now_at timestamptz=clock_timestamp();
BEGIN
  tenant=(SELECT company_id FROM users WHERE id=auth.uid() AND status='active'); actor=auth.uid()::text;
  IF tenant IS NULL THEN RETURN jsonb_build_object('success',false,'code','UNAUTHENTICATED','message','Authentication is required.','retryable',false,'refreshRequired',false); END IF;
  IF NOT current_user_has_permission('billing.create') THEN RETURN jsonb_build_object('success',false,'code','FORBIDDEN','message','Billing creation permission is required.','retryable',false,'refreshRequired',false); END IF;
  IF nullif(command->>'statementId','') IS NULL OR nullif(command->>'deurId','') IS NULL OR command ? 'companyId' THEN
    RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED','message','Statement and DEUR are required.','retryable',false,'refreshRequired',false);
  END IF;
  SELECT * INTO statement FROM billing_statements WHERE id=command->>'statementId' AND company_id=tenant FOR UPDATE;
  SELECT * INTO source FROM deurs WHERE id=command->>'deurId' AND company_id=tenant FOR UPDATE;
  IF statement.id IS NULL OR source.id IS NULL THEN RETURN jsonb_build_object('success',false,'code','NOT_FOUND','message','Billing input is unavailable.','retryable',false,'refreshRequired',false); END IF;
  idem=begin_operational_command(command,'CONSUME_DEUR','DEUR',source.id,tenant,actor);
  IF idem->>'state'='INVALID' THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED','message','An idempotency key is required.','retryable',false,'refreshRequired',false); END IF;
  IF idem->>'state'='MISMATCH' THEN RETURN jsonb_build_object('success',false,'code','IDEMPOTENCY_MISMATCH','message','Idempotency key payload mismatch.','retryable',false,'refreshRequired',false); END IF;
  IF idem->>'state'='REPLAY' THEN RETURN (idem->'response')||jsonb_build_object('disposition','REPLAYED'); END IF; payload_hash=idem->>'payloadHash';
  IF statement.approval_status<>'Draft' OR statement.invoice_status<>'Not Invoiced' OR statement.rental_id<>source.rental_id THEN
    RETURN jsonb_build_object('success',false,'code','INVALID_TRANSITION','message','DEUR cannot be added to this billing statement.','retryable',false,'refreshRequired',false);
  END IF;
  IF source.row_version<>coalesce((command->>'expectedVersion')::bigint,source.row_version) THEN
    RETURN jsonb_build_object('success',false,'code','CONFLICT','message','DEUR version is stale.','retryable',false,'refreshRequired',true,'currentVersion',source.row_version);
  END IF;
  evidence=calculate_deur_billing_evidence(source.id,tenant);
  IF NOT coalesce((evidence->>'success')::boolean,false) THEN RETURN jsonb_build_object('success',false,'code',evidence->>'code','message',evidence->>'message','retryable',false,'refreshRequired',false); END IF;
  line_id=coalesce(nullif(command->>'lineId',''),extensions.gen_random_uuid()::text);
  INSERT INTO billing_statement_lines(id,billing_statement_id,rental_equipment_line_id,equipment_id,deur_id,operator_id,shift,
    deur_revision_chain_id,deur_revision_number,effective_deur_id,work_date,description,cost_code_snapshot,billing_method,quantity,unit,unit_rate,hours,hourly_rate,
    commercial_terms_source,commercial_captured_at,operating_charge,idle_charge,mobilization_charge,demobilization_charge,operator_charge,fuel_charge,
    amount,vat,withholding_tax,grand_total,created_by,company_id)
  VALUES(line_id,statement.id,source.rental_equipment_line_id,source.equipment_id,source.id,source.operator_id,source.shift,
    evidence->>'revisionChainId',nullif(evidence->>'revisionNumber','')::integer,source.id,source.work_date,
    coalesce(nullif(command->>'description',''),'Equipment rental'),coalesce(source.operational_metadata->'costCode'->>'code',''),
    (evidence->>'billingMethod')::billing_method,(evidence->>'quantity')::numeric,evidence->>'unit',(evidence->>'unitRate')::numeric,
    (evidence->>'hours')::numeric,(evidence->>'hourlyRate')::numeric,'IMMUTABLE_SNAPSHOT',(evidence->>'commercialCapturedAt')::timestamptz,
    (evidence->>'operatingCharge')::numeric,(evidence->>'idleCharge')::numeric,(evidence->>'mobilizationCharge')::numeric,
    (evidence->>'demobilizationCharge')::numeric,(evidence->>'operatorCharge')::numeric,(evidence->>'fuelCharge')::numeric,
    (evidence->>'subtotal')::numeric,(evidence->>'vat')::numeric,(evidence->>'withholdingTax')::numeric,(evidence->>'grandTotal')::numeric,actor,tenant);
  UPDATE deurs SET billing_locked=true,billing_statement_id=statement.id,status='Billed',updated_by=actor WHERE id=source.id;
  UPDATE billing_statements s SET subtotal=t.subtotal,vat=t.vat,withholding_tax=t.withholding_tax,grand_total=t.grand_total,updated_by=actor
  FROM (SELECT billing_statement_id,sum(amount) subtotal,sum(vat) vat,sum(withholding_tax) withholding_tax,sum(grand_total) grand_total
        FROM billing_statement_lines WHERE billing_statement_id=statement.id GROUP BY billing_statement_id) t WHERE s.id=t.billing_statement_id RETURNING s.* INTO statement;
  INSERT INTO audit_log(id,aggregate_type,aggregate_id,action,actor_id,occurred_at,correlation_id,new_values,metadata,company_id)
  VALUES(extensions.gen_random_uuid()::text,'BillingStatement',statement.id,'DEUR_CONSUMED',actor,now_at,command->>'commandId',
    jsonb_build_object('deurId',source.id,'lineId',line_id,'grandTotal',evidence->'grandTotal'),jsonb_build_object('source','command_consume_deur'),tenant);
  response=jsonb_build_object('success',true,'disposition','ACCEPTED','serverOccurredAt',now_at,'refresh',jsonb_build_array(statement.id,source.id,source.rental_id),
    'value',jsonb_build_object('statementId',statement.id,'lineId',line_id,'deurId',source.id,'statementVersion',statement.row_version,'deurVersion',source.row_version+1));
  RETURN finish_operational_command(command,'CONSUME_DEUR','DEUR',source.id,tenant,actor,payload_hash,response,source.row_version+1);
EXCEPTION WHEN unique_violation THEN
  RETURN jsonb_build_object('success',false,'code','DUPLICATE_CONSUMPTION','message','DEUR is already associated with billing.','retryable',false,'refreshRequired',true);
WHEN OTHERS THEN
  RETURN jsonb_build_object('success',false,'code','PERSISTENCE_FAILURE','message','DEUR billing consumption could not be completed.','retryable',false,'refreshRequired',true);
END $$;

CREATE FUNCTION execute_billing_statement_transition(command jsonb, command_type text, required_approval billing_approval_status, next_approval billing_approval_status)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,auth AS $$
DECLARE tenant text; actor text; statement billing_statements; idem jsonb; payload_hash text; response jsonb; now_at timestamptz=clock_timestamp();
BEGIN
  tenant=(SELECT company_id FROM users WHERE id=auth.uid() AND status='active'); actor=auth.uid()::text;
  IF tenant IS NULL THEN RETURN jsonb_build_object('success',false,'code','UNAUTHENTICATED','message','Authentication is required.','retryable',false,'refreshRequired',false); END IF;
  IF NOT current_user_has_permission('billing.update') THEN RETURN jsonb_build_object('success',false,'code','FORBIDDEN','message','Billing update permission is required.','retryable',false,'refreshRequired',false); END IF;
  SELECT * INTO statement FROM billing_statements WHERE id=command->>'statementId' AND company_id=tenant FOR UPDATE;
  IF statement.id IS NULL THEN RETURN jsonb_build_object('success',false,'code','NOT_FOUND','message','Billing statement is unavailable.','retryable',false,'refreshRequired',false); END IF;
  idem=begin_operational_command(command,command_type,'BILLING_STATEMENT',statement.id,tenant,actor);
  IF idem->>'state'='INVALID' THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED','message','An idempotency key is required.','retryable',false,'refreshRequired',false); END IF;
  IF idem->>'state'='MISMATCH' THEN RETURN jsonb_build_object('success',false,'code','IDEMPOTENCY_MISMATCH','message','Idempotency key payload mismatch.','retryable',false,'refreshRequired',false); END IF;
  IF idem->>'state'='REPLAY' THEN RETURN (idem->'response')||jsonb_build_object('disposition','REPLAYED'); END IF; payload_hash=idem->>'payloadHash';
  IF statement.row_version<>coalesce((command->>'expectedVersion')::bigint,statement.row_version) THEN RETURN jsonb_build_object('success',false,'code','CONFLICT','message','Billing statement version is stale.','retryable',false,'refreshRequired',true,'currentVersion',statement.row_version); END IF;
  IF statement.approval_status<>required_approval OR NOT EXISTS(SELECT 1 FROM billing_statement_lines WHERE billing_statement_id=statement.id) THEN
    RETURN jsonb_build_object('success',false,'code','INVALID_TRANSITION','message','Billing statement cannot be finalized.','retryable',false,'refreshRequired',false);
  END IF;
  UPDATE billing_statements SET approval_status=next_approval,submitted_by=actor,submitted_at=now_at,approved_by=actor,approved_at=now_at,updated_by=actor
  WHERE id=statement.id RETURNING * INTO statement;
  INSERT INTO audit_log(id,aggregate_type,aggregate_id,action,actor_id,occurred_at,correlation_id,previous_values,new_values,metadata,company_id)
  VALUES(extensions.gen_random_uuid()::text,'BillingStatement',statement.id,command_type,actor,now_at,command->>'commandId',
    jsonb_build_object('approvalStatus',required_approval),jsonb_build_object('approvalStatus',next_approval,'version',statement.row_version),jsonb_build_object('source','billing_statement_transition'),tenant);
  response=jsonb_build_object('success',true,'disposition','ACCEPTED','serverOccurredAt',now_at,'refresh',jsonb_build_array(statement.id,statement.rental_id),
    'value',jsonb_build_object('statementId',statement.id,'approvalStatus',statement.approval_status,'invoiceStatus',statement.invoice_status,'version',statement.row_version));
  RETURN finish_operational_command(command,command_type,'BILLING_STATEMENT',statement.id,tenant,actor,payload_hash,response,statement.row_version);
EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('success',false,'code','PERSISTENCE_FAILURE','message','Billing statement transition could not be completed.','retryable',false,'refreshRequired',true);
END $$;

CREATE FUNCTION command_finalize_billing_statement(command jsonb) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=erp,auth AS
$$ SELECT execute_billing_statement_transition(command,'FINALIZE_BILLING_STATEMENT','Draft','Approved') $$;

CREATE FUNCTION execute_invoice_transition(command jsonb, command_type text, required_status invoice_status, next_status invoice_status)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,auth AS $$
DECLARE tenant text; actor text; statement billing_statements; idem jsonb; payload_hash text; response jsonb; now_at timestamptz=clock_timestamp();
BEGIN
  tenant=(SELECT company_id FROM users WHERE id=auth.uid() AND status='active'); actor=auth.uid()::text;
  IF tenant IS NULL THEN RETURN jsonb_build_object('success',false,'code','UNAUTHENTICATED','message','Authentication is required.','retryable',false,'refreshRequired',false); END IF;
  IF NOT current_user_has_permission('billing.update') THEN RETURN jsonb_build_object('success',false,'code','FORBIDDEN','message','Billing update permission is required.','retryable',false,'refreshRequired',false); END IF;
  SELECT * INTO statement FROM billing_statements WHERE id=command->>'statementId' AND company_id=tenant FOR UPDATE;
  IF statement.id IS NULL THEN RETURN jsonb_build_object('success',false,'code','NOT_FOUND','message','Billing statement is unavailable.','retryable',false,'refreshRequired',false); END IF;
  idem=begin_operational_command(command,command_type,'BILLING_STATEMENT',statement.id,tenant,actor);
  IF idem->>'state'='INVALID' THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED','message','An idempotency key is required.','retryable',false,'refreshRequired',false); END IF;
  IF idem->>'state'='MISMATCH' THEN RETURN jsonb_build_object('success',false,'code','IDEMPOTENCY_MISMATCH','message','Idempotency key payload mismatch.','retryable',false,'refreshRequired',false); END IF;
  IF idem->>'state'='REPLAY' THEN RETURN (idem->'response')||jsonb_build_object('disposition','REPLAYED'); END IF; payload_hash=idem->>'payloadHash';
  IF statement.row_version<>coalesce((command->>'expectedVersion')::bigint,statement.row_version) THEN RETURN jsonb_build_object('success',false,'code','CONFLICT','message','Invoice version is stale.','retryable',false,'refreshRequired',true,'currentVersion',statement.row_version); END IF;
  IF statement.approval_status<>'Approved' OR statement.invoice_status<>required_status OR next_status='Cancelled' THEN
    RETURN jsonb_build_object('success',false,'code','INVALID_TRANSITION','message','Invoice lifecycle transition is not allowed.','retryable',false,'refreshRequired',false);
  END IF;
  UPDATE billing_statements SET invoice_status=next_status,updated_by=actor WHERE id=statement.id RETURNING * INTO statement;
  INSERT INTO audit_log(id,aggregate_type,aggregate_id,action,actor_id,occurred_at,correlation_id,previous_values,new_values,metadata,company_id)
  VALUES(extensions.gen_random_uuid()::text,'BillingStatement',statement.id,command_type,actor,now_at,command->>'commandId',
    jsonb_build_object('invoiceStatus',required_status),jsonb_build_object('invoiceStatus',next_status,'invoiceNumber',statement.statement_no,'version',statement.row_version),
    jsonb_build_object('source','invoice_transition'),tenant);
  response=jsonb_build_object('success',true,'disposition','ACCEPTED','serverOccurredAt',now_at,'refresh',jsonb_build_array(statement.id,statement.rental_id),
    'value',jsonb_build_object('statementId',statement.id,'invoiceNumber',statement.statement_no,'approvalStatus',statement.approval_status,'invoiceStatus',statement.invoice_status,'version',statement.row_version));
  RETURN finish_operational_command(command,command_type,'BILLING_STATEMENT',statement.id,tenant,actor,payload_hash,response,statement.row_version);
EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('success',false,'code','PERSISTENCE_FAILURE','message','Invoice transition could not be completed.','retryable',false,'refreshRequired',true);
END $$;

CREATE FUNCTION command_create_invoice(command jsonb) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=erp,auth AS
$$ SELECT execute_invoice_transition(command,'CREATE_INVOICE','Not Invoiced','Invoiced') $$;

CREATE FUNCTION command_update_invoice(command jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,auth AS $$
DECLARE current_status invoice_status; requested invoice_status;
BEGIN
  requested=(command->>'invoiceStatus')::invoice_status;
  SELECT invoice_status INTO current_status FROM billing_statements
  WHERE id=command->>'statementId' AND company_id=(SELECT company_id FROM users WHERE id=auth.uid() AND status='active');
  IF NOT ((current_status='Invoiced' AND requested IN('Partially Collected','Fully Collected')) OR
          (current_status='Partially Collected' AND requested='Fully Collected')) THEN
    RETURN jsonb_build_object('success',false,'code','INVALID_TRANSITION','message','Invoice lifecycle transition is not allowed.','retryable',false,'refreshRequired',false);
  END IF;
  RETURN execute_invoice_transition(command,'UPDATE_INVOICE',current_status,requested);
EXCEPTION WHEN invalid_text_representation THEN
  RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED','message','Invoice status is invalid.','retryable',false,'refreshRequired',false);
END $$;

REVOKE ALL ON FUNCTION next_billing_statement_number(),calculate_deur_billing_evidence(text,text),
  execute_billing_statement_transition(jsonb,text,billing_approval_status,billing_approval_status),
  execute_invoice_transition(jsonb,text,invoice_status,invoice_status) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION command_generate_billing_evidence(jsonb),command_consume_deur(jsonb),command_create_billing_statement(jsonb),
  command_finalize_billing_statement(jsonb),command_create_invoice(jsonb),command_update_invoice(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION command_generate_billing_evidence(jsonb),command_consume_deur(jsonb),command_create_billing_statement(jsonb),
  command_finalize_billing_statement(jsonb),command_create_invoice(jsonb),command_update_invoice(jsonb) TO authenticated;

COMMIT;
