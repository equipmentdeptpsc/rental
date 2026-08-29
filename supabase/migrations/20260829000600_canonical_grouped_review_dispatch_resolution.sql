BEGIN;
SET search_path=erp,auth,pg_catalog;

CREATE FUNCTION erp.resolve_isolated_uat_grouped_review_dispatch(command jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=erp,auth,pg_catalog AS $$
DECLARE target jsonb; deur_id text; rental_id text; batch_ids uuid[]; review_ids uuid[]; notification_ids uuid[];
 review_status text; notification_status text; attempt_count integer; delivery_attempt_count integer;
 provider text; due boolean; locked boolean; active_envelope_count integer; acknowledgement_count integer;
 review_consumed boolean; eligible boolean; reason text; notification_id uuid; batch_id uuid;
BEGIN
 IF auth.role()<>'service_role' OR jsonb_typeof(command)<>'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(command) k WHERE k NOT IN('rentalId','deurNumber','workDate'))
 THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;
 target:=erp.resolve_isolated_uat_grouped_review_target(command);
 IF coalesce((target->>'success')::boolean,false) IS NOT TRUE THEN RETURN jsonb_build_object('success',false,'code','TARGET_NOT_FOUND'); END IF;
 rental_id:=command->>'rentalId'; deur_id:=target#>>'{value,deurId}';
 SELECT array_agg(i.batch_id),array_agg(i.customer_review_request_id) INTO batch_ids,review_ids FROM erp.customer_review_batch_items i JOIN erp.customer_review_batches b ON b.id=i.batch_id AND b.company_id=i.company_id AND b.superseded_at IS NULL WHERE i.company_id='TENANT-LOCAL-001' AND i.rental_id=rental_id AND i.deur_id=deur_id AND i.customer_review_request_id IS NOT NULL;
 IF cardinality(batch_ids)=0 THEN RETURN jsonb_build_object('success',false,'code','BATCH_ITEM_NOT_FOUND'); END IF;
 IF cardinality(batch_ids)<>1 THEN RETURN jsonb_build_object('success',false,'code','BATCH_ITEM_AMBIGUOUS'); END IF;
 batch_id:=batch_ids[1];
 IF cardinality(review_ids)=0 THEN RETURN jsonb_build_object('success',false,'code','REVIEW_NOT_FOUND'); END IF;
 IF cardinality(review_ids)<>1 THEN RETURN jsonb_build_object('success',false,'code','REVIEW_AMBIGUOUS'); END IF;
 SELECT array_agg(n.id) INTO notification_ids FROM erp.notification_outbox n WHERE n.company_id='TENANT-LOCAL-001' AND n.notification_type='CUSTOMER_GROUPED_REVIEW_REQUESTED' AND n.source_aggregate_type='CUSTOMER_REVIEW_BATCH' AND n.source_aggregate_id=batch_id::text;
 IF cardinality(notification_ids)=0 THEN RETURN jsonb_build_object('success',false,'code','NOTIFICATION_NOT_FOUND'); END IF;
 IF cardinality(notification_ids)<>1 THEN RETURN jsonb_build_object('success',false,'code','NOTIFICATION_AMBIGUOUS'); END IF;
 notification_id:=notification_ids[1];
 SELECT r.status,(r.status<>'Pending') INTO review_status,review_consumed FROM erp.customer_review_requests r WHERE r.id=review_ids[1] AND r.company_id='TENANT-LOCAL-001';
 SELECT n.status,n.attempt_count,n.provider_name,(n.available_at<=clock_timestamp()),(n.lease_expires_at IS NOT NULL AND n.lease_expires_at>clock_timestamp())
 INTO notification_status,attempt_count,provider,due,locked FROM erp.notification_outbox n WHERE n.id=notification_id;
 SELECT count(*) INTO delivery_attempt_count FROM erp.notification_delivery_attempts a WHERE a.notification_id=notification_id;
 SELECT count(*) INTO active_envelope_count FROM erp.notification_delivery_envelopes e WHERE e.notification_id=notification_id AND e.retired_at IS NULL;
 acknowledgement_count:=CASE WHEN review_status='Acknowledged' THEN 1 ELSE 0 END;
 reason:=CASE WHEN acknowledgement_count>0 THEN 'ALREADY_ACKNOWLEDGED' WHEN review_consumed THEN 'REVIEW_CONSUMED' WHEN delivery_attempt_count>0 THEN 'DELIVERY_ATTEMPT_ALREADY_EXISTS' WHEN provider IS NOT NULL THEN 'NOTIFICATION_ALREADY_ASSIGNED' WHEN notification_status<>'Pending' THEN 'NOTIFICATION_NOT_PENDING' WHEN attempt_count>0 THEN 'NOTIFICATION_ALREADY_ATTEMPTED' WHEN NOT due THEN 'NOTIFICATION_NOT_DUE' WHEN locked THEN 'NOTIFICATION_LOCKED' WHEN active_envelope_count<>1 THEN 'DELIVERY_ENVELOPE_NOT_EXACT' ELSE NULL END;
 eligible:=reason IS NULL;
 RETURN jsonb_build_object('success',true,'value',jsonb_build_object('rentalId',rental_id,'deurId',deur_id,'deurNumber',command->>'deurNumber','workDate',command->>'workDate','batchId',batch_id,'reviewRequestId',review_ids[1],'reviewStatus',review_status,'reviewConsumed',review_consumed,'acknowledgementCount',acknowledgement_count,'notificationId',notification_id,'sourceAggregateType','CUSTOMER_REVIEW_BATCH','sourceAggregateId',batch_id::text,'notificationStatus',notification_status,'attemptCount',attempt_count,'deliveryAttemptCount',delivery_attempt_count,'provider',provider,'due',due,'locked',locked,'activeEnvelopeCount',active_envelope_count,'eligibleForDispatch',eligible,'failClosedReason',reason));
END $$;
ALTER FUNCTION erp.resolve_isolated_uat_grouped_review_dispatch(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.resolve_isolated_uat_grouped_review_dispatch(jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION erp.resolve_isolated_uat_grouped_review_dispatch(jsonb) TO service_role;
COMMIT;
