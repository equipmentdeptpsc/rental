BEGIN;
SET LOCAL search_path=erp,auth,extensions,pg_catalog;

CREATE OR REPLACE FUNCTION erp.recover_isolated_uat_legacy_provisioning(command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,auth,extensions,pg_catalog AS $$
DECLARE
  tenant text=trim(command->>'companyId'); actor uuid=nullif(command->>'actorId','')::uuid;
  scenario_key_value text=trim(command->>'scenarioKey'); profile text=trim(command->>'profileVersion');
  residue erp.uat_multi_equipment_provisioning_scenarios; lineage jsonb; attempts integer;
  rental_ids text[]; line_ids text[]; equipment_ids text[]; assignment_ids text[];
  rentals integer; lines integer; equipment integer; assignments integer; deurs integer;
  refs jsonb; audit_exists boolean;
BEGIN
  IF auth.role()<>'service_role' OR jsonb_typeof(command)<>'object'
    OR EXISTS(SELECT 1 FROM jsonb_object_keys(command) k WHERE k NOT IN('companyId','actorId','scenarioKey','profileVersion'))
    OR tenant<>'TENANT-LOCAL-001' OR scenario_key_value<>'MULTI-EQUIPMENT-RUNTIME-CERT-2026-08-29'
    OR profile<>'UAT_MULTI_EQUIPMENT_PER_WORKDAY_V1' OR actor IS NULL
    OR NOT EXISTS(SELECT 1 FROM erp.companies c WHERE c.id=tenant AND c.active AND c.environment_class='compatibility')
    OR NOT EXISTS(SELECT 1 FROM erp.users u WHERE u.id=actor AND u.company_id=tenant AND u.status='active')
  THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;
  IF NOT pg_try_advisory_xact_lock(hashtextextended(tenant||':uat-multi-equipment:'||scenario_key_value,0))
  THEN RETURN jsonb_build_object('success',false,'code','RECOVERY_LOCKED'); END IF;
  SELECT * INTO residue FROM erp.uat_multi_equipment_provisioning_scenarios
    WHERE company_id=tenant AND scenario_key=scenario_key_value FOR UPDATE;
  IF residue.scenario_key IS NULL THEN RETURN jsonb_build_object('success',false,'code','RESIDUE_NOT_FOUND'); END IF;
  IF residue.profile_version<>profile THEN RETURN jsonb_build_object('success',false,'code','SCENARIO_PROFILE_MISMATCH'); END IF;
  IF residue.state='FAILED' THEN RETURN jsonb_build_object('success',true,'disposition','ALREADY_RECOVERED','state','FAILED'); END IF;
  IF residue.state<>'PROVISIONING' THEN RETURN jsonb_build_object('success',false,'code','RESIDUE_STATE_NOT_RECOVERABLE'); END IF;

  rental_ids:=ARRAY(SELECT value FROM jsonb_array_elements_text(jsonb_build_array(residue.scenario->>'rentalAId',residue.scenario->>'rentalBId')) value WHERE value<>'');
  line_ids:=ARRAY(SELECT value FROM jsonb_array_elements_text(coalesce(residue.scenario->'rentalALineIds','[]'::jsonb)||jsonb_build_array(residue.scenario->>'rentalBLineId')) value WHERE value<>'');
  equipment_ids:=ARRAY(SELECT value FROM jsonb_array_elements_text(coalesce(residue.scenario->'equipmentIds','[]'::jsonb)) value WHERE value<>'');
  assignment_ids:=ARRAY(SELECT value FROM jsonb_array_elements_text(coalesce(residue.scenario->'assignmentIds','[]'::jsonb)) value WHERE value<>'');
  IF cardinality(rental_ids)<>2 OR cardinality(ARRAY(SELECT DISTINCT unnest(rental_ids)))<>2
    OR cardinality(line_ids)<>3 OR cardinality(ARRAY(SELECT DISTINCT unnest(line_ids)))<>3
    OR cardinality(equipment_ids)<>3 OR cardinality(ARRAY(SELECT DISTINCT unnest(equipment_ids)))<>3
    OR cardinality(assignment_ids)<>3 OR cardinality(ARRAY(SELECT DISTINCT unnest(assignment_ids)))<>3
  THEN RETURN jsonb_build_object('success',false,'code','IMMUTABLE_IDENTITY_INVALID'); END IF;
  refs:=residue.scenario;
  IF coalesce(refs->>'costCodeId','')<>'' OR coalesce(refs->>'activityCodeId','')<>''
  THEN RETURN jsonb_build_object('success',false,'code','REFERENCES_ALREADY_RESOLVED'); END IF;
  SELECT count(*) INTO attempts FROM erp.uat_multi_equipment_execution_attempts a WHERE a.company_id=tenant AND a.scenario_key=scenario_key_value;
  IF attempts<>0 OR EXISTS(SELECT 1 FROM erp.uat_multi_equipment_execution_attempts a WHERE a.company_id=tenant AND a.scenario_key=scenario_key_value AND a.status='RUNNING' AND a.lease_expires_at>clock_timestamp())
  THEN RETURN jsonb_build_object('success',false,'code','EXECUTION_ALREADY_ATTEMPTED'); END IF;
  SELECT count(*) INTO rentals FROM erp.rentals WHERE company_id=tenant AND id=ANY(rental_ids);
  SELECT count(*) INTO lines FROM erp.rental_equipment_lines WHERE company_id=tenant AND id=ANY(line_ids);
  SELECT count(*) INTO equipment FROM erp.equipment WHERE company_id=tenant AND id=ANY(equipment_ids);
  SELECT count(*) INTO assignments FROM erp.assignments WHERE company_id=tenant AND id=ANY(assignment_ids);
  SELECT count(*) INTO deurs FROM erp.deurs WHERE company_id=tenant AND rental_id=ANY(rental_ids);
  IF rentals<>0 OR lines<>0 OR equipment<>0 OR assignments<>0 OR deurs<>0
  THEN RETURN jsonb_build_object('success',false,'code','CORE_ARTIFACT_EXISTS'); END IF;
  lineage:=erp.inspect_isolated_uat_scenario_lineage(tenant,scenario_key_value);
  IF coalesce((lineage->>'success')::boolean,false) IS NOT TRUE OR lineage->>'status'<>'SAFE'
     OR coalesce((lineage->'review'->>'batchCount')::integer,-1)<>0
     OR coalesce((lineage->'review'->>'membershipCount')::integer,-1)<>0
     OR coalesce((lineage->'review'->>'requestCount')::integer,-1)<>0
     OR coalesce((lineage->'review'->>'outcomeCount')::integer,-1)<>0
     OR coalesce((lineage->'notification'->>'notificationCount')::integer,-1)<>0
     OR coalesce((lineage->'notification'->>'deliveryAttemptCount')::integer,-1)<>0
     OR coalesce((lineage->'billing'->>'statementCount')::integer,-1)<>0
     OR coalesce((lineage->'billing'->>'statementLineCount')::integer,-1)<>0
     OR coalesce((lineage->'billing'->>'invoiceCount')::integer,-1)<>0
     OR coalesce((lineage->'return'->>'transitionCount')::integer,-1)<>0
  THEN RETURN jsonb_build_object('success',false,'code','DOWNSTREAM_LINEAGE_NOT_SAFE'); END IF;
  SELECT EXISTS(SELECT 1 FROM erp.audit_log WHERE company_id=tenant AND aggregate_type='UatSyntheticScenario' AND aggregate_id=scenario_key_value AND action='UAT_LEGACY_PROVISIONING_RECOVERED') INTO audit_exists;
  UPDATE erp.uat_multi_equipment_provisioning_scenarios SET state='FAILED',updated_at=clock_timestamp() WHERE company_id=tenant AND scenario_key=scenario_key_value AND state='PROVISIONING';
  IF NOT audit_exists THEN
    INSERT INTO erp.audit_log(id,company_id,aggregate_type,aggregate_id,action,actor_id,occurred_at,new_values,metadata)
    VALUES(extensions.gen_random_uuid()::text,tenant,'UatSyntheticScenario',scenario_key_value,'UAT_LEGACY_PROVISIONING_RECOVERED',actor::text,clock_timestamp(),jsonb_build_object('previousState','PROVISIONING','newState','FAILED'),jsonb_build_object('reason','stale legacy residue after zero-core-artifact and zero-downstream-lineage guard'));
  END IF;
  RETURN jsonb_build_object('success',true,'disposition','RECOVERED','state','FAILED','scenarioKey',scenario_key_value);
END $$;

ALTER FUNCTION erp.recover_isolated_uat_legacy_provisioning(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.recover_isolated_uat_legacy_provisioning(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION erp.recover_isolated_uat_legacy_provisioning(jsonb) TO service_role;
COMMIT;


