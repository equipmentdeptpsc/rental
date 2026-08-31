BEGIN;
SET LOCAL search_path=erp,auth,extensions,pg_catalog;

CREATE OR REPLACE FUNCTION erp.resolve_uat_deur_offline_runtime_references(command jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path=erp,auth,extensions,pg_catalog AS $$
DECLARE
  tenant text := trim(command->>'companyId');
  skey text := trim(command->>'scenarioKey');
  profile text := trim(command->>'profileVersion');
  cost_row erp.cost_codes;
  activity_row erp.activity_codes;
  work_row erp.work_descriptions;
  status jsonb;
BEGIN
  IF tenant <> 'TENANT-LOCAL-001'
     OR skey <> 'DEUR-OFFLINE-RUNTIME-CERT-2026-08-31'
     OR profile <> 'UAT_DEUR_OFFLINE_RUNTIME_V1'
     OR NOT EXISTS (
       SELECT 1 FROM erp.companies c
       WHERE c.id=tenant AND c.active AND c.environment_class IN ('compatibility','test')
     )
  THEN
    RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED');
  END IF;

  -- This is intentionally the same deterministic active-UAT selection policy
  -- used by the certified turnover provisioner.
  SELECT * INTO cost_row FROM erp.cost_codes c
    WHERE c.active AND c.deleted_at IS NULL
    ORDER BY (c.code LIKE 'UAT%') DESC,c.sort_order,c.code,c.id LIMIT 1;
  SELECT * INTO activity_row FROM erp.activity_codes a
    WHERE a.active AND a.deleted_at IS NULL
    ORDER BY (a.code LIKE 'UAT%') DESC,a.sort_order,a.code,a.id LIMIT 1;
  SELECT * INTO work_row FROM erp.work_descriptions w
    WHERE w.active AND w.deleted_at IS NULL
    ORDER BY (w.code LIKE 'UAT%') DESC,w.sort_order,w.code,w.id LIMIT 1;

  status := jsonb_build_object(
    'costCode', jsonb_strip_nulls(jsonb_build_object('found',cost_row.id IS NOT NULL,'active',coalesce(cost_row.active,false),'code',cost_row.code,'resolvedId',cost_row.id)),
    'activityCode', jsonb_strip_nulls(jsonb_build_object('found',activity_row.id IS NOT NULL,'active',coalesce(activity_row.active,false),'code',activity_row.code,'resolvedId',activity_row.id)),
    'workDescription', jsonb_strip_nulls(jsonb_build_object('found',work_row.id IS NOT NULL,'active',coalesce(work_row.active,false),'code',work_row.code,'resolvedId',work_row.id))
  );

  RETURN jsonb_build_object(
    'success',cost_row.id IS NOT NULL AND activity_row.id IS NOT NULL AND work_row.id IS NOT NULL,
    'code',CASE WHEN cost_row.id IS NULL THEN 'COST_CODE_NOT_FOUND' WHEN activity_row.id IS NULL THEN 'ACTIVITY_CODE_NOT_FOUND' WHEN work_row.id IS NULL THEN 'WORK_DESCRIPTION_NOT_FOUND' ELSE 'OK' END,
    'costCodeId',cost_row.id,
    'activityCodeId',activity_row.id,
    'workDescriptionId',work_row.id,
    'referenceStatus',status,
    'referencesReady',cost_row.id IS NOT NULL AND activity_row.id IS NOT NULL AND work_row.id IS NOT NULL,
    'failedReferences',to_jsonb(array_remove(ARRAY[
      CASE WHEN cost_row.id IS NULL THEN 'costCode' END,
      CASE WHEN activity_row.id IS NULL THEN 'activityCode' END,
      CASE WHEN work_row.id IS NULL THEN 'workDescription' END
    ],NULL))
  );
END $$;

ALTER FUNCTION erp.resolve_uat_deur_offline_runtime_references(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.resolve_uat_deur_offline_runtime_references(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION erp.resolve_uat_deur_offline_runtime_references(jsonb) TO service_role;
COMMIT;
