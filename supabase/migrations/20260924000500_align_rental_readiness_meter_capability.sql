-- RECONSTRUCTED BASELINE — NOT ORIGINAL HISTORICAL SOURCE.
-- The original 20260924000500 source was lost and is not recoverable from local history.
-- Reconstructed 2026-09-25 from deployed isolated-UAT schema jtkctarqbwmqdcewthkn.
-- The Supabase remote ledger already records 20260924000500: never reapply this baseline
-- to that existing UAT database. This file restores repository provenance and supports
-- reproducible fresh environments that have applied the 202609240004 baseline.

BEGIN;

CREATE OR REPLACE FUNCTION erp.rental_release_readiness(target_rental_id text) RETURNS jsonb
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
        CASE WHEN NOT erp.equipment_supports_meter_requirement(erp.effective_equipment_meter_capability(e.meter_capability,e.maintenance_type),coalesce(snap->>'meterRequirement','none')) THEN 'meterConfiguration' END
      ],NULL)),'invalidValues','[]'::jsonb) problem
    FROM rental_equipment_lines l LEFT JOIN equipment e ON e.id=l.equipment_id AND e.company_id=tenant AND e.deleted_at IS NULL
    LEFT JOIN assignments a ON a.id=l.assignment_id AND a.company_id=tenant LEFT JOIN operators o ON o.id=l.operator_id AND o.company_id=tenant AND o.deleted_at IS NULL
    LEFT JOIN projects p ON p.id=target.project_id AND p.company_id=tenant AND p.deleted_at IS NULL LEFT JOIN commercial_snapshots cs ON cs.rental_equipment_line_id=l.id AND cs.rental_id=target.id
    CROSS JOIN LATERAL (SELECT nullif(l.operational_metadata->'deurExpectationSnapshot','null'::jsonb) snap) source
    WHERE l.rental_id=target.id AND l.company_id=tenant AND l.deleted_at IS NULL AND l.status<>'Cancelled'
  ) candidates WHERE jsonb_array_length(problem->'missingFields')>0;
  RETURN jsonb_build_object('eligible',active_count>0 AND jsonb_array_length(incomplete)=0,'reasonCodes',CASE WHEN active_count>0 AND jsonb_array_length(incomplete)=0 THEN '[]'::jsonb WHEN stale_count>0 THEN jsonb_build_array('RELEASE_NOT_READY','SNAPSHOT_STALE') ELSE jsonb_build_array('RELEASE_NOT_READY') END,'rentalId',target.id,'incompleteEquipmentLines',incomplete);
END $$;

ALTER FUNCTION erp.rental_release_readiness(text) OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.rental_release_readiness(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION erp.rental_release_readiness(text) TO authenticated;

COMMIT;
