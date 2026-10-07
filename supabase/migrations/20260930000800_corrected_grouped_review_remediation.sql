BEGIN;
SET search_path=erp,auth,pg_catalog;

-- Initial review remains physically work-date grouped.  A submitted correction is
-- deliberately eligible on its local resubmission date only, so historical work
-- does not leak into every daily run.
DO $$
DECLARE definition text; candidate_predicate text;
BEGIN
  SELECT pg_get_functiondef('erp.command_generate_customer_review_batch(jsonb)'::regprocedure) INTO definition;
  candidate_predicate:='WHERE company_id=tenant AND rental_equipment_line_id=line_record.id AND superseded_by_revision_id IS NULL AND work_date=requested_date;';
  IF (length(definition)-length(replace(definition,candidate_predicate,'')))/length(candidate_predicate)<>2 THEN
    RAISE EXCEPTION 'corrected grouped-review candidate predicate did not match the authoritative definition' USING ERRCODE='55000';
  END IF;
  definition:=replace(definition,candidate_predicate,
    'WHERE company_id=tenant AND rental_equipment_line_id=line_record.id AND superseded_by_revision_id IS NULL AND (work_date=requested_date OR (previous_revision_id IS NOT NULL AND submitted_at IS NOT NULL AND (submitted_at AT TIME ZONE rental_record.timezone)::date=requested_date));');
  IF position('NO_ACTIONABLE_REVIEWS' IN definition)>0 THEN
    RAISE EXCEPTION 'corrected grouped-review no-actionable disposition already exists' USING ERRCODE='55000';
  END IF;
  definition:=replace(definition,
    'RETURN CASE WHEN supplied_hash IS NULL THEN safe_response||jsonb_build_object(''value'',(safe_response->''value'')||jsonb_build_object(''credential'',raw_credential)) ELSE safe_response END;',
    'IF actionable_count=0 THEN safe_response:=jsonb_set(safe_response,''{disposition}'',to_jsonb(''NO_ACTIONABLE_REVIEWS''::text),true); END IF; RETURN CASE WHEN supplied_hash IS NULL THEN safe_response||jsonb_build_object(''value'',(safe_response->''value'')||jsonb_build_object(''credential'',raw_credential)) ELSE safe_response END;');
  IF definition NOT LIKE '%previous_revision_id IS NOT NULL AND submitted_at IS NOT NULL%'
    OR definition NOT LIKE '%NO_ACTIONABLE_REVIEWS%'
  THEN RAISE EXCEPTION 'corrected grouped-review remediation did not match the authoritative definition' USING ERRCODE='55000'; END IF;
  EXECUTE definition;
END $$;

-- Exact DEUR identity takes precedence.  Work-date matching remains mandatory
-- only for the legacy DEUR-number fallback.
CREATE OR REPLACE FUNCTION erp.resolve_isolated_uat_grouped_review_target(command jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=erp,auth,pg_catalog AS $$
DECLARE target_rental_id text; target_deur_id text; target_deur_number text; target_work_date date; resolved_ids text[];
BEGIN
 IF auth.role()<>'service_role' OR jsonb_typeof(command)<>'object'
   OR EXISTS(SELECT 1 FROM jsonb_object_keys(command) k WHERE k NOT IN('rentalId','deurId','deurNumber','workDate'))
   OR coalesce(command->>'rentalId','')!~'^[0-9a-f-]{36}$'
   OR coalesce(command->>'workDate','')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
   OR (coalesce(command->>'deurId','')='' AND coalesce(command->>'deurNumber','')!~'^DEUR-[0-9]{4}-[0-9]{6}$')
   OR (coalesce(command->>'deurId','')<>'' AND command->>'deurId'!~'^[0-9a-f-]{36}$')
 THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;
 BEGIN target_rental_id=command->>'rentalId'; target_deur_id=nullif(command->>'deurId',''); target_deur_number=nullif(command->>'deurNumber',''); target_work_date=(command->>'workDate')::date;
 EXCEPTION WHEN others THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END;
 SELECT array_agg(candidate.id) INTO resolved_ids FROM (
   SELECT d.id FROM erp.rentals r JOIN erp.rental_equipment_lines l ON l.rental_id=r.id AND l.company_id=r.company_id AND l.deleted_at IS NULL
   JOIN erp.deurs d ON d.rental_equipment_line_id=l.id AND d.company_id=r.company_id AND d.superseded_by_revision_id IS NULL
   WHERE r.id=target_rental_id AND r.company_id='TENANT-LOCAL-001'
     AND ((target_deur_id IS NOT NULL AND d.id=target_deur_id)
       OR (target_deur_id IS NULL AND d.deur_number=target_deur_number AND d.work_date=target_work_date))
   ORDER BY d.id LIMIT 2
 ) candidate;
 IF coalesce(cardinality(resolved_ids),0)<>1 THEN RETURN jsonb_build_object('success',false,'code','TARGET_NOT_ELIGIBLE'); END IF;
 RETURN jsonb_build_object('success',true,'value',jsonb_build_object('deurId',resolved_ids[1],'resolutionMode',CASE WHEN target_deur_id IS NOT NULL THEN 'DEUR_ID' ELSE 'DEUR_NUMBER' END));
END $$;

CREATE OR REPLACE FUNCTION erp.resolve_isolated_uat_grouped_review_dispatch(command jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=erp,auth,pg_catalog AS $$
DECLARE target jsonb; resolved_deur_id text; resolved_rental_id text; batch_ids uuid[]; review_ids uuid[]; notification_ids uuid[];
 review_status text; notification_status text; attempt_count integer; delivery_attempt_count integer;
 provider text; due boolean; locked boolean; active_envelope_count integer; acknowledgement_count integer;
 review_consumed boolean; eligible boolean; reason text; resolved_notification_id uuid; batch_id uuid;
BEGIN
 IF auth.role()<>'service_role' OR jsonb_typeof(command)<>'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(command) k WHERE k NOT IN('rentalId','deurId','deurNumber','workDate'))
 THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;
 target:=erp.resolve_isolated_uat_grouped_review_target(command);
 IF coalesce((target->>'success')::boolean,false) IS NOT TRUE THEN RETURN jsonb_build_object('success',false,'code','TARGET_NOT_FOUND'); END IF;
 resolved_rental_id:=command->>'rentalId'; resolved_deur_id:=target#>>'{value,deurId}';
 SELECT array_agg(i.batch_id),array_agg(i.customer_review_request_id) INTO batch_ids,review_ids FROM erp.customer_review_batch_items i JOIN erp.customer_review_batches b ON b.id=i.batch_id AND b.company_id=i.company_id AND b.superseded_at IS NULL WHERE i.company_id='TENANT-LOCAL-001' AND i.rental_id=resolved_rental_id AND i.deur_id=resolved_deur_id AND i.customer_review_request_id IS NOT NULL;
 IF cardinality(batch_ids)=0 THEN RETURN jsonb_build_object('success',false,'code','BATCH_ITEM_NOT_FOUND'); END IF;
 IF cardinality(batch_ids)<>1 THEN RETURN jsonb_build_object('success',false,'code','BATCH_ITEM_AMBIGUOUS'); END IF;
 batch_id:=batch_ids[1];
 IF cardinality(review_ids)=0 THEN RETURN jsonb_build_object('success',false,'code','REVIEW_NOT_FOUND'); END IF;
 IF cardinality(review_ids)<>1 THEN RETURN jsonb_build_object('success',false,'code','REVIEW_AMBIGUOUS'); END IF;
 SELECT array_agg(n.id) INTO notification_ids FROM erp.notification_outbox n WHERE n.company_id='TENANT-LOCAL-001' AND n.notification_type='CUSTOMER_GROUPED_REVIEW_REQUESTED' AND n.source_aggregate_type='CUSTOMER_REVIEW_BATCH' AND n.source_aggregate_id=batch_id::text;
 IF cardinality(notification_ids)=0 THEN RETURN jsonb_build_object('success',false,'code','NOTIFICATION_NOT_FOUND'); END IF;
 IF cardinality(notification_ids)<>1 THEN RETURN jsonb_build_object('success',false,'code','NOTIFICATION_AMBIGUOUS'); END IF;
 resolved_notification_id:=notification_ids[1];
 SELECT r.status,(r.status<>'Pending') INTO review_status,review_consumed FROM erp.customer_review_requests r WHERE r.id=review_ids[1] AND r.company_id='TENANT-LOCAL-001';
 SELECT n.status,n.attempt_count,n.provider_name,(n.available_at<=clock_timestamp()),(n.lease_expires_at IS NOT NULL AND n.lease_expires_at>clock_timestamp()) INTO notification_status,attempt_count,provider,due,locked FROM erp.notification_outbox n WHERE n.id=resolved_notification_id;
 SELECT count(*) INTO delivery_attempt_count FROM erp.notification_delivery_attempts a WHERE a.notification_id=resolved_notification_id;
 SELECT count(*) INTO active_envelope_count FROM erp.notification_delivery_envelopes e WHERE e.notification_id=resolved_notification_id AND e.retired_at IS NULL;
 acknowledgement_count:=CASE WHEN review_status='Acknowledged' THEN 1 ELSE 0 END;
 reason:=CASE WHEN acknowledgement_count>0 THEN 'ALREADY_ACKNOWLEDGED' WHEN review_consumed THEN 'REVIEW_CONSUMED' WHEN delivery_attempt_count>0 THEN 'DELIVERY_ATTEMPT_ALREADY_EXISTS' WHEN provider IS NOT NULL THEN 'NOTIFICATION_ALREADY_ASSIGNED' WHEN notification_status<>'Pending' THEN 'NOTIFICATION_NOT_PENDING' WHEN attempt_count>0 THEN 'NOTIFICATION_ALREADY_ATTEMPTED' WHEN NOT due THEN 'NOTIFICATION_NOT_DUE' WHEN locked THEN 'NOTIFICATION_LOCKED' WHEN active_envelope_count<>1 THEN 'DELIVERY_ENVELOPE_NOT_EXACT' ELSE NULL END;
 eligible:=reason IS NULL;
 RETURN jsonb_build_object('success',true,'value',jsonb_build_object('rentalId',resolved_rental_id,'deurId',resolved_deur_id,'deurNumber',command->>'deurNumber','workDate',command->>'workDate','batchId',batch_id,'reviewRequestId',review_ids[1],'reviewStatus',review_status,'reviewConsumed',review_consumed,'acknowledgementCount',acknowledgement_count,'notificationId',resolved_notification_id,'sourceAggregateType','CUSTOMER_REVIEW_BATCH','sourceAggregateId',batch_id::text,'notificationStatus',notification_status,'attemptCount',attempt_count,'deliveryAttemptCount',delivery_attempt_count,'provider',provider,'due',due,'locked',locked,'activeEnvelopeCount',active_envelope_count,'eligibleForDispatch',eligible,'failClosedReason',reason));
END $$;

ALTER FUNCTION erp.command_generate_customer_review_batch(jsonb) OWNER TO postgres;
ALTER FUNCTION erp.resolve_isolated_uat_grouped_review_target(jsonb) OWNER TO postgres;
ALTER FUNCTION erp.resolve_isolated_uat_grouped_review_dispatch(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.resolve_isolated_uat_grouped_review_target(jsonb),erp.resolve_isolated_uat_grouped_review_dispatch(jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION erp.resolve_isolated_uat_grouped_review_target(jsonb),erp.resolve_isolated_uat_grouped_review_dispatch(jsonb) TO service_role;
COMMIT;
