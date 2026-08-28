BEGIN;
SET search_path=erp,auth,pg_catalog;

CREATE FUNCTION erp.resolve_isolated_uat_grouped_review_target(command jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=erp,auth,pg_catalog AS $$
DECLARE target_rental_id text;target_deur_number text;target_work_date date;resolved_ids text[];
BEGIN
 IF auth.role()<>'service_role' OR jsonb_typeof(command)<>'object'
   OR EXISTS(SELECT 1 FROM jsonb_object_keys(command) k WHERE k NOT IN('rentalId','deurNumber','workDate'))
   OR coalesce(command->>'rentalId','')!~'^[0-9a-f-]{36}$' OR coalesce(command->>'deurNumber','')!~'^DEUR-[0-9]{4}-[0-9]{6}$'
   OR coalesce(command->>'workDate','')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
 THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED');END IF;
 BEGIN target_rental_id=command->>'rentalId';target_deur_number=command->>'deurNumber';target_work_date=(command->>'workDate')::date;
 EXCEPTION WHEN others THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED');END;
 SELECT array_agg(candidate.id) INTO resolved_ids FROM (
   SELECT d.id FROM erp.rentals r JOIN erp.rental_equipment_lines l ON l.rental_id=r.id AND l.company_id=r.company_id AND l.deleted_at IS NULL
   JOIN erp.deurs d ON d.rental_equipment_line_id=l.id AND d.company_id=r.company_id AND d.superseded_by_revision_id IS NULL
   WHERE r.id=target_rental_id AND r.company_id='TENANT-LOCAL-001' AND d.deur_number=target_deur_number AND d.work_date=target_work_date
   ORDER BY d.id LIMIT 2
 ) candidate;
 IF coalesce(cardinality(resolved_ids),0)<>1 THEN RETURN jsonb_build_object('success',false,'code','TARGET_NOT_ELIGIBLE');END IF;
 RETURN jsonb_build_object('success',true,'value',jsonb_build_object('deurId',resolved_ids[1]));
END $$;

ALTER FUNCTION erp.resolve_isolated_uat_grouped_review_target(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.resolve_isolated_uat_grouped_review_target(jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION erp.resolve_isolated_uat_grouped_review_target(jsonb) TO service_role;
COMMIT;
