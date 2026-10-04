BEGIN;
SET search_path=erp,auth,pg_catalog;
-- Extend the existing isolated-UAT residue read boundary. The underlying
-- notification and envelope tables intentionally revoke direct service-role
-- table access, so this SECURITY DEFINER function returns only the metadata
-- needed to reconcile one prepared grouped-review notification.
CREATE OR REPLACE FUNCTION erp.certify_isolated_uat_grouped_review_residue(command jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=erp,auth,pg_catalog AS $$
DECLARE
  target_rental_id text;
  target_deur_id text;
  source_batch_id uuid;
  notifications jsonb;
BEGIN
  IF auth.role()<>'service_role' OR jsonb_typeof(command)<>'object'
    OR EXISTS(SELECT 1 FROM jsonb_object_keys(command) k WHERE k NOT IN('rentalId','deurId'))
    OR coalesce(command->>'rentalId','')!~'^[0-9a-f-]{36}$'
    OR coalesce(command->>'deurId','')!~'^[0-9a-f-]{36}$'
  THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;

  target_rental_id=command->>'rentalId';
  target_deur_id=command->>'deurId';
  SELECT i.batch_id INTO source_batch_id
  FROM erp.customer_review_batch_items i
  JOIN erp.customer_review_batches b ON b.id=i.batch_id AND b.company_id=i.company_id
  WHERE i.company_id='TENANT-LOCAL-001' AND i.rental_id=target_rental_id
    AND (i.deur_id=target_deur_id OR i.revision_id=target_deur_id)
    AND b.superseded_at IS NULL
  ORDER BY b.created_at DESC
  LIMIT 1;
  IF source_batch_id IS NULL THEN RETURN jsonb_build_object('success',false,'code','NOT_FOUND'); END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'notificationId',n.id,
    'sourceAggregateType',n.source_aggregate_type,
    'sourceAggregateId',n.source_aggregate_id,
    'batchId',b.id,
    'batchItemId',item.id,
    'requestId',item.customer_review_request_id,
    'correctedR2Id',coalesce(item.revision_id,n.deur_revision_reference),
    'businessDeurNumber',d.deur_number,
    'workDate',coalesce(d.work_date,b.review_date),
    'rentalId',b.rental_id,
    'rentalNumber',r.rental_number,
    'recipient',n.recipient_destination,
    'notificationType',n.notification_type,
    'status',n.status,
    'envelopeType',envelope.envelope_type,
    'envelopeVersion',envelope.envelope_version,
    'activeEnvelopeCount',CASE WHEN envelope.notification_id IS NULL THEN 0 ELSE 1 END,
    'providerAttempts',greatest(n.attempt_count,(SELECT count(*) FROM erp.notification_delivery_attempts a WHERE a.company_id='TENANT-LOCAL-001' AND a.notification_id=n.id)),
    'providerAccepted',n.status='ProviderAccepted',
    'deliveryTimestamp',n.sent_at
  ) ORDER BY n.created_at),'[]'::jsonb) INTO notifications
  FROM erp.notification_outbox n
  JOIN erp.customer_review_batches b ON b.id=source_batch_id AND b.company_id=n.company_id
  LEFT JOIN LATERAL (
    SELECT i.id,i.customer_review_request_id,i.deur_id,i.revision_id
    FROM erp.customer_review_batch_items i
    WHERE i.company_id='TENANT-LOCAL-001' AND i.batch_id=source_batch_id
      AND (i.deur_id=target_deur_id OR i.revision_id=target_deur_id
        OR ((SELECT count(*) FROM erp.customer_review_batch_items one_item
             WHERE one_item.company_id='TENANT-LOCAL-001' AND one_item.batch_id=source_batch_id
               AND one_item.customer_review_request_id IS NOT NULL AND one_item.revision_id IS NOT NULL)=1
            AND i.customer_review_request_id IS NOT NULL AND i.revision_id IS NOT NULL))
    ORDER BY CASE WHEN i.deur_id=target_deur_id OR i.revision_id=target_deur_id THEN 0 ELSE 1 END,i.id
    LIMIT 1
  ) item ON true
  LEFT JOIN erp.deurs d ON d.company_id='TENANT-LOCAL-001' AND d.id=coalesce(item.revision_id,n.deur_revision_reference)
  LEFT JOIN erp.rentals r ON r.company_id='TENANT-LOCAL-001' AND r.id=b.rental_id
  LEFT JOIN LATERAL (
    SELECT e.notification_id,e.envelope_type,e.envelope_version
    FROM erp.notification_delivery_envelopes e
    WHERE e.notification_id=n.id AND e.retired_at IS NULL
    LIMIT 1
  ) envelope ON true
  WHERE n.company_id='TENANT-LOCAL-001'
    AND n.notification_type='CUSTOMER_GROUPED_REVIEW_REQUESTED'
    AND n.source_aggregate_type='CUSTOMER_REVIEW_BATCH'
    AND n.source_aggregate_id=source_batch_id::text;

  RETURN jsonb_build_object('success',true,'value',jsonb_build_object('notifications',notifications));
END $$;
ALTER FUNCTION erp.certify_isolated_uat_grouped_review_residue(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.certify_isolated_uat_grouped_review_residue(jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION erp.certify_isolated_uat_grouped_review_residue(jsonb) TO service_role;
COMMENT ON FUNCTION erp.certify_isolated_uat_grouped_review_residue(jsonb) IS
  'Isolated-UAT read-only prepared notification metadata; credential and envelope material are never returned.';
COMMIT;
