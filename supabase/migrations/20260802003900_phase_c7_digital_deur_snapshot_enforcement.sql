BEGIN;
SET search_path TO erp, auth;

CREATE OR REPLACE FUNCTION canonical_deur_snapshot_text(value jsonb)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path=pg_catalog
AS $$
DECLARE kind text; result text;
BEGIN
  IF value IS NULL THEN RETURN 'null'; END IF;
  kind=jsonb_typeof(value);
  IF kind='array' THEN
    SELECT '['||coalesce(string_agg(canonical_deur_snapshot_text(item),',' ORDER BY ordinal),'')||']'
      INTO result FROM jsonb_array_elements(value) WITH ORDINALITY AS entries(item,ordinal);
    RETURN result;
  ELSIF kind='object' THEN
    SELECT '{'||coalesce(string_agg(to_jsonb(key)::text||':'||canonical_deur_snapshot_text(item),',' ORDER BY key),'')||'}'
      INTO result FROM jsonb_each(value) AS entries(key,item) WHERE key<>'capturedAt';
    RETURN result;
  END IF;
  RETURN value::text;
END $$;

CREATE OR REPLACE FUNCTION current_deur_expectation_fingerprint(target_line_id text)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=erp,pg_catalog
AS $$
DECLARE line rental_equipment_lines; rental rentals; terms commercial_snapshots; machine equipment; snap jsonb; body jsonb;
BEGIN
  SELECT * INTO line FROM rental_equipment_lines WHERE id=target_line_id AND deleted_at IS NULL;
  IF line.id IS NULL THEN RETURN NULL; END IF;
  snap=nullif(line.operational_metadata->'deurExpectationSnapshot','null'::jsonb);
  IF snap IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO rental FROM rentals WHERE id=line.rental_id;
  SELECT * INTO terms FROM commercial_snapshots WHERE rental_equipment_line_id=line.id AND rental_id=line.rental_id;
  SELECT * INTO machine FROM equipment WHERE id=line.equipment_id AND deleted_at IS NULL;

  body=snap-'sourceFingerprint'-'capturedAt';
  body=jsonb_set(body,'{rentalEquipmentLineId}',to_jsonb(line.id),true);
  body=jsonb_set(body,'{rentalId}',to_jsonb(line.rental_id),true);
  body=jsonb_set(body,'{equipmentId}',to_jsonb(line.equipment_id),true);
  body=jsonb_set(body,'{assignmentId}',to_jsonb(line.assignment_id),true);
  body=jsonb_set(body,'{operatorId}',to_jsonb(line.operator_id),true);
  body=jsonb_set(body,'{projectId}',to_jsonb(rental.project_id),true);
  IF rental.customer_id IS NULL THEN body=body-'customerId'; ELSE body=jsonb_set(body,'{customerId}',to_jsonb(rental.customer_id),true); END IF;
  body=jsonb_set(body,'{policy,frequency}',to_jsonb(rental.deur_expectation_frequency),true);
  body=jsonb_set(body,'{policy,effectiveFrom}',to_jsonb(rental.deur_expectation_effective_from::text),true);
  body=jsonb_set(body,'{workDate}',to_jsonb(rental.date_out::text),true);
  body=jsonb_set(body,'{billingMethod}',to_jsonb(terms.billing_method::text),true);
  body=jsonb_set(body,'{fuelEvidenceRequired}',to_jsonb(coalesce(terms.fuel_charge,0)>0),true);
  body=jsonb_set(body,'{operationalMetadata}',coalesce(line.operational_metadata-'deurExpectationSnapshot','{}'::jsonb),true);
  body=jsonb_set(body,'{meterRequirement}',to_jsonb(CASE
    WHEN terms.billing_method='Per Kilometer' THEN 'odometer'
    ELSE 'none' END),true);
  RETURN canonical_deur_snapshot_text(body);
END $$;

CREATE OR REPLACE FUNCTION rental_release_readiness(target_rental_id text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,auth AS $$
DECLARE tenant text; target rentals; incomplete jsonb='[]'::jsonb; active_count integer; stale_count integer;
BEGIN
  tenant=(SELECT company_id FROM users WHERE id=auth.uid() AND status='active');
  IF tenant IS NULL THEN RETURN jsonb_build_object('eligible',false,'reasonCodes',jsonb_build_array('UNAUTHENTICATED'),'incompleteEquipmentLines','[]'::jsonb); END IF;
  IF NOT (current_user_has_permission('rental.manage') OR current_user_has_permission('rental.release')) THEN RETURN jsonb_build_object('eligible',false,'reasonCodes',jsonb_build_array('FORBIDDEN'),'incompleteEquipmentLines','[]'::jsonb); END IF;
  SELECT * INTO target FROM rentals WHERE id=target_rental_id AND company_id=tenant;
  IF target.id IS NULL THEN RETURN jsonb_build_object('eligible',false,'reasonCodes',jsonb_build_array('NOT_FOUND'),'incompleteEquipmentLines','[]'::jsonb); END IF;
  SELECT count(*) INTO active_count FROM rental_equipment_lines WHERE rental_id=target.id AND company_id=tenant AND deleted_at IS NULL AND status<>'Cancelled';
  SELECT coalesce(jsonb_agg(problem ORDER BY problem->>'rentalEquipmentLineId'),'[]'::jsonb),count(*) FILTER (WHERE problem->>'snapshotFreshness'='false') INTO incomplete,stale_count FROM (
    SELECT jsonb_build_object('rentalEquipmentLineId',l.id,'equipmentId',l.equipment_id,
      'snapshotFreshness',snap IS NOT NULL AND snap->>'sourceFingerprint'=current_deur_expectation_fingerprint(l.id),
      'reasonCode',CASE WHEN snap IS NOT NULL AND snap->>'sourceFingerprint' IS DISTINCT FROM current_deur_expectation_fingerprint(l.id) THEN 'SNAPSHOT_STALE' END,
      'missingFields',to_jsonb(array_remove(ARRAY[
        CASE WHEN nullif(trim(l.id),'') IS NULL THEN 'rentalLineIdentity' END, CASE WHEN e.id IS NULL THEN 'equipment' END,
        CASE WHEN a.id IS NULL OR a.status<>'Active' OR a.equipment_id<>l.equipment_id OR a.operator_id<>l.operator_id OR a.project_id<>target.project_id THEN 'assignment' END,
        CASE WHEN o.id IS NULL OR o.status<>'Active' THEN 'operator' END, CASE WHEN p.id IS NULL OR NOT p.active THEN 'project' END,
        CASE WHEN target.customer_id IS NULL THEN 'customer' END, CASE WHEN target.deur_expectation_frequency IS NULL OR target.deur_expectation_effective_from IS NULL THEN 'deurPolicy' END,
        CASE WHEN target.deur_expectation_frequency='PER_SHIFT' AND coalesce(cardinality(target.expected_shift_codes),0)=0 THEN 'requiredShift' END,
        CASE WHEN target.deur_expectation_frequency='PER_SHIFT' AND coalesce(jsonb_array_length(snap->'shiftWindows'),0)<coalesce(cardinality(target.expected_shift_codes),0) THEN 'shiftWindow' END,
        CASE WHEN nullif(trim(snap#>>'{workDescription,name}'),'') IS NULL THEN 'workDescription' END,
        CASE WHEN coalesce((snap#>>'{workDescription,requiresRemarks}')::boolean,false) AND nullif(trim(snap->>'operationalRemarks'),'') IS NULL THEN 'workDescription' END,
        CASE WHEN nullif(trim(snap->>'workDate'),'') IS NULL THEN 'workDate' END,
        CASE WHEN nullif(trim(l.operational_metadata#>>'{costCode,code}'),'') IS NULL OR nullif(trim(l.operational_metadata#>>'{activityCode,code}'),'') IS NULL THEN 'operationalMetadata' END,
        CASE WHEN cs.id IS NULL THEN 'billingTerms' END, CASE WHEN snap IS NULL THEN 'snapshot' END,
        CASE WHEN snap IS NOT NULL AND snap->>'sourceFingerprint' IS DISTINCT FROM current_deur_expectation_fingerprint(l.id) THEN 'snapshotFreshness' END,
        CASE WHEN snap->>'meterRequirement' IN ('odometer','both') AND coalesce(e.maintenance_type,'') NOT IN ('Kilometers','Mileage') THEN 'meterConfiguration' WHEN snap->>'meterRequirement' IN ('hourMeter','both') AND coalesce(e.maintenance_type,'')<>'Engine Hours' THEN 'meterConfiguration' END
      ],NULL)),'invalidValues','[]'::jsonb) problem
    FROM rental_equipment_lines l LEFT JOIN equipment e ON e.id=l.equipment_id AND e.company_id=tenant AND e.deleted_at IS NULL
    LEFT JOIN assignments a ON a.id=l.assignment_id AND a.company_id=tenant LEFT JOIN operators o ON o.id=l.operator_id AND o.company_id=tenant AND o.deleted_at IS NULL
    LEFT JOIN projects p ON p.id=target.project_id AND p.company_id=tenant AND p.deleted_at IS NULL LEFT JOIN commercial_snapshots cs ON cs.rental_equipment_line_id=l.id AND cs.rental_id=target.id
    CROSS JOIN LATERAL (SELECT nullif(l.operational_metadata->'deurExpectationSnapshot','null'::jsonb) snap) source
    WHERE l.rental_id=target.id AND l.company_id=tenant AND l.deleted_at IS NULL AND l.status<>'Cancelled'
  ) candidates WHERE jsonb_array_length(problem->'missingFields')>0;
  RETURN jsonb_build_object('eligible',active_count>0 AND jsonb_array_length(incomplete)=0,'reasonCodes',CASE WHEN active_count>0 AND jsonb_array_length(incomplete)=0 THEN '[]'::jsonb WHEN stale_count>0 THEN jsonb_build_array('RELEASE_NOT_READY','SNAPSHOT_STALE') ELSE jsonb_build_array('RELEASE_NOT_READY') END,'rentalId',target.id,'incompleteEquipmentLines',incomplete);
END $$;

CREATE OR REPLACE FUNCTION command_start_deur_shift(command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,public,auth AS $$
DECLARE scope jsonb; idem jsonb; now_at timestamptz=clock_timestamp(); new_deur deurs; response jsonb; payload_hash text; line rental_equipment_lines; snap jsonb; expected_fingerprint text; selected_shift text;
BEGIN
  scope=validate_deur_command_scope(command,'deur.create'); IF scope->>'code'<>'OK' THEN RETURN jsonb_build_object('success',false,'code',scope->>'code'); END IF;
  SELECT * INTO line FROM rental_equipment_lines WHERE id=command->>'rentalLineId' FOR UPDATE;
  snap=nullif(line.operational_metadata->'deurExpectationSnapshot','null'::jsonb);
  IF snap IS NULL THEN RETURN jsonb_build_object('success',false,'code','DEUR_EXPECTATION_REQUIRED'); END IF;
  expected_fingerprint=current_deur_expectation_fingerprint(line.id);
  IF snap->>'sourceFingerprint' IS DISTINCT FROM expected_fingerprint THEN RETURN jsonb_build_object('success',false,'code','SNAPSHOT_STALE'); END IF;
  selected_shift=nullif(command->'draft'->>'shift','');
  IF snap#>>'{policy,frequency}'='PER_SHIFT' AND (selected_shift IS NULL OR NOT ((snap#>'{policy,expectedShiftCodes}') ? (CASE selected_shift WHEN 'Day' THEN 'DAY' WHEN 'Night' THEN 'NIGHT' ELSE '' END))) THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;
  idem=begin_deur_command(command,'START_SHIFT'); IF idem->>'state'='MISMATCH' THEN RETURN jsonb_build_object('success',false,'code','IDEMPOTENCY_MISMATCH'); END IF;
  IF idem->>'state'='REPLAY' THEN RETURN (idem->'response')||jsonb_build_object('disposition','REPLAYED'); END IF; payload_hash=idem->>'payloadHash';
  INSERT INTO deurs(id,deur_number,rental_id,rental_equipment_line_id,assignment_id,equipment_id,operator_id,project_id,customer_id,commercial_snapshot_id,commercial_snapshot_required,creation_source,work_date,shift,status,evidence_mode,billing_method_snapshot,opening_meter,operational_metadata,operational_remarks,created_at,created_by,updated_at,updated_by,row_version)
  SELECT command->'draft'->>'id',next_deur_number(),snap->>'rentalId',snap->>'rentalEquipmentLineId',snap->>'assignmentId',snap->>'equipmentId',snap->>'operatorId',snap->>'projectId',snap->>'customerId',cs.id,true,'OPERATOR_DIGITAL',(snap->>'workDate')::date,selected_shift,'In Progress',
    CASE snap->>'billingMethod' WHEN 'Per Kilometer' THEN 'ODOMETER_TRIP' WHEN 'Per Cubic Meter' THEN 'QUANTITY' WHEN 'One Lot' THEN 'COMPLETION' WHEN 'Per Lot' THEN 'COMPLETION' ELSE 'TIME_TIMELINE' END,
    (snap->>'billingMethod')::billing_method,CASE WHEN snap->>'meterRequirement' IN ('hourMeter','odometer','both') THEN nullif(command->'draft'->>'openingMeter','')::numeric END,
    (snap->'operationalMetadata')||jsonb_build_object('workDescription',snap->'workDescription'),coalesce(nullif(command->'draft'->>'operationalRemarks',''),snap->>'operationalRemarks'),now_at,auth.uid()::text,now_at,auth.uid()::text,1
  FROM commercial_snapshots cs WHERE cs.rental_equipment_line_id=line.id AND cs.rental_id=line.rental_id RETURNING * INTO new_deur;
  IF new_deur.id IS NULL THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;
  INSERT INTO deur_events(id,deur_id,activity_type,action,occurred_at,sequence,source,actor_id,server_accepted_at,client_created_at,command_id,idempotency_key,device_id,is_open)
  VALUES(extensions.gen_random_uuid()::text,new_deur.id,'shift','start',now_at,1,'server',auth.uid()::text,now_at,nullif(command->>'clientCreatedAt','')::timestamptz,command->>'commandId',command->>'idempotencyKey',command->>'deviceId',true),(extensions.gen_random_uuid()::text,new_deur.id,'operation','start',now_at,2,'server',auth.uid()::text,now_at,nullif(command->>'clientCreatedAt','')::timestamptz,command->>'commandId',command->>'idempotencyKey',command->>'deviceId',true);
  INSERT INTO audit_log(id,aggregate_type,aggregate_id,action,actor_id,occurred_at,correlation_id,new_values) VALUES(extensions.gen_random_uuid()::text,'DEUR',new_deur.id,'START_SHIFT',auth.uid()::text,now_at,command->>'commandId',to_jsonb(new_deur));
  response=jsonb_build_object('success',true,'disposition','ACCEPTED','record',to_jsonb(new_deur),'version',1,'serverOccurredAt',now_at);
  RETURN finish_deur_command(command,'START_SHIFT',new_deur.id,payload_hash,response);
EXCEPTION WHEN unique_violation THEN RETURN jsonb_build_object('success',false,'code','DUPLICATE_ACTIVE_DEUR');
END $$;

ALTER FUNCTION erp.canonical_deur_snapshot_text(jsonb) OWNER TO postgres;
ALTER FUNCTION erp.current_deur_expectation_fingerprint(text) OWNER TO postgres;
ALTER FUNCTION erp.rental_release_readiness(text) OWNER TO postgres;
ALTER FUNCTION erp.command_start_deur_shift(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.canonical_deur_snapshot_text(jsonb),erp.current_deur_expectation_fingerprint(text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION erp.rental_release_readiness(text),erp.command_start_deur_shift(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION erp.rental_release_readiness(text),erp.command_start_deur_shift(jsonb) TO authenticated;
COMMIT;
