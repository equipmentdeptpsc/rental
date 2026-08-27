BEGIN;
SET search_path TO erp, public;

CREATE OR REPLACE FUNCTION erp.calculate_deur_billing_evidence(target_deur_id text, tenant text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp AS $$
DECLARE
  source deurs; terms commercial_snapshots; method billing_method;
  billable_hours numeric; hours numeric(14,4); quantity numeric(19,6); unit text; rate numeric(19,6);
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
  billable_hours=greatest(source.total_operating_minutes::numeric/60,coalesce(terms.minimum_billable_hours,0));
  hours=round(billable_hours,4);
  rate=terms.unit_rate; quantity=CASE WHEN method='Per Hour' THEN hours ELSE 1 END;
  unit=CASE method WHEN 'Per Hour' THEN 'HOUR' WHEN 'Per Day' THEN 'DAY' WHEN 'Per Week' THEN 'WEEK' WHEN 'Per Month' THEN 'MONTH' ELSE 'LOT' END;
  operating=round(CASE method WHEN 'Per Hour' THEN billable_hours*rate WHEN 'One Lot' THEN coalesce(terms.contract_amount,rate) ELSE rate END,4);
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

REVOKE ALL ON FUNCTION erp.calculate_deur_billing_evidence(text,text) FROM PUBLIC,anon,authenticated,service_role;

COMMIT;
