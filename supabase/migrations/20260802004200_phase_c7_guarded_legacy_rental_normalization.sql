BEGIN;
SET search_path TO erp, auth;

CREATE FUNCTION legacy_rental_normalization_eligibility(target_rental_id text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,auth AS $$
DECLARE tenant text; target rentals; lines jsonb='[]'::jsonb; incomplete jsonb='[]'::jsonb; reasons text[]='{}'; downstream jsonb; all_snapshots boolean=false; active_count integer;
BEGIN
 tenant=(SELECT company_id FROM users WHERE id=auth.uid() AND status='active');
 IF tenant IS NULL THEN RETURN jsonb_build_object('eligible',false,'rentalId',target_rental_id,'reasonCodes',jsonb_build_array('UNAUTHORIZED'),'lineResults','[]'::jsonb,'incompleteLines','[]'::jsonb); END IF;
 IF tenant<>'TENANT-UAT-C7-NORMALIZE-001' OR NOT EXISTS(SELECT 1 FROM companies WHERE id=tenant AND code=tenant AND environment_class='test') THEN RETURN jsonb_build_object('eligible',false,'rentalId',target_rental_id,'reasonCodes',jsonb_build_array('TENANT_NOT_ALLOWED'),'lineResults','[]'::jsonb,'incompleteLines','[]'::jsonb); END IF;
 IF NOT (current_user_has_permission('rental.manage') OR current_user_has_permission('rental.release')) THEN RETURN jsonb_build_object('eligible',false,'rentalId',target_rental_id,'reasonCodes',jsonb_build_array('UNAUTHORIZED'),'lineResults','[]'::jsonb,'incompleteLines','[]'::jsonb); END IF;
 SELECT * INTO target FROM rentals WHERE id=target_rental_id AND company_id=tenant;
 IF target.id IS NULL THEN RETURN jsonb_build_object('eligible',false,'rentalId',target_rental_id,'reasonCodes',jsonb_build_array('NOT_FOUND'),'lineResults','[]'::jsonb,'incompleteLines','[]'::jsonb); END IF;
 IF coalesce((target.legacy_payload->>'legacyDeurNormalizationCandidate')::boolean,false)=false THEN reasons=array_append(reasons,'NOT_LEGACY_RENTAL'); END IF;
 IF target.status<>'Released' THEN reasons=array_append(reasons,CASE WHEN target.status IN('Returned','Closed') THEN 'RETURNED_OR_CLOSED_RENTAL' ELSE 'RENTAL_STATUS_NOT_ELIGIBLE' END); END IF;
 SELECT count(*),coalesce(bool_and(operational_metadata ? 'deurExpectationSnapshot'),false) INTO active_count,all_snapshots FROM rental_equipment_lines WHERE rental_id=target.id AND company_id=tenant AND deleted_at IS NULL AND status<>'Cancelled';
 IF active_count=0 THEN reasons=array_append(reasons,'SOURCE_DATA_INCOMPLETE'); END IF;
 IF all_snapshots THEN reasons=array_append(reasons,'ALREADY_NORMALIZED'); END IF;
 downstream=jsonb_build_object(
  'deurEvidence',EXISTS(SELECT 1 FROM deurs WHERE rental_id=target.id),
  'submittedDeur',EXISTS(SELECT 1 FROM deurs WHERE rental_id=target.id AND status<>'Draft'),
  'customerReview',EXISTS(SELECT 1 FROM customer_review_requests WHERE rental_id=target.id),
  'managerOutcome',EXISTS(SELECT 1 FROM manager_review_outcomes WHERE rental_id=target.id),
  'billing',EXISTS(SELECT 1 FROM billing_statements WHERE rental_id=target.id),
  'invoiceOrCollection',EXISTS(SELECT 1 FROM billing_statements b WHERE b.rental_id=target.id AND (b.invoice_status<>'Not Invoiced' OR EXISTS(SELECT 1 FROM collections c WHERE c.billing_statement_id=b.id))),
  'recovery',EXISTS(SELECT 1 FROM recovery_compensations WHERE company_id=tenant AND target_entity_type='RENTAL' AND target_entity_id=target.id));
 IF (downstream->>'submittedDeur')::boolean THEN reasons=array_append(reasons,'SUBMITTED_DEUR_EXISTS'); END IF;
 IF (downstream->>'deurEvidence')::boolean AND NOT (downstream->>'submittedDeur')::boolean THEN reasons=array_append(reasons,'DRAFT_DEUR_INCOMPATIBLE'); END IF;
 IF (downstream->>'customerReview')::boolean THEN reasons=array_append(reasons,'CUSTOMER_REVIEW_EXISTS'); END IF;
 IF (downstream->>'managerOutcome')::boolean THEN reasons=array_append(reasons,'MANAGER_OUTCOME_EXISTS'); END IF;
 IF (downstream->>'billing')::boolean THEN reasons=array_append(reasons,'BILLING_EVIDENCE_EXISTS'); END IF;
 IF (downstream->>'invoiceOrCollection')::boolean THEN reasons=array_append(reasons,'INVOICE_OR_COLLECTION_EXISTS'); END IF;
 IF (downstream->>'recovery')::boolean THEN reasons=array_append(reasons,'RECOVERY_EVIDENCE_EXISTS'); END IF;
 IF jsonb_path_exists(downstream,'$.* ? (@ == true)') THEN reasons=array_append(reasons,'ACCEPTED_DOWNSTREAM_EVIDENCE'); END IF;
 SELECT coalesce(jsonb_agg(result ORDER BY result->>'rentalEquipmentLineId'),'[]'::jsonb) INTO lines FROM (
  SELECT jsonb_build_object('rentalEquipmentLineId',l.id,'snapshotPresent',l.operational_metadata?'deurExpectationSnapshot','eligible',cardinality(codes)=0,'reasonCodes',to_jsonb(codes),'evidence',jsonb_build_object(
   'lineIdentity',nullif(trim(l.id),'') IS NOT NULL AND l.rental_id=target.id,'assignmentValid',a.id IS NOT NULL AND a.status='Active' AND a.equipment_id=l.equipment_id AND a.operator_id=l.operator_id AND a.project_id=target.project_id,
   'operatorValid',o.id IS NOT NULL AND o.status='Active','projectValid',p.id IS NOT NULL AND p.active,'equipmentValid',e.id IS NOT NULL AND e.active,
   'customerValid',c.id IS NOT NULL AND c.active,'policyValid',target.deur_expectation_frequency IS NOT NULL AND target.deur_expectation_effective_from IS NOT NULL,
   'shiftValid',target.deur_expectation_frequency<>'PER_SHIFT' OR (coalesce(cardinality(target.expected_shift_codes),0)>0 AND (SELECT count(*) FROM rental_shift_window_snapshots w WHERE w.rental_id=target.id)=cardinality(target.expected_shift_codes)),
   'workDescriptionValid',nullif(trim(l.operational_metadata#>>'{workDescription,name}'),'') IS NOT NULL,'commercialSnapshotValid',cs.id IS NOT NULL,'draftDeurCompatible',NOT EXISTS(SELECT 1 FROM deurs d WHERE d.rental_equipment_line_id=l.id),
   'downstreamEvidence',EXISTS(SELECT 1 FROM deurs d WHERE d.rental_equipment_line_id=l.id))) result FROM rental_equipment_lines l
  LEFT JOIN assignments a ON a.id=l.assignment_id AND a.company_id=tenant LEFT JOIN operators o ON o.id=l.operator_id AND o.company_id=tenant AND o.deleted_at IS NULL
  LEFT JOIN projects p ON p.id=target.project_id AND p.company_id=tenant AND p.deleted_at IS NULL LEFT JOIN equipment e ON e.id=l.equipment_id AND e.company_id=tenant AND e.deleted_at IS NULL
  LEFT JOIN customers c ON c.id=target.customer_id AND c.company_id=tenant AND c.deleted_at IS NULL LEFT JOIN commercial_snapshots cs ON cs.rental_equipment_line_id=l.id AND cs.rental_id=target.id
  CROSS JOIN LATERAL(SELECT array_remove(ARRAY[
   CASE WHEN nullif(trim(l.id),'') IS NULL OR l.rental_id<>target.id THEN 'LINE_IDENTITY_INVALID' END,
   CASE WHEN a.id IS NULL OR a.status<>'Active' OR a.equipment_id<>l.equipment_id OR a.operator_id<>l.operator_id OR a.project_id<>target.project_id THEN 'ASSIGNMENT_INVALID' END,
   CASE WHEN o.id IS NULL OR o.status<>'Active' THEN 'OPERATOR_INVALID' END,CASE WHEN p.id IS NULL OR NOT p.active THEN 'PROJECT_INVALID' END,
   CASE WHEN e.id IS NULL OR NOT e.active THEN 'EQUIPMENT_INVALID' END,CASE WHEN c.id IS NULL OR NOT c.active THEN 'CUSTOMER_INVALID' END,
   CASE WHEN target.deur_expectation_frequency IS NULL OR target.deur_expectation_effective_from IS NULL THEN 'DEUR_POLICY_MISSING' END,
   CASE WHEN target.deur_expectation_frequency='PER_SHIFT' AND coalesce(cardinality(target.expected_shift_codes),0)=0 THEN 'SHIFT_EXPECTATION_MISSING' END,
   CASE WHEN target.deur_expectation_frequency='PER_SHIFT' AND (SELECT count(*) FROM rental_shift_window_snapshots w WHERE w.rental_id=target.id)<>coalesce(cardinality(target.expected_shift_codes),0) THEN 'SHIFT_WINDOW_INVALID' END,
   CASE WHEN nullif(trim(l.operational_metadata#>>'{workDescription,name}'),'') IS NULL THEN 'WORK_DESCRIPTION_MISSING' END,
   CASE WHEN cs.id IS NULL THEN 'COMMERCIAL_SNAPSHOT_MISSING' END,
   CASE WHEN cs.billing_method='Per Kilometer' AND e.maintenance_type NOT IN('Kilometers','Mileage') THEN 'METER_CONFIGURATION_INVALID' END,
   CASE WHEN l.operational_metadata?'deurExpectationSnapshot' THEN 'ALREADY_NORMALIZED' END,
   CASE WHEN EXISTS(SELECT 1 FROM deurs d WHERE d.rental_equipment_line_id=l.id) THEN 'DRAFT_DEUR_INCOMPATIBLE' END],NULL) codes) validation
  WHERE l.rental_id=target.id AND l.company_id=tenant AND l.deleted_at IS NULL AND l.status<>'Cancelled') candidates;
 SELECT coalesce(jsonb_agg(item),'[]'::jsonb) INTO incomplete FROM jsonb_array_elements(lines) item WHERE coalesce((item->>'eligible')::boolean,false)=false;
 IF jsonb_array_length(incomplete)>0 THEN reasons=array_append(reasons,'SOURCE_DATA_INCOMPLETE'); END IF;
 RETURN jsonb_build_object('eligible',cardinality(reasons)=0,'rentalId',target.id,'rentalStatus',target.status,'normalizationRequired',NOT all_snapshots,'alreadyNormalized',all_snapshots,'lineResults',lines,'incompleteLines',incomplete,'reasonCodes',to_jsonb(reasons),'downstreamEvidence',downstream,'expectedVersion',target.row_version,'currentVersion',target.row_version);
END $$;

CREATE FUNCTION command_normalize_legacy_rental_deur_expectations(command jsonb) RETURNS jsonb
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
 IF coalesce((eligibility->>'eligible')::boolean,false)=false THEN RETURN jsonb_build_object('success',false,'code',coalesce(eligibility->'reasonCodes'->>0,'SOURCE_DATA_INCOMPLETE'),'eligibility',eligibility); END IF;
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

ALTER FUNCTION erp.legacy_rental_normalization_eligibility(text) OWNER TO postgres;
ALTER FUNCTION erp.command_normalize_legacy_rental_deur_expectations(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.legacy_rental_normalization_eligibility(text),erp.command_normalize_legacy_rental_deur_expectations(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION erp.legacy_rental_normalization_eligibility(text),erp.command_normalize_legacy_rental_deur_expectations(jsonb) TO authenticated;
COMMIT;
