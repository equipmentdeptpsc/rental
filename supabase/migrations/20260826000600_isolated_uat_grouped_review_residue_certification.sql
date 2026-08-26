BEGIN;
SET search_path=erp,auth,pg_catalog;
CREATE FUNCTION erp.certify_isolated_uat_grouped_review_residue(command jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=erp,auth,pg_catalog AS $$
DECLARE target_rental_id text;target_deur_id text;source_batch_id uuid;items jsonb;
BEGIN
 IF auth.role()<>'service_role' OR jsonb_typeof(command)<>'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(command) k WHERE k NOT IN('rentalId','deurId'))
   OR coalesce(command->>'rentalId','')!~'^[0-9a-f-]{36}$' OR coalesce(command->>'deurId','')!~'^[0-9a-f-]{36}$'
 THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED');END IF;
 target_rental_id=command->>'rentalId';target_deur_id=command->>'deurId';
 SELECT i.batch_id INTO source_batch_id FROM erp.customer_review_batch_items i JOIN erp.customer_review_batches b ON b.id=i.batch_id AND b.company_id=i.company_id
 WHERE i.company_id='TENANT-LOCAL-001' AND i.rental_id=target_rental_id AND i.deur_id=target_deur_id AND b.superseded_at IS NULL;
 IF source_batch_id IS NULL THEN RETURN jsonb_build_object('success',false,'code','NOT_FOUND');END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',n.id,'status',n.status,'providerMessageIdPresent',n.provider_message_id IS NOT NULL,'failureCategory',n.last_failure_category) ORDER BY n.created_at),'[]'::jsonb)
 INTO items FROM erp.notification_outbox n WHERE n.company_id='TENANT-LOCAL-001' AND n.notification_type='CUSTOMER_GROUPED_REVIEW_REQUESTED'
   AND n.source_aggregate_type='CUSTOMER_REVIEW_BATCH' AND n.source_aggregate_id=source_batch_id::text;
 RETURN jsonb_build_object('success',true,'value',jsonb_build_object('notifications',items));
END $$;
ALTER FUNCTION erp.certify_isolated_uat_grouped_review_residue(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.certify_isolated_uat_grouped_review_residue(jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION erp.certify_isolated_uat_grouped_review_residue(jsonb) TO service_role;
COMMIT;
