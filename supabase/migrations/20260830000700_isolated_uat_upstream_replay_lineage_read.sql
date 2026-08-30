BEGIN;
SET LOCAL search_path=erp,auth,extensions,pg_catalog;

CREATE OR REPLACE FUNCTION erp.inspect_isolated_uat_upstream_replay_lineage(command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=erp,auth,pg_catalog AS $$
DECLARE
  tenant text=trim(command->>'companyId'); skey text=trim(command->>'scenarioKey');
  residue erp.uat_multi_equipment_provisioning_scenarios; s jsonb;
  cid text; pid text; wid text; ids jsonb; result jsonb; blocked boolean:=false;
  c_count int; p_count int; w_count int; i int; eid text; oid text; aid text;
  rowv jsonb; action jsonb; operators jsonb:='[]'::jsonb; equipment jsonb:='[]'::jsonb; assignments jsonb:='[]'::jsonb;
  customer jsonb; project jsonb; work_description jsonb;
BEGIN
  IF tenant IS NULL OR skey<>'MULTI-EQUIPMENT-RUNTIME-CERT-2026-08-29' OR NOT EXISTS
    (SELECT 1 FROM erp.companies c WHERE c.id=tenant AND c.active AND c.environment_class IN('compatibility','test'))
  THEN RETURN jsonb_build_object('success',false,'status','INVALID_SCENARIO'); END IF;
  SELECT * INTO residue FROM erp.uat_multi_equipment_provisioning_scenarios r
   WHERE r.company_id=tenant AND r.scenario_key=skey;
  IF residue.scenario IS NULL THEN RETURN jsonb_build_object('success',false,'status','SCENARIO_NOT_FOUND'); END IF;
  s:=residue.scenario; cid:=s->>'customerId'; pid:=s->>'projectId'; wid:=s->>'workDescriptionId';

  SELECT count(*) INTO c_count FROM erp.customers c WHERE c.company_id=tenant AND (c.id=cid OR lower(c.customer_code)=lower('UAT-ME-CERT-20260829'));
  SELECT count(*) INTO p_count FROM erp.projects p WHERE p.company_id=tenant AND (p.id=pid OR lower(p.project_code)=lower('UAT-ME-CERT-20260829'));
  SELECT count(*) INTO w_count FROM erp.work_descriptions w WHERE w.id=wid OR lower(w.code)=lower('UAT-ME-RUNTIME-CERT');
  SELECT to_jsonb(c) INTO customer FROM erp.customers c WHERE c.company_id=tenant AND c.id=cid;
  SELECT to_jsonb(p) INTO project FROM erp.projects p WHERE p.company_id=tenant AND p.id=pid;
  SELECT to_jsonb(w) INTO work_description FROM erp.work_descriptions w WHERE w.id=wid;
  customer:=jsonb_build_object('id',cid,'classification',CASE WHEN customer IS NULL AND c_count=0 THEN 'ABSENT' WHEN customer IS NULL THEN 'BUSINESS_DUPLICATE' WHEN customer->>'active'='true' AND customer->>'deleted_at' IS NULL AND customer->>'customer_code'='UAT-ME-CERT-20260829' THEN 'EXACT_MATCH' ELSE 'LINEAGE_MISMATCH' END,'companyId',customer->>'company_id','customerCode',customer->>'customer_code','name',customer->>'name');
  project:=jsonb_build_object('id',pid,'classification',CASE WHEN project IS NULL AND p_count=0 THEN 'ABSENT' WHEN project IS NULL THEN 'BUSINESS_DUPLICATE' WHEN project->>'active'='true' AND project->>'deleted_at' IS NULL AND project->>'project_code'='UAT-ME-CERT-20260829' AND project->>'customer_id'=cid THEN 'EXACT_MATCH' ELSE 'LINEAGE_MISMATCH' END,'companyId',project->>'company_id','projectCode',project->>'project_code','customerId',project->>'customer_id','name',project->>'name');
  work_description:=jsonb_build_object('id',wid,'classification',CASE WHEN work_description IS NULL AND w_count=0 THEN 'ABSENT' WHEN work_description IS NULL THEN 'BUSINESS_DUPLICATE' WHEN work_description->>'active'='true' AND work_description->>'deleted_at' IS NULL AND work_description->>'code'='UAT-ME-RUNTIME-CERT' THEN 'EXACT_MATCH' ELSE 'LINEAGE_MISMATCH' END,'code',work_description->>'code','name',work_description->>'name');
  IF c_count>1 OR p_count>1 OR w_count>1 THEN blocked:=true; END IF;
  IF customer->>'classification' IN ('LINEAGE_MISMATCH','BUSINESS_DUPLICATE') OR project->>'classification' IN ('LINEAGE_MISMATCH','BUSINESS_DUPLICATE') OR work_description->>'classification' IN ('LINEAGE_MISMATCH','BUSINESS_DUPLICATE') THEN blocked:=true; END IF;
  ids:=s->'operatorIds';
  FOR i IN 0..2 LOOP oid:=ids->>i; SELECT to_jsonb(o) INTO rowv FROM erp.operators o WHERE o.id=oid; action:=jsonb_build_object('id',oid,'classification',CASE WHEN rowv IS NULL THEN 'ABSENT' WHEN rowv->>'status'='Active' AND rowv->>'deleted_at' IS NULL AND rowv->>'name'=format('Synthetic UAT Multi-Equipment Operator %s',i+1) THEN 'EXACT_MATCH' ELSE 'LINEAGE_MISMATCH' END,'name',rowv->>'name','status',rowv->>'status'); operators:=operators||jsonb_build_array(action); IF action->>'classification'='LINEAGE_MISMATCH' THEN blocked:=true; END IF; END LOOP;
  ids:=s->'equipmentIds';
  FOR i IN 0..2 LOOP eid:=ids->>i; SELECT to_jsonb(e) INTO rowv FROM erp.equipment e WHERE e.id=eid; action:=jsonb_build_object('id',eid,'classification',CASE WHEN rowv IS NULL THEN 'ABSENT' WHEN rowv->>'active'='true' AND rowv->>'deleted_at' IS NULL AND rowv->>'asset_no'=format('UAT-ME-20260829-%s',i+1) THEN 'EXACT_MATCH' ELSE 'LINEAGE_MISMATCH' END,'assetNo',rowv->>'asset_no','equipmentName',rowv->>'equipment_name','companyId',rowv->>'company_id'); equipment:=equipment||jsonb_build_array(action); IF action->>'classification'='LINEAGE_MISMATCH' THEN blocked:=true; END IF; END LOOP;
  ids:=s->'assignmentIds';
  FOR i IN 0..2 LOOP aid:=ids->>i; eid:=(s->'equipmentIds')->>i; oid:=(s->'operatorIds')->>i; SELECT to_jsonb(a) INTO rowv FROM erp.assignments a WHERE a.id=aid; action:=jsonb_build_object('id',aid,'classification',CASE WHEN rowv IS NULL THEN 'ABSENT' WHEN rowv->>'equipment_id'=eid AND rowv->>'operator_id'=oid AND rowv->>'project_id'=pid AND rowv->>'status'='Active' AND rowv->>'deleted_at' IS NULL THEN 'EXACT_MATCH' ELSE 'LINEAGE_MISMATCH' END,'equipmentId',rowv->>'equipment_id','operatorId',rowv->>'operator_id','projectId',rowv->>'project_id','status',rowv->>'status'); assignments:=assignments||jsonb_build_array(action); IF action->>'classification'='LINEAGE_MISMATCH' THEN blocked:=true; END IF; END LOOP;
  result:=jsonb_build_object('success',true,'readStatus','SUCCESS','decision',CASE WHEN blocked THEN 'BLOCKED' ELSE 'SAFE' END,'customer',customer,'project',project,'workDescription',work_description,'operators',operators,'equipment',equipment,'assignments',assignments,'alternateIdentityConflicts',jsonb_build_array(),'duplicateRisk',blocked,'blockers',CASE WHEN blocked THEN jsonb_build_array('LINEAGE_MISMATCH') ELSE jsonb_build_array() END);
  RETURN result;
EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('success',false,'readStatus','READ_FAILED','code','UAT_UPSTREAM_LINEAGE_READ_FAILED');
END $$;
ALTER FUNCTION erp.inspect_isolated_uat_upstream_replay_lineage(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.inspect_isolated_uat_upstream_replay_lineage(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION erp.inspect_isolated_uat_upstream_replay_lineage(jsonb) TO service_role;
COMMIT;
