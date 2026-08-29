BEGIN;
SET LOCAL search_path=erp,public,pg_catalog;
CREATE OR REPLACE FUNCTION erp.begin_isolated_uat_provisioning_attempt(command jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,public,pg_catalog AS $$
DECLARE tenant text=trim(command->>'companyId'); sk text=trim(command->>'scenarioKey'); pv text=trim(command->>'profileVersion'); actor uuid=nullif(command->>'actorId','')::uuid; existing erp.uat_multi_equipment_execution_attempts; created erp.uat_multi_equipment_execution_attempts;
BEGIN
 IF tenant<>'TENANT-LOCAL-001' OR sk<>'MULTI-EQUIPMENT-RUNTIME-CERT-2026-08-29' OR pv<>'UAT_MULTI_EQUIPMENT_PER_WORKDAY_V1' OR actor IS NULL THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;
 SELECT * INTO existing FROM erp.uat_multi_equipment_execution_attempts WHERE company_id=tenant AND scenario_key=sk AND state='RUNNING' AND lease_expires_at>clock_timestamp() ORDER BY started_at DESC LIMIT 1;
 IF existing.id IS NOT NULL THEN RETURN jsonb_build_object('success',false,'code','UAT_EXECUTION_ALREADY_ACTIVE'); END IF;
 INSERT INTO erp.uat_multi_equipment_execution_attempts(company_id,scenario_key,profile_version,residue_company_id,actor_id,state) VALUES(tenant,sk,pv,tenant,actor,'RUNNING') RETURNING * INTO created;
 RETURN jsonb_build_object('success',true,'attemptId',created.id,'state',created.state,'startedAt',created.started_at,'leaseExpiresAt',created.lease_expires_at);
END $$;
CREATE OR REPLACE FUNCTION erp.finish_isolated_uat_provisioning_attempt(command jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,public,pg_catalog AS $$
DECLARE attempt uuid=nullif(command->>'attemptId','')::uuid; actor uuid=nullif(command->>'actorId','')::uuid; next_state text=trim(command->>'state'); code text=trim(command->>'safeResultCode'); updated erp.uat_multi_equipment_execution_attempts;
BEGIN
 IF attempt IS NULL OR actor IS NULL OR next_state NOT IN ('COMPLETED','FAILED') THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;
 UPDATE erp.uat_multi_equipment_execution_attempts SET state=next_state,ended_at=clock_timestamp(),heartbeat_at=clock_timestamp(),lease_expires_at=clock_timestamp(),safe_result_code=code WHERE id=attempt AND actor_id=actor AND state='RUNNING' RETURNING * INTO updated;
 IF updated.id IS NULL THEN RETURN jsonb_build_object('success',false,'code','UAT_EXECUTION_ATTEMPT_NOT_OWNED'); END IF;
 RETURN jsonb_build_object('success',true,'attemptId',updated.id,'state',updated.state,'endedAt',updated.ended_at,'safeResultCode',updated.safe_result_code);
END $$;
REVOKE ALL ON FUNCTION erp.begin_isolated_uat_provisioning_attempt(jsonb),erp.finish_isolated_uat_provisioning_attempt(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION erp.begin_isolated_uat_provisioning_attempt(jsonb),erp.finish_isolated_uat_provisioning_attempt(jsonb) TO service_role;
COMMIT;
