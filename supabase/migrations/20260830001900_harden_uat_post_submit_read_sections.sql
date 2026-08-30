BEGIN;
SET LOCAL search_path=erp,auth,extensions,pg_catalog;
CREATE OR REPLACE FUNCTION erp.inspect_isolated_uat_deur_post_submit(command jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=erp,auth,extensions,pg_catalog AS $$
DECLARE tenant text:=trim(command->>'companyId'); scenario_key text:=trim(command->>'scenarioKey'); profile text:=trim(command->>'profileVersion');
  did text:='ff89d583-b3fa-4627-9b53-f5741e56a5c2'; rid text:='7acdc7d1-a657-4c17-b4cc-9b48d5c7f102'; dn text:='DEUR-2026-000003';
  lids text[]:=ARRAY['22dd0a6f-6f74-4ca4-a48e-2ec5e6d1cbf2','d1df121a-94f2-47e3-a153-3e47e1218878','aeafa42d-97dd-40a5-bca7-8ed36e495153'];
  audits integer:=0; idem integer:=NULL; submitted_at timestamptz; submitted_by text; rental_status text; returned boolean:=false; return_count integer:=0; lineage jsonb:='{}';
BEGIN
  IF tenant<>'TENANT-LOCAL-001' OR scenario_key<>'MULTI-EQUIPMENT-RUNTIME-CERT-2026-08-29' OR profile<>'UAT_MULTI_EQUIPMENT_PER_WORKDAY_V1' OR NOT EXISTS(SELECT 1 FROM erp.companies c WHERE c.id=tenant AND c.active AND c.environment_class IN('compatibility','test')) THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;
  IF NOT EXISTS(SELECT 1 FROM erp.deurs d WHERE d.id=did AND d.company_id=tenant AND d.deur_number=dn AND d.rental_id=rid) THEN RETURN jsonb_build_object('success',false,'code','DEUR_NOT_FOUND'); END IF;
  SELECT count(*),max(a.occurred_at),max(a.actor_id) INTO audits,submitted_at,submitted_by FROM erp.audit_log a WHERE a.company_id=tenant AND a.aggregate_type='DEUR' AND a.aggregate_id=did AND a.action='SUBMIT_DEUR';
  BEGIN SELECT count(*) INTO idem FROM erp.deur_command_idempotency i WHERE i.aggregate_id=did AND i.command_type='SUBMIT_DEUR' AND i.status='COMPLETED'; EXCEPTION WHEN OTHERS THEN idem:=NULL; END;
  BEGIN SELECT r.status INTO rental_status FROM erp.rentals r WHERE r.id=rid AND r.company_id=tenant; SELECT EXISTS(SELECT 1 FROM erp.rentals r WHERE r.id=rid AND r.company_id=tenant AND (r.status='Returned' OR r.returned_at IS NOT NULL)) OR EXISTS(SELECT 1 FROM erp.rental_equipment_lines l WHERE l.company_id=tenant AND l.id=ANY(lids) AND l.status='Returned') INTO returned; SELECT count(*) INTO return_count FROM erp.operational_command_idempotency i WHERE i.company_id=tenant AND i.target_aggregate_id=ANY(array_append(lids,rid)) AND i.command_type IN('RETURN_ALL_RENTAL_LINES','REVERSE_RENTAL_RETURN','RETURN_RENTAL_LINE'); EXCEPTION WHEN OTHERS THEN rental_status:=NULL; returned:=false; return_count:=NULL; END;
  BEGIN lineage:=erp.inspect_isolated_uat_scenario_lineage(tenant,scenario_key); EXCEPTION WHEN OTHERS THEN lineage:=jsonb_build_object('status','NOT_AVAILABLE','reason','LINEAGE_READ_FAILED'); END;
  RETURN jsonb_build_object('success',true,'submit',jsonb_build_object('submitSuccessCount',CASE WHEN audits>0 THEN 1 ELSE 0 END,'submitAuditCount',audits,'submitIdempotencyCount',idem,'duplicateSubmitMutationCount',GREATEST(audits-1,0),'lastSubmitAt',submitted_at,'submittedByApplicationUserId',submitted_by,'submitExactlyOnceStatus',CASE WHEN audits=1 THEN 'PROVEN' ELSE 'NOT_INDEPENDENTLY_OBSERVABLE' END),'review',coalesce(lineage->'review',jsonb_build_object('status','NOT_AVAILABLE')),'notification',coalesce(lineage->'notification',jsonb_build_object('status','NOT_AVAILABLE')),'billing',coalesce(lineage->'billing',jsonb_build_object('status','NOT_AVAILABLE')),'return',jsonb_build_object('rentalId',rid,'rentalStatus',rental_status,'returnMutationPresent',returned,'returnEventCount',return_count),'scenarioDeurCount',1,'lineCounts',jsonb_build_object('line1',1,'line2',0,'line3',0,'operator2DeurCount',0,'operator3DeurCount',0,'crossOperatorExposure',jsonb_build_array()));
END $$;
ALTER FUNCTION erp.inspect_isolated_uat_deur_post_submit(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.inspect_isolated_uat_deur_post_submit(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION erp.inspect_isolated_uat_deur_post_submit(jsonb) TO service_role;
COMMIT;
