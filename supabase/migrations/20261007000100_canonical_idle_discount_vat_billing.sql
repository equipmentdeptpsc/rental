BEGIN;
SET LOCAL search_path=erp,auth,extensions,pg_catalog;

-- New terms are additive. Existing contracts and immutable snapshots retain their
-- historical meaning: no configured idle rate, no discount, and the prior VAT
-- rate convention until a newly configured contract is captured.
ALTER TABLE erp.rental_contracts
  ADD COLUMN idle_rate numeric(19,6),
  ADD COLUMN discount_type text NOT NULL DEFAULT 'NONE',
  ADD COLUMN discount_value numeric(19,4) NOT NULL DEFAULT 0,
  ADD CONSTRAINT rental_contracts_idle_rate_valid CHECK (idle_rate IS NULL OR idle_rate >= 0),
  ADD CONSTRAINT rental_contracts_discount_valid CHECK (
    discount_type IN ('NONE','PERCENTAGE','FIXED_AMOUNT') AND discount_value >= 0
    AND (discount_type <> 'PERCENTAGE' OR discount_value <= 100)
    AND (discount_type <> 'NONE' OR discount_value = 0));

ALTER TABLE erp.commercial_snapshots
  ADD COLUMN idle_rate numeric(19,6),
  ADD COLUMN vat_applicability text,
  ADD COLUMN discount_type text NOT NULL DEFAULT 'NONE',
  ADD COLUMN discount_value numeric(19,4) NOT NULL DEFAULT 0,
  ADD CONSTRAINT commercial_snapshots_idle_rate_valid CHECK (idle_rate IS NULL OR idle_rate >= 0),
  ADD CONSTRAINT commercial_snapshots_discount_valid CHECK (
    discount_type IN ('NONE','PERCENTAGE','FIXED_AMOUNT') AND discount_value >= 0
    AND (discount_type <> 'PERCENTAGE' OR discount_value <= 100)
    AND (discount_type <> 'NONE' OR discount_value = 0)),
  ADD CONSTRAINT commercial_snapshots_vat_valid CHECK (vat_applicability IS NULL OR vat_applicability IN ('Applicable','Not Applicable'));

ALTER TABLE erp.billing_statement_lines
  ADD COLUMN idle_hours numeric(14,4) NOT NULL DEFAULT 0,
  ADD COLUMN standby_hours numeric(14,4) NOT NULL DEFAULT 0,
  ADD COLUMN standby_charge numeric(19,4) NOT NULL DEFAULT 0,
  ADD COLUMN discount_type text,
  ADD COLUMN discount_value numeric(19,4),
  ADD COLUMN discount_amount numeric(19,4) NOT NULL DEFAULT 0,
  ADD COLUMN subtotal_after_discount numeric(19,4),
  ADD COLUMN vat_applicable boolean,
  ADD COLUMN vat_rate numeric(9,6),
  ADD CONSTRAINT billing_statement_line_discount_valid CHECK (
    discount_amount >= 0 AND discount_amount <= amount
    AND (subtotal_after_discount IS NULL OR subtotal_after_discount = amount - discount_amount));

ALTER TABLE erp.billing_statements
  ADD COLUMN subtotal_before_discount numeric(19,4),
  ADD COLUMN discount_amount numeric(19,4),
  ADD COLUMN subtotal_after_discount numeric(19,4),
  ADD COLUMN vat_applicable boolean,
  ADD CONSTRAINT billing_statement_discount_valid CHECK (
    discount_amount IS NULL OR (discount_amount >= 0 AND discount_amount <= subtotal
      AND subtotal_before_discount = subtotal
      AND subtotal_after_discount = subtotal - discount_amount));

-- Existing reserve/release commands insert snapshots from the source contract.
-- Copy the new values before the snapshot immutability trigger takes effect.
CREATE FUNCTION erp.capture_snapshot_financial_terms() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,pg_catalog AS $$
DECLARE source erp.rental_contracts;
BEGIN
  IF NEW.source_contract_id IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO source FROM erp.rental_contracts WHERE id=NEW.source_contract_id;
  IF source.id IS NULL THEN RAISE EXCEPTION 'COMMERCIAL_SOURCE_REQUIRED' USING ERRCODE='23514'; END IF;
  NEW.idle_rate := source.idle_rate;
  NEW.vat_applicability := source.vat_applicability;
  NEW.discount_type := source.discount_type;
  NEW.discount_value := source.discount_value;
  RETURN NEW;
END $$;
CREATE TRIGGER capture_snapshot_financial_terms BEFORE INSERT ON erp.commercial_snapshots
FOR EACH ROW EXECUTE FUNCTION erp.capture_snapshot_financial_terms();
REVOKE ALL ON FUNCTION erp.capture_snapshot_financial_terms() FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION erp.calculate_deur_billing_evidence(target_deur_id text, tenant text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp AS $$
DECLARE
  source deurs; terms commercial_snapshots; method billing_method;
  billable_hours numeric; hours numeric(14,4); quantity numeric(19,6); unit text; rate numeric(19,6);
  operating numeric(19,4); idle_amount numeric(19,4); standby numeric(19,4); mobilization numeric(19,4);
  demobilization numeric(19,4); operator_amount numeric(19,4); fuel numeric(19,4);
  subtotal numeric(19,4); vat_amount numeric(19,4); withholding numeric(19,4); total numeric(19,4);
  vat_enabled boolean;
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
  billable_hours=greatest(source.total_operating_minutes::numeric/60,coalesce(terms.minimum_billable_hours,0));
  hours=round(billable_hours,4);
  rate=terms.unit_rate; quantity=CASE WHEN method='Per Hour' THEN hours ELSE 1 END;
  unit=CASE method WHEN 'Per Hour' THEN 'HOUR' WHEN 'Per Day' THEN 'DAY' WHEN 'Per Week' THEN 'WEEK' WHEN 'Per Month' THEN 'MONTH' ELSE 'LOT' END;
  operating=round(CASE method WHEN 'Per Hour' THEN billable_hours*rate WHEN 'One Lot' THEN coalesce(terms.contract_amount,rate) ELSE rate END,4);
  idle_amount=round((source.total_idle_minutes::numeric/60)*coalesce(terms.idle_rate,0),4);
  standby=round((source.total_standby_minutes::numeric/60)*coalesce(terms.standby_rate,0),4);
  mobilization=round(coalesce(terms.mobilization_fee,0),4); demobilization=round(coalesce(terms.demobilization_fee,0),4);
  operator_amount=round(CASE WHEN terms.operator_included THEN 0 ELSE coalesce(terms.operator_rate,0) END,4);
  fuel=round(coalesce(terms.fuel_charge,0),4);
  subtotal=operating+idle_amount+standby+mobilization+demobilization+operator_amount+fuel;
  IF subtotal<=0 THEN RETURN jsonb_build_object('success',false,'code','BILLING_INELIGIBLE','message','No configured billable charge exists for this DEUR.'); END IF;
  vat_enabled=CASE WHEN terms.vat_applicability IS NULL THEN coalesce(terms.tax_rate,0)>0 ELSE terms.vat_applicability='Applicable' END;
  vat_amount=round(subtotal*(CASE WHEN vat_enabled THEN coalesce(terms.tax_rate,0) ELSE 0 END/100),4);
  withholding=round(subtotal*(coalesce(terms.withholding_tax,0)/100),4); total=subtotal+vat_amount-withholding;
  RETURN jsonb_build_object('success',true,'deurId',source.id,'rentalId',source.rental_id,'rentalLineId',source.rental_equipment_line_id,
    'equipmentId',source.equipment_id,'operatorId',source.operator_id,'workDate',source.work_date,'billingMethod',method,
    'quantity',quantity,'unit',unit,'unitRate',rate,'hours',hours,'hourlyRate',CASE WHEN method='Per Hour' THEN rate ELSE 0 END,
    'operatingCharge',operating,'idleCharge',idle_amount,'idleHours',round(source.total_idle_minutes::numeric/60,4),
    'standbyCharge',standby,'standbyHours',round(source.total_standby_minutes::numeric/60,4),
    'mobilizationCharge',mobilization,'demobilizationCharge',demobilization,'operatorCharge',operator_amount,'fuelCharge',fuel,
    'subtotal',subtotal,'vat',vat_amount,'vatApplicable',vat_enabled,'vatRate',CASE WHEN vat_enabled THEN coalesce(terms.tax_rate,0) ELSE 0 END,
    'discountType',terms.discount_type,'discountValue',terms.discount_value,
    'withholdingTax',withholding,'grandTotal',total,'commercialTermsSource','IMMUTABLE_SNAPSHOT',
    'commercialCapturedAt',terms.captured_at,'revisionChainId',coalesce(source.revision_chain_id,source.id),'revisionNumber',source.revision_number);
END $$;
REVOKE ALL ON FUNCTION erp.calculate_deur_billing_evidence(text,text) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION erp.recalculate_draft_billing_financials(target_statement_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,pg_catalog AS $$
DECLARE
  statement_record erp.billing_statements;
  group_record record; line_record record;
  group_discount numeric(19,4); allocated numeric(19,4);
  line_discount numeric(19,4); net_amount numeric(19,4);
BEGIN
  SELECT * INTO statement_record FROM erp.billing_statements WHERE id=target_statement_id FOR UPDATE;
  IF statement_record.id IS NULL OR statement_record.approval_status <> 'Draft' THEN
    RAISE EXCEPTION 'DRAFT_BILLING_REQUIRED' USING ERRCODE='23514';
  END IF;
  FOR group_record IN
    SELECT commercial_snapshot_id, max(discount_type) AS discount_type,
      max(discount_value) AS discount_value, sum(amount) AS gross
    FROM erp.billing_statement_lines WHERE billing_statement_id=target_statement_id
    GROUP BY commercial_snapshot_id
  LOOP
    group_discount := CASE group_record.discount_type
      WHEN 'PERCENTAGE' THEN round(group_record.gross * group_record.discount_value / 100,4)
      WHEN 'FIXED_AMOUNT' THEN least(group_record.gross,group_record.discount_value)
      ELSE 0 END;
    allocated := 0;
    FOR line_record IN
      SELECT l.id,l.amount,coalesce(l.vat_rate,s.tax_rate,0) AS vat_rate,
        coalesce(l.vat_applicable,coalesce(s.tax_rate,0)>0) AS vat_applicable,l.commercial_snapshot_id
      FROM erp.billing_statement_lines l
      LEFT JOIN erp.commercial_snapshots s ON s.id=l.commercial_snapshot_id
      WHERE l.billing_statement_id=target_statement_id AND l.commercial_snapshot_id IS NOT DISTINCT FROM group_record.commercial_snapshot_id
      ORDER BY l.id
    LOOP
      line_discount := CASE WHEN line_record.id = (
        SELECT max(id) FROM erp.billing_statement_lines
        WHERE billing_statement_id=target_statement_id AND commercial_snapshot_id IS NOT DISTINCT FROM group_record.commercial_snapshot_id)
        THEN group_discount-allocated
        ELSE round(group_discount*line_record.amount/nullif(group_record.gross,0),4) END;
      line_discount := greatest(0,least(line_record.amount,coalesce(line_discount,0)));
      allocated := allocated+line_discount;
      net_amount := line_record.amount-line_discount;
      UPDATE erp.billing_statement_lines SET
        discount_amount=line_discount,subtotal_after_discount=net_amount,
        vat=round(net_amount*(CASE WHEN line_record.vat_applicable THEN coalesce(line_record.vat_rate,0) ELSE 0 END)/100,4),
        withholding_tax=round(net_amount*coalesce((SELECT withholding_tax FROM erp.commercial_snapshots WHERE id=line_record.commercial_snapshot_id),0)/100,4),
        grand_total=net_amount+round(net_amount*(CASE WHEN line_record.vat_applicable THEN coalesce(line_record.vat_rate,0) ELSE 0 END)/100,4)
          -round(net_amount*coalesce((SELECT withholding_tax FROM erp.commercial_snapshots WHERE id=line_record.commercial_snapshot_id),0)/100,4)
      WHERE id=line_record.id;
    END LOOP;
  END LOOP;
  UPDATE erp.billing_statements s SET
    subtotal=t.gross,subtotal_before_discount=t.gross,discount_amount=t.discount,
    subtotal_after_discount=t.net,vat=t.vat,vat_applicable=t.vat_applicable,
    withholding_tax=t.withholding,grand_total=t.total
  FROM (SELECT sum(l.amount) gross,sum(l.discount_amount) discount,sum(l.subtotal_after_discount) net,
    sum(l.vat) vat,bool_or(coalesce(l.vat_applicable,coalesce(s.tax_rate,0)>0)) vat_applicable,sum(l.withholding_tax) withholding,
    sum(l.grand_total) total FROM erp.billing_statement_lines l
    LEFT JOIN erp.commercial_snapshots s ON s.id=l.commercial_snapshot_id
    WHERE l.billing_statement_id=target_statement_id) t
  WHERE s.id=target_statement_id;
END $$;
REVOKE ALL ON FUNCTION erp.recalculate_draft_billing_financials(text) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION command_consume_deur(command jsonb)
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
    deur_revision_chain_id,deur_revision_number,effective_deur_id,work_date,description,cost_code_snapshot,activity_code_snapshot,billing_method,quantity,unit,unit_rate,hours,hourly_rate,
    commercial_terms_source,commercial_captured_at,operating_charge,idle_charge,idle_hours,standby_charge,standby_hours,discount_type,discount_value,vat_applicable,vat_rate,mobilization_charge,demobilization_charge,operator_charge,fuel_charge,
    amount,vat,withholding_tax,grand_total,created_by,company_id)
  VALUES(line_id,statement.id,source.rental_equipment_line_id,source.equipment_id,source.id,source.operator_id,source.shift,
    evidence->>'revisionChainId',nullif(evidence->>'revisionNumber','')::integer,source.id,source.work_date,
    coalesce(nullif(command->>'description',''),'Equipment rental'),coalesce(source.operational_metadata->'costCode'->>'code',''),source.operational_metadata->'activityCode'->>'code',
    (evidence->>'billingMethod')::billing_method,(evidence->>'quantity')::numeric,evidence->>'unit',(evidence->>'unitRate')::numeric,
    (evidence->>'hours')::numeric,(evidence->>'hourlyRate')::numeric,'IMMUTABLE_SNAPSHOT',(evidence->>'commercialCapturedAt')::timestamptz,
    (evidence->>'operatingCharge')::numeric,(evidence->>'idleCharge')::numeric,(evidence->>'idleHours')::numeric,(evidence->>'standbyCharge')::numeric,(evidence->>'standbyHours')::numeric,evidence->>'discountType',(evidence->>'discountValue')::numeric,(evidence->>'vatApplicable')::boolean,(evidence->>'vatRate')::numeric,(evidence->>'mobilizationCharge')::numeric,
    (evidence->>'demobilizationCharge')::numeric,(evidence->>'operatorCharge')::numeric,(evidence->>'fuelCharge')::numeric,
    (evidence->>'subtotal')::numeric,(evidence->>'vat')::numeric,(evidence->>'withholdingTax')::numeric,(evidence->>'grandTotal')::numeric,actor,tenant);
  UPDATE deurs SET billing_locked=true,billing_statement_id=statement.id,status='Billed',updated_by=actor WHERE id=source.id;
  PERFORM recalculate_draft_billing_financials(statement.id);
  SELECT * INTO statement FROM billing_statements WHERE id=statement.id;
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


CREATE FUNCTION erp.validate_billing_discount_on_finalize() RETURNS trigger
LANGUAGE plpgsql SET search_path=erp,pg_catalog AS $$
BEGIN
  IF OLD.approval_status='Draft' AND NEW.approval_status='Approved'
    AND EXISTS (
      SELECT 1 FROM erp.billing_statement_lines l
      WHERE l.billing_statement_id=OLD.id AND l.discount_type='FIXED_AMOUNT'
      GROUP BY l.commercial_snapshot_id
      HAVING max(l.discount_value)>sum(l.amount)
    ) THEN
    RAISE EXCEPTION 'FIXED_DISCOUNT_EXCEEDS_ELIGIBLE_SUBTOTAL' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER validate_billing_discount_on_finalize
BEFORE UPDATE OF approval_status ON erp.billing_statements
FOR EACH ROW EXECUTE FUNCTION erp.validate_billing_discount_on_finalize();
REVOKE ALL ON FUNCTION erp.validate_billing_discount_on_finalize() FROM PUBLIC,anon,authenticated,service_role;




CREATE OR REPLACE FUNCTION erp.command_update_draft_rental_terms(command jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,auth,extensions,pg_catalog AS $$
DECLARE tenant text=erp.current_company_id();actor text=auth.uid()::text;target erp.rentals;line_row erp.rental_equipment_lines;item jsonb;terms jsonb;idem jsonb;payload_hash text;response jsonb;expected bigint;now_at timestamptz=clock_timestamp();
BEGIN
 IF tenant IS NULL OR NOT erp.current_user_has_permission('rental.commercialTerms.update') THEN RETURN jsonb_build_object('success',false,'code','FORBIDDEN');END IF;
 IF command ?| ARRAY['companyId','actorId','status'] OR jsonb_typeof(command->'lines') IS DISTINCT FROM 'array' OR jsonb_array_length(command->'lines')=0 THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED');END IF;
 SELECT * INTO target FROM erp.rentals WHERE id=command->>'rentalId' AND company_id=tenant FOR UPDATE;
 IF target.id IS NULL THEN RETURN jsonb_build_object('success',false,'code','NOT_FOUND');END IF;
 idem=erp.begin_operational_command(command,'UPDATE_DRAFT_RENTAL_TERMS','RENTAL',target.id,tenant,actor);IF idem->>'state'='MISMATCH' THEN RETURN jsonb_build_object('success',false,'code','IDEMPOTENCY_MISMATCH');ELSIF idem->>'state'='REPLAY' THEN RETURN (idem->'response')||jsonb_build_object('disposition','REPLAYED');END IF;payload_hash=idem->>'payloadHash';
 BEGIN expected=(command->>'expectedVersion')::bigint;EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED');END;
 IF target.status<>'Draft' THEN RETURN jsonb_build_object('success',false,'code','INVALID_TRANSITION');ELSIF expected<>target.row_version THEN RETURN jsonb_build_object('success',false,'code','CONFLICT','currentVersion',target.row_version);END IF;
 IF (SELECT array_agg(value->>'lineId' ORDER BY value->>'lineId') FROM jsonb_array_elements(command->'lines')) IS DISTINCT FROM (SELECT array_agg(id ORDER BY id) FROM erp.rental_equipment_lines WHERE rental_id=target.id AND company_id=tenant AND deleted_at IS NULL) THEN RETURN jsonb_build_object('success',false,'code','LINE_SET_MISMATCH');END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(command->'lines') LOOP
  terms=item->'commercialTerms';SELECT * INTO line_row FROM erp.rental_equipment_lines WHERE id=item->>'lineId' AND rental_id=target.id AND company_id=tenant FOR UPDATE;
  IF jsonb_typeof(terms) IS DISTINCT FROM 'object' OR terms->>'billingMethod' NOT IN('Per Hour','Per Day','Per Week','Per Month','Per Trip','Per Kilometer','Per Cubic Meter','One Lot','Per Lot') OR length(terms->>'currency')<>3 OR jsonb_typeof(terms->'operatorIncluded') IS DISTINCT FROM 'boolean' OR nullif(terms->>'unitRate','') IS NULL OR (terms->>'unitRate')::numeric<0 OR (terms ? 'idleRate' AND (terms->>'idleRate')::numeric<0) OR coalesce(terms->>'discountType','NONE') NOT IN ('NONE','PERCENTAGE','FIXED_AMOUNT') OR coalesce((terms->>'discountValue')::numeric,0)<0 OR (terms->>'discountType'='PERCENTAGE' AND (terms->>'discountValue')::numeric>100) OR (coalesce(terms->>'discountType','NONE')='NONE' AND coalesce((terms->>'discountValue')::numeric,0)<>0) OR coalesce(terms->>'vatApplicability','Applicable') NOT IN ('Applicable','Not Applicable') OR (coalesce(terms->>'transactionRelationship','Non-Affiliate')='Affiliate' AND coalesce(terms->>'vatApplicability','Applicable')<>'Not Applicable') OR (coalesce(terms->>'transactionRelationship','Non-Affiliate')='Non-Affiliate' AND coalesce(terms->>'vatApplicability','Applicable')<>'Applicable') OR (terms->>'vatApplicability'='Applicable' AND coalesce((terms->>'taxRate')::numeric,0)<=0) OR nullif(item->>'costCodeId','') IS NULL OR nullif(item->>'activityCodeId','') IS NULL OR nullif(item->>'workDescriptionId','') IS NULL OR jsonb_typeof(item->'deurPolicy') IS DISTINCT FROM 'object' THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED');END IF;
  IF NOT EXISTS(SELECT 1 FROM erp.equipment e WHERE e.id=line_row.equipment_id AND e.company_id=tenant AND e.cost_code_id=item->>'costCodeId') OR NOT EXISTS(SELECT 1 FROM erp.assignments a WHERE a.id=line_row.assignment_id AND a.company_id=tenant AND a.activity_code_id=item->>'activityCodeId') OR NOT EXISTS(SELECT 1 FROM erp.work_descriptions w WHERE w.id=item->>'workDescriptionId' AND w.active AND w.deleted_at IS NULL) THEN RETURN jsonb_build_object('success',false,'code','MISSING_RELATIONSHIP');END IF;
 END LOOP;
 DELETE FROM erp.rental_contracts WHERE rental_id=target.id AND status='Draft';
 FOR item IN SELECT value FROM jsonb_array_elements(command->'lines') LOOP terms=item->'commercialTerms';SELECT * INTO line_row FROM erp.rental_equipment_lines WHERE id=item->>'lineId';
  INSERT INTO erp.rental_contracts(id,rental_id,rental_equipment_line_id,contract_no,customer_id,equipment_id,project_id,rental_type,billing_method,currency,unit_rate,minimum_billable_hours,overtime_rate,standby_rate,idle_rate,discount_type,discount_value,mobilization_fee,demobilization_fee,fuel_charge,operator_included,operator_rate,contract_amount,tax_rate,withholding_tax,transaction_relationship,vat_applicability,remarks,start_date,expected_end_date,status,created_by,updated_by)
  VALUES(gen_random_uuid()::text,target.id,line_row.id,'DRAFT-'||target.rental_number,target.customer_id,line_row.equipment_id,target.project_id,target.rental_type,(terms->>'billingMethod')::erp.billing_method,upper(terms->>'currency'),(terms->>'unitRate')::numeric,nullif(terms->>'minimumBillableHours','')::numeric,nullif(terms->>'overtimeRate','')::numeric,nullif(terms->>'standbyRate','')::numeric,nullif(terms->>'idleRate','')::numeric,coalesce(terms->>'discountType','NONE'),coalesce((terms->>'discountValue')::numeric,0),nullif(terms->>'mobilizationFee','')::numeric,nullif(terms->>'demobilizationFee','')::numeric,nullif(terms->>'fuelCharge','')::numeric,(terms->>'operatorIncluded')::boolean,nullif(terms->>'operatorRate','')::numeric,nullif(terms->>'contractAmount','')::numeric,nullif(terms->>'taxRate','')::numeric,nullif(terms->>'withholdingTax','')::numeric,coalesce(terms->>'transactionRelationship','Non-Affiliate'),coalesce(terms->>'vatApplicability','Applicable'),terms->>'remarks',target.date_out,coalesce(target.expected_return,target.date_out),'Draft',actor,actor);
  UPDATE erp.rental_equipment_lines SET operational_metadata=operational_metadata||jsonb_build_object('draftPreparation',item-'commercialTerms'),updated_by=actor WHERE id=line_row.id;
 END LOOP;
 UPDATE erp.rentals SET approval_status='NotSubmitted',approval_requested_at=NULL,approval_requested_by=NULL,approval_decided_at=NULL,approval_decided_by=NULL,approval_decision_remarks=NULL,updated_by=actor WHERE id=target.id RETURNING * INTO target;
 INSERT INTO erp.audit_log(id,company_id,aggregate_type,aggregate_id,action,actor_id,occurred_at,correlation_id,new_values) VALUES(gen_random_uuid()::text,tenant,'Rental',target.id,'RENTAL_TERMS_UPDATED',actor,now_at,command->>'commandId',jsonb_build_object('lineCount',jsonb_array_length(command->'lines'),'version',target.row_version));
 response=jsonb_build_object('success',true,'disposition','ACCEPTED','value',jsonb_build_object('rentalId',target.id,'status',target.status,'approvalStatus',target.approval_status,'version',target.row_version));RETURN erp.finish_operational_command(command,'UPDATE_DRAFT_RENTAL_TERMS','RENTAL',target.id,tenant,actor,payload_hash,response,target.row_version);
EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('success',false,'code','PERSISTENCE_FAILURE');END $$;


CREATE OR REPLACE FUNCTION erp.read_canonical_rental_workspace(target_rental_id text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=erp,auth,pg_catalog
AS $$
DECLARE
  tenant text=erp.current_company_id();
BEGIN
  IF tenant IS NULL THEN
    RETURN jsonb_build_object('success',false,'code','UNAUTHENTICATED');
  END IF;
  IF NOT erp.can_read_canonical_rental_workspace() THEN
    RETURN jsonb_build_object('success',false,'code','FORBIDDEN');
  END IF;
  IF nullif(btrim(target_rental_id),'') IS NULL THEN
    RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED');
  END IF;
  IF NOT EXISTS(SELECT 1 FROM erp.rentals r WHERE r.id=target_rental_id AND r.company_id=tenant) THEN
    RETURN jsonb_build_object('success',false,'code','NOT_FOUND');
  END IF;

  RETURN jsonb_build_object(
    'success',true,
    'rentalId',target_rental_id,
    'contracts',(
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id',c.id,
        'rentalId',c.rental_id,
        'rentalEquipmentLineId',c.rental_equipment_line_id,
        'contractNo',c.contract_no,
        'billingMethod',c.billing_method,
        'currency',btrim(c.currency),
        'unitRate',c.unit_rate,
        'minimumBillableHours',c.minimum_billable_hours,
        'overtimeRate',c.overtime_rate,
        'standbyRate',c.standby_rate,
        'idleRate',c.idle_rate,'discountType',c.discount_type,'discountValue',c.discount_value,
        'mobilizationFee',c.mobilization_fee,
        'demobilizationFee',c.demobilization_fee,
        'fuelCharge',c.fuel_charge,
        'operatorIncluded',c.operator_included,
        'operatorRate',c.operator_rate,
        'contractAmount',c.contract_amount,
        'taxRate',c.tax_rate,
        'withholdingTax',c.withholding_tax,
        'transactionRelationship',c.transaction_relationship,
        'vatApplicability',c.vat_applicability,
        'remarks',c.remarks,
        'startDate',c.start_date,
        'expectedEndDate',c.expected_end_date,
        'status',c.status,
        'rowVersion',c.row_version
      ) ORDER BY c.rental_equipment_line_id,c.id),'[]'::jsonb)
      FROM erp.rental_contracts c
      WHERE c.rental_id=target_rental_id
    ),
    'commercialSnapshots',(
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id',s.id,
        'rentalId',s.rental_id,
        'rentalEquipmentLineId',s.rental_equipment_line_id,
        'sourceContractId',s.source_contract_id,
        'billingMethod',s.billing_method,
        'currency',btrim(s.currency),
        'unitRate',s.unit_rate,
        'minimumBillableHours',s.minimum_billable_hours,
        'overtimeRate',s.overtime_rate,
        'standbyRate',s.standby_rate,
        'idleRate',s.idle_rate,'discountType',s.discount_type,'discountValue',s.discount_value,'vatApplicability',s.vat_applicability,
        'mobilizationFee',s.mobilization_fee,
        'demobilizationFee',s.demobilization_fee,
        'fuelCharge',s.fuel_charge,
        'operatorIncluded',s.operator_included,
        'operatorRate',s.operator_rate,
        'contractAmount',s.contract_amount,
        'taxRate',s.tax_rate,
        'withholdingTax',s.withholding_tax,
        'capturedAt',s.captured_at
      ) ORDER BY s.rental_equipment_line_id,s.id),'[]'::jsonb)
      FROM erp.commercial_snapshots s
      WHERE s.rental_id=target_rental_id
    )
  );
END $$;



COMMIT;
