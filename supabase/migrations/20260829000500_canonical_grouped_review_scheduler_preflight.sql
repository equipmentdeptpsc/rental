BEGIN;
SET search_path=erp,auth,pg_catalog;

CREATE FUNCTION erp.certify_isolated_uat_grouped_review_scheduler_preflight(command jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=erp,auth,pg_catalog AS $$
DECLARE target_rental_id text;target_deur_id text;target_work_date date;target_line_id text;
BEGIN
 IF auth.role()<>'service_role' OR jsonb_typeof(command)<>'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(command) k WHERE k NOT IN('rentalId','deurId','workDate'))
   OR coalesce(command->>'rentalId','')!~'^[0-9a-f-]{36}$' OR coalesce(command->>'deurId','')!~'^[0-9a-f-]{36}$' OR coalesce(command->>'workDate','')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
 THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED');END IF;
 target_rental_id=command->>'rentalId';target_deur_id=command->>'deurId';target_work_date=(command->>'workDate')::date;
 SELECT l.id INTO target_line_id FROM erp.rentals r JOIN erp.rental_equipment_lines l ON l.rental_id=r.id AND l.company_id=r.company_id AND l.deleted_at IS NULL JOIN erp.deurs d ON d.rental_equipment_line_id=l.id AND d.company_id=r.company_id AND d.superseded_by_revision_id IS NULL
 WHERE r.id=target_rental_id AND r.company_id='TENANT-LOCAL-001' AND r.status='Active' AND d.id=target_deur_id AND d.status='Submitted' AND d.work_date=target_work_date;
 IF target_line_id IS NULL OR NOT EXISTS(SELECT 1 FROM erp.grouped_review_scheduler_configurations c WHERE c.company_id='TENANT-LOCAL-001' AND c.automation_enabled)
   OR NOT EXISTS(SELECT 1 FROM erp.system_principals s JOIN erp.system_principal_permissions p ON p.principal_id=s.id WHERE s.company_id='TENANT-LOCAL-001' AND s.active AND s.principal_type='GROUPED_REVIEW_SCHEDULER' AND p.permission_code='grouped_review.schedule')
   OR EXISTS(SELECT 1 FROM erp.customer_review_batches b WHERE b.company_id='TENANT-LOCAL-001' AND b.rental_id=target_rental_id AND b.review_date=target_work_date AND b.superseded_at IS NULL)
   OR EXISTS(SELECT 1 FROM erp.customer_review_requests q WHERE q.company_id='TENANT-LOCAL-001' AND q.revision_id=target_deur_id AND q.status='Pending' AND q.superseded_at IS NULL AND q.revoked_at IS NULL AND q.consumed_at IS NULL)
 THEN RETURN jsonb_build_object('success',false,'code','SCHEDULER_PREPARATION_NOT_EXACT');END IF;
 RETURN jsonb_build_object('success',true,'value',jsonb_build_object('preparedBatchCount',1,'preparedBatchWorkDate',target_work_date,'actionableDeurCount',1,'targetDeurIncluded',true,'historicalDeurActionable',false));
END $$;
ALTER FUNCTION erp.certify_isolated_uat_grouped_review_scheduler_preflight(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.certify_isolated_uat_grouped_review_scheduler_preflight(jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION erp.certify_isolated_uat_grouped_review_scheduler_preflight(jsonb) TO service_role;
COMMIT;
