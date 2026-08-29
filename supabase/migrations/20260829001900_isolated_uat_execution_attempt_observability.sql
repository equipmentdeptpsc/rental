CREATE TABLE IF NOT EXISTS erp.uat_multi_equipment_execution_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id text NOT NULL,
  scenario_key text NOT NULL,
  profile_version text NOT NULL,
  residue_company_id text NOT NULL,
  actor_id uuid NOT NULL,
  state text NOT NULL CHECK (state IN ('RUNNING','COMPLETED','FAILED')),
  started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  heartbeat_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  lease_expires_at timestamptz NOT NULL DEFAULT (clock_timestamp() + interval '10 minutes'),
  ended_at timestamptz,
  safe_result_code text,
  CONSTRAINT uat_exec_attempt_residue_fk FOREIGN KEY (residue_company_id,scenario_key)
    REFERENCES erp.uat_multi_equipment_provisioning_scenarios(company_id,scenario_key),
  CONSTRAINT uat_exec_attempt_tenant_check CHECK (company_id=residue_company_id),
  CONSTRAINT uat_exec_attempt_profile_check CHECK (profile_version='UAT_MULTI_EQUIPMENT_PER_WORKDAY_V1')
);
CREATE INDEX IF NOT EXISTS ix_uat_exec_attempt_latest ON erp.uat_multi_equipment_execution_attempts(company_id,scenario_key,started_at DESC);
REVOKE ALL ON TABLE erp.uat_multi_equipment_execution_attempts FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON erp.uat_multi_equipment_execution_attempts TO service_role;

CREATE OR REPLACE FUNCTION erp.inspect_isolated_uat_execution(command jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=erp,public AS $$
DECLARE tenant text=trim(command->>'companyId'); sk text=trim(command->>'scenarioKey'); a erp.uat_multi_equipment_execution_attempts;
BEGIN
 IF tenant<>'TENANT-LOCAL-001' OR sk<>'MULTI-EQUIPMENT-RUNTIME-CERT-2026-08-29' THEN RETURN jsonb_build_object('success',false,'code','VALIDATION_REJECTED'); END IF;
 SELECT * INTO a FROM erp.uat_multi_equipment_execution_attempts WHERE company_id=tenant AND scenario_key=sk ORDER BY started_at DESC LIMIT 1;
 IF a.id IS NULL THEN RETURN jsonb_build_object('success',true,'activeExecution','UNKNOWN_LEGACY','executionEvidence','NO_ATTEMPT'); END IF;
 IF a.state='RUNNING' AND a.lease_expires_at>clock_timestamp() THEN RETURN jsonb_build_object('success',true,'activeExecution','YES','executionEvidence','LIVE_LEASE','latestAttemptState',a.state,'latestAttemptStartedAt',a.started_at,'latestAttemptHeartbeatAt',a.heartbeat_at,'leaseExpiresAt',a.lease_expires_at); END IF;
 RETURN jsonb_build_object('success',true,'activeExecution','NO','executionEvidence',CASE WHEN a.state='FAILED' THEN 'FAILED_ATTEMPT' WHEN a.state='COMPLETED' THEN 'COMPLETED_ATTEMPT' ELSE 'EXPIRED_LEASE' END,'latestAttemptState',a.state,'latestAttemptStartedAt',a.started_at,'latestAttemptHeartbeatAt',a.heartbeat_at,'leaseExpiresAt',a.lease_expires_at,'latestAttemptEndedAt',a.ended_at,'latestAttemptSafeResultCode',a.safe_result_code);
END $$;
ALTER FUNCTION erp.inspect_isolated_uat_execution(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.inspect_isolated_uat_execution(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION erp.inspect_isolated_uat_execution(jsonb) TO service_role;
