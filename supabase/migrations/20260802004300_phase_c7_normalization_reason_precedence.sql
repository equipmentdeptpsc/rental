BEGIN;
SET search_path TO erp, auth, pg_catalog;

ALTER FUNCTION erp.legacy_rental_normalization_eligibility(text)
  RENAME TO legacy_rental_normalization_eligibility_04200;

CREATE FUNCTION erp.order_legacy_normalization_reason_codes(raw_reasons jsonb)
RETURNS jsonb
LANGUAGE sql IMMUTABLE
SET search_path=pg_catalog
AS $$
  SELECT coalesce(jsonb_agg(reason_code ORDER BY precedence, reason_code), '[]'::jsonb)
  FROM (
    SELECT DISTINCT value AS reason_code,
      CASE value
        WHEN 'NOT_FOUND' THEN 10
        WHEN 'UNAUTHORIZED' THEN 20
        WHEN 'TENANT_NOT_ALLOWED' THEN 30
        WHEN 'RETURNED_OR_CLOSED_RENTAL' THEN 40
        WHEN 'RENTAL_STATUS_NOT_ELIGIBLE' THEN 45
        WHEN 'INVOICE_OR_COLLECTION_EXISTS' THEN 50
        WHEN 'RECOVERY_EVIDENCE_EXISTS' THEN 60
        WHEN 'BILLING_EVIDENCE_EXISTS' THEN 70
        WHEN 'MANAGER_OUTCOME_EXISTS' THEN 80
        WHEN 'CUSTOMER_REVIEW_EXISTS' THEN 90
        WHEN 'SUBMITTED_DEUR_EXISTS' THEN 100
        WHEN 'DRAFT_DEUR_INCOMPATIBLE' THEN 110
        WHEN 'ACCEPTED_DOWNSTREAM_EVIDENCE' THEN 120
        WHEN 'NOT_LEGACY_RENTAL' THEN 130
        WHEN 'ALREADY_NORMALIZED' THEN 140
        WHEN 'SOURCE_DATA_INCOMPLETE' THEN 150
        ELSE 1000
      END AS precedence
    FROM jsonb_array_elements_text(coalesce(raw_reasons, '[]'::jsonb))
  ) reasons
$$;

CREATE FUNCTION erp.legacy_rental_normalization_eligibility(target_rental_id text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path=erp,auth
AS $$
DECLARE result jsonb; ordered_reasons jsonb; controlling_reason text;
BEGIN
  result=legacy_rental_normalization_eligibility_04200(target_rental_id);
  ordered_reasons=order_legacy_normalization_reason_codes(result->'reasonCodes');
  controlling_reason=ordered_reasons->>0;
  RETURN jsonb_set(
    jsonb_set(result,'{reasonCodes}',ordered_reasons,true),
    '{controllingReasonCode}',coalesce(to_jsonb(controlling_reason),'null'::jsonb),true
  );
END $$;

CREATE OR REPLACE FUNCTION erp.command_normalize_legacy_rental_deur_expectations(command jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,auth AS $$
DECLARE tenant text; actor text; target rentals; idem jsonb; payload_hash text; eligibility jsonb; now_at timestamptz=clock_timestamp(); line rental_equipment_lines; body jsonb; response jsonb; line_count integer=0; prior_version bigint;
BEGIN
 tenant=(SELECT company_id FROM users WHERE id=auth.uid() AND status='active');actor=auth.uid()::text;
 IF tenant IS NULL THEN RETURN jsonb_build_object('success',false,'code','UNAUTHORIZED'); END IF;
 IF tenant<>'TENANT-UAT-C7-NORMALIZE-001' OR NOT EXISTS(SELECT 1 FROM companies WHERE id=tenant AND code=tenant AND environment_class='test') THEN RETURN jsonb_build_object('success',false,'code','TENANT_NOT_ALLOWED'); END IF;
 IF NOT (current_user_has_permission('rental.manage') OR current_user_has_permission('rental.release')) THEN RETURN jsonb_build_object('success',false,'code','FORBIDDEN'); END IF;
 IF EXISTS(SELECT 1 FROM jsonb_object_keys(command) AS keys(key) WHERE key NOT IN('rentalId','expectedVersion','idempotencyKey','reason')) OR nullif(trim(command->>'rentalId'),'') IS NULL OR nullif(trim(command->>'idempotencyKey'),'') IS NULL OR nullif(trim(command->>'reason'),'') IS NULL THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;
 SELECT * INTO target FROM rentals WHERE id=command->>'rentalId' AND company_id=tenant FOR UPDATE;
 IF target.id IS NULL THEN RETURN jsonb_build_object('success',false,'code','NOT_FOUND'); END IF;
 PERFORM id FROM rental_equipment_lines WHERE rental_id=target.id AND company_id=tenant AND deleted_at IS NULL AND status<>'Cancelled' ORDER BY id FOR UPDATE;
 idem=begin_operational_command(command,'NORMALIZE_LEGACY_DEUR_EXPECTATIONS','RENTAL',target.id,tenant,actor);
 IF idem->>'state'='MISMATCH' THEN RETURN jsonb_build_object('success',false,'code','IDEMPOTENCY_MISMATCH'); END IF;
 IF idem->>'state'='REPLAY' THEN RETURN (idem->'response')||jsonb_build_object('disposition','REPLAYED'); END IF; payload_hash=idem->>'payloadHash';
 IF target.row_version<>(command->>'expectedVersion')::bigint THEN RETURN jsonb_build_object('success',false,'code','CONFLICT','currentVersion',target.row_version,'refreshRequired',true); END IF;
 eligibility=legacy_rental_normalization_eligibility(target.id);
 IF coalesce((eligibility->>'eligible')::boolean,false)=false THEN RETURN jsonb_build_object('success',false,'code',coalesce(eligibility->>'controllingReasonCode','SOURCE_DATA_INCOMPLETE'),'eligibility',eligibility); END IF;
 prior_version=target.row_version;
 FOR line IN SELECT * FROM rental_equipment_lines WHERE rental_id=target.id AND company_id=tenant AND deleted_at IS NULL AND status<>'Cancelled' ORDER BY id LOOP
  SELECT jsonb_build_object('rentalEquipmentLineId',line.id,'rentalId',line.rental_id,'equipmentId',line.equipment_id,'assignmentId',line.assignment_id,'operatorId',line.operator_id,'projectId',target.project_id,'customerId',target.customer_id,
   'policy',jsonb_strip_nulls(jsonb_build_object('frequency',target.deur_expectation_frequency,'effectiveFrom',target.deur_expectation_effective_from,'effectiveUntil',target.deur_expectation_effective_until,'expectedShiftCodes',target.expected_shift_codes,'excludedDates',target.excluded_dates,'timezone',target.timezone,'capturedAt',target.deur_expectation_captured_at)),
   'shiftWindows',coalesce((SELECT jsonb_agg(jsonb_build_object('code',w.code,'label',w.label,'startTime',w.start_time,'endTime',w.end_time,'timezone',w.timezone,'capturedAt',w.captured_at) ORDER BY w.code) FROM rental_shift_window_snapshots w WHERE w.rental_id=target.id),'[]'::jsonb),
   'workDescription',line.operational_metadata->'workDescription','operationalRemarks',line.operational_metadata->>'operationalRemarks','workDateRule','RENTAL_DATE_OUT','workDate',target.date_out,
   'meterRequirement',CASE WHEN cs.billing_method='Per Kilometer' THEN 'odometer' ELSE 'none' END,'fuelEvidenceRequired',coalesce(cs.fuel_charge,0)>0,'billingMethod',cs.billing_method::text,
   'operationalMetadata',(line.operational_metadata-'workDescription'-'operationalRemarks'-'deurExpectationSnapshot'),'sourceFingerprint','PENDING','capturedAt',now_at) INTO body
  FROM commercial_snapshots cs WHERE cs.rental_equipment_line_id=line.id AND cs.rental_id=target.id;
  UPDATE rental_equipment_lines SET operational_metadata=jsonb_set(operational_metadata,'{deurExpectationSnapshot}',body,true),updated_by=actor WHERE id=line.id;
  UPDATE rental_equipment_lines SET operational_metadata=jsonb_set(operational_metadata,'{deurExpectationSnapshot,sourceFingerprint}',to_jsonb(current_deur_expectation_fingerprint(id)),true) WHERE id=line.id;
  line_count=line_count+1;
 END LOOP;
 UPDATE rentals SET updated_by=actor WHERE id=target.id RETURNING * INTO target;
 INSERT INTO audit_log(id,aggregate_type,aggregate_id,action,actor_id,occurred_at,correlation_id,previous_values,new_values,metadata,company_id) VALUES(extensions.gen_random_uuid()::text,'Rental',target.id,'LEGACY_DEUR_EXPECTATIONS_NORMALIZED',actor,now_at,command->>'idempotencyKey',jsonb_build_object('snapshotPresent',false,'version',prior_version),jsonb_build_object('snapshotPresent',true,'version',target.row_version),jsonb_build_object('lineCount',line_count,'reason',left(trim(command->>'reason'),500)),tenant);
 response=jsonb_build_object('success',true,'disposition','ACCEPTED','serverOccurredAt',now_at,'value',jsonb_build_object('rentalId',target.id,'lineCount',line_count,'version',target.row_version));
 RETURN finish_operational_command(command,'NORMALIZE_LEGACY_DEUR_EXPECTATIONS','RENTAL',target.id,tenant,actor,payload_hash,response,target.row_version);
END $$;

ALTER FUNCTION erp.legacy_rental_normalization_eligibility_04200(text) OWNER TO postgres;
ALTER FUNCTION erp.order_legacy_normalization_reason_codes(jsonb) OWNER TO postgres;
ALTER FUNCTION erp.legacy_rental_normalization_eligibility(text) OWNER TO postgres;
ALTER FUNCTION erp.command_normalize_legacy_rental_deur_expectations(jsonb) OWNER TO postgres;

REVOKE ALL ON FUNCTION erp.legacy_rental_normalization_eligibility_04200(text),erp.order_legacy_normalization_reason_codes(jsonb),erp.legacy_rental_normalization_eligibility(text),erp.command_normalize_legacy_rental_deur_expectations(jsonb) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION erp.legacy_rental_normalization_eligibility_04200(text),erp.order_legacy_normalization_reason_codes(jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION erp.legacy_rental_normalization_eligibility(text),erp.command_normalize_legacy_rental_deur_expectations(jsonb) TO authenticated;

COMMIT;
