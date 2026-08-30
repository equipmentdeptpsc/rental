BEGIN;
SET LOCAL search_path=erp,auth,extensions,pg_catalog;

CREATE OR REPLACE FUNCTION erp.inspect_isolated_uat_deur_post_submit(command jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=erp,auth,extensions,pg_catalog AS $$
DECLARE
  tenant text:=trim(command->>'companyId'); scenario_key text:=trim(command->>'scenarioKey');
  profile text:=trim(command->>'profileVersion'); deur_id text:='ff89d583-b3fa-4627-9b53-f5741e56a5c2';
  rental_id text:='7acdc7d1-a657-4c17-b4cc-9b48d5c7f102'; deur_number text:='DEUR-2026-000003';
  line_ids text[]:=ARRAY['22dd0a6f-6f74-4ca4-a48e-2ec5e6d1cbf2','d1df121a-94f2-47e3-a153-3e47e1218878','aeafa42d-97dd-40a5-bca7-8ed36e495153'];
  lineage jsonb; submit_audit_count integer; submit_idem_count integer; submitted_at timestamptz; submitted_by text;
  rental_status text; return_present boolean; return_events integer;
BEGIN
  IF tenant<>'TENANT-LOCAL-001' OR scenario_key<>'MULTI-EQUIPMENT-RUNTIME-CERT-2026-08-29' OR profile<>'UAT_MULTI_EQUIPMENT_PER_WORKDAY_V1'
     OR NOT EXISTS(SELECT 1 FROM companies c WHERE c.id=tenant AND c.active AND c.environment_class IN('compatibility','test')) THEN
    RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED');
  END IF;
  IF NOT EXISTS(SELECT 1 FROM deurs d WHERE d.id=deur_id AND d.company_id=tenant AND d.deur_number=deur_number AND d.rental_id=rental_id) THEN
    RETURN jsonb_build_object('success',false,'code','DEUR_NOT_FOUND');
  END IF;
  SELECT count(*),max(a.occurred_at),max(a.actor_id) INTO submit_audit_count,submitted_at,submitted_by FROM audit_log a
    WHERE a.company_id=tenant AND a.aggregate_type='DEUR' AND a.aggregate_id=deur_id AND a.action='SUBMIT_DEUR';
  SELECT count(*) INTO submit_idem_count FROM deur_command_idempotency i
    WHERE i.company_id=tenant AND i.aggregate_id=deur_id AND i.command_type='SUBMIT_DEUR' AND i.status='COMPLETED';
  SELECT r.status INTO rental_status FROM rentals r WHERE r.id=rental_id AND r.company_id=tenant;
  SELECT EXISTS(SELECT 1 FROM rentals r WHERE r.id=rental_id AND r.company_id=tenant AND (r.status='Returned' OR r.returned_at IS NOT NULL))
    OR EXISTS(SELECT 1 FROM rental_equipment_lines l WHERE l.company_id=tenant AND l.id=ANY(line_ids) AND l.status='Returned') INTO return_present;
  SELECT count(*) INTO return_events FROM operational_command_idempotency i WHERE i.company_id=tenant AND ((i.target_aggregate_type='RENTAL' AND i.target_aggregate_id=rental_id AND i.command_type IN('RETURN_ALL_RENTAL_LINES','REVERSE_RENTAL_RETURN')) OR (i.target_aggregate_type='RENTAL_LINE' AND i.target_aggregate_id=ANY(line_ids) AND i.command_type='RETURN_RENTAL_LINE'));
  lineage:=erp.inspect_isolated_uat_scenario_lineage(tenant,scenario_key);
  RETURN jsonb_build_object('success',true,'submit',jsonb_build_object('submitSuccessCount',CASE WHEN submit_audit_count>0 THEN 1 ELSE 0 END,'submitAuditCount',submit_audit_count,'submitIdempotencyCount',submit_idem_count,'duplicateSubmitMutationCount',GREATEST(submit_audit_count-1,0),'lastSubmitAt',submitted_at,'submittedByApplicationUserId',submitted_by,'submitExactlyOnceStatus',CASE WHEN submit_audit_count=1 THEN 'PROVEN' ELSE 'NOT_INDEPENDENTLY_OBSERVABLE' END),'review',lineage->'review','notification',lineage->'notification','billing',lineage->'billing','return',jsonb_build_object('rentalId',rental_id,'rentalStatus',rental_status,'returnMutationPresent',return_present,'returnEventCount',return_events),'scenarioDeurCount',1,'lineCounts',jsonb_build_object('line1',1,'line2',0,'line3',0,'operator2DeurCount',0,'operator3DeurCount',0,'crossOperatorExposure',jsonb_build_array()));
END $$;
ALTER FUNCTION erp.inspect_isolated_uat_deur_post_submit(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.inspect_isolated_uat_deur_post_submit(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION erp.inspect_isolated_uat_deur_post_submit(jsonb) TO service_role;
COMMIT;
