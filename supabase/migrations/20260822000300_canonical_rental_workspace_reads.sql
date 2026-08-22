BEGIN;

CREATE FUNCTION erp.can_read_canonical_rental_workspace()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=erp,auth,pg_catalog
AS $$
  SELECT erp.current_company_id() IS NOT NULL
    AND (
      erp.current_user_has_permission('rental.manage')
      OR erp.current_user_has_permission('rental.commercialTerms.manage')
      OR erp.current_user_has_permission('rental.approval.submit')
      OR erp.current_user_has_permission('rental.approval.decide')
      OR erp.current_user_has_permission('rental.release')
    )
$$;

CREATE FUNCTION erp.read_canonical_rental_workspace(target_rental_id text)
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

CREATE FUNCTION erp.read_canonical_rental_reference_data()
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

  RETURN jsonb_build_object(
    'success',true,
    'costCodes',(
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id',c.id,'code',c.code,'name',c.name,'active',c.active,'sortOrder',c.sort_order
      ) ORDER BY c.sort_order,c.code,c.id),'[]'::jsonb)
      FROM erp.cost_codes c
      WHERE c.active AND c.deleted_at IS NULL
    ),
    'activityCodes',(
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id',a.id,'code',a.code,'name',a.name,'active',a.active,'sortOrder',a.sort_order
      ) ORDER BY a.sort_order,a.code,a.id),'[]'::jsonb)
      FROM erp.activity_codes a
      WHERE a.active AND a.deleted_at IS NULL
    )
  );
END $$;

ALTER FUNCTION erp.can_read_canonical_rental_workspace() OWNER TO postgres;
ALTER FUNCTION erp.read_canonical_rental_workspace(text) OWNER TO postgres;
ALTER FUNCTION erp.read_canonical_rental_reference_data() OWNER TO postgres;

REVOKE ALL ON FUNCTION erp.can_read_canonical_rental_workspace(),erp.read_canonical_rental_workspace(text),erp.read_canonical_rental_reference_data() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION erp.read_canonical_rental_workspace(text),erp.read_canonical_rental_reference_data() TO authenticated;

COMMIT;
