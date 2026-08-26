BEGIN;
SET search_path=erp,auth,pg_catalog;
CREATE FUNCTION erp.certify_isolated_uat_grouped_review_target(command jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=erp,auth,pg_catalog AS $$
DECLARE target_rental_id uuid;target_deur_id uuid;target_work_date date;
BEGIN
 IF auth.role()<>'service_role' OR jsonb_typeof(command)<>'object'
   OR EXISTS(SELECT 1 FROM jsonb_object_keys(command) k WHERE k NOT IN('rentalId','deurId','workDate','timezone'))
   OR coalesce(command->>'rentalId','')!~'^[0-9a-f-]{36}$' OR coalesce(command->>'deurId','')!~'^[0-9a-f-]{36}$'
   OR coalesce(command->>'workDate','')!~'^\d{4}-\d{2}-\d{2}$' OR command->>'timezone'<>'Asia/Manila'
 THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED');END IF;
 BEGIN target_rental_id=(command->>'rentalId')::uuid;target_deur_id=(command->>'deurId')::uuid;target_work_date=(command->>'workDate')::date;
 EXCEPTION WHEN others THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED');END;
 IF NOT EXISTS(SELECT 1 FROM erp.rentals r JOIN erp.rental_equipment_lines l ON l.rental_id=r.id AND l.company_id=r.company_id AND l.deleted_at IS NULL
   JOIN erp.deurs d ON d.rental_equipment_line_id=l.id AND d.company_id=r.company_id AND d.superseded_by_revision_id IS NULL
   WHERE r.id=target_rental_id AND d.id=target_deur_id AND r.company_id='TENANT-LOCAL-001' AND r.status='Active' AND r.timezone='Asia/Manila'
     AND d.status='Submitted' AND d.work_date=target_work_date)
 THEN RETURN jsonb_build_object('success',false,'code','TARGET_NOT_ELIGIBLE');END IF;
 RETURN jsonb_build_object('success',true,'value',jsonb_build_object('eligible',true));
END $$;
ALTER FUNCTION erp.certify_isolated_uat_grouped_review_target(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.certify_isolated_uat_grouped_review_target(jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION erp.certify_isolated_uat_grouped_review_target(jsonb) TO service_role;
COMMIT;
