import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync('supabase/migrations/20260901000500_uat_offline_restart_runtime_scenario.sql', 'utf8');
const claimFix = readFileSync('supabase/migrations/20260901000600_fix_uat_offline_restart_claim_operator_reference.sql', 'utf8');
const scenarioFix = readFileSync('supabase/migrations/20260901000700_fix_uat_offline_restart_claim_scenario_reference.sql', 'utf8');
const operatorFix = readFileSync('supabase/migrations/20260901000800_use_fresh_uat_offline_restart_operator.sql', 'utf8');
const worker = readFileSync('worker/uatDeurOfflineRestartDomainProvisioner.ts', 'utf8');
const index = readFileSync('worker/index.ts', 'utf8');
const cors = readFileSync('worker/uatAdminCors.ts', 'utf8');

assert.match(worker, /DEUR-OFFLINE-RESTART-RUNTIME-CERT-2026-09-01/);
assert.match(worker, /UAT_DEUR_OFFLINE_RESTART_RUNTIME_V1/);
assert.match(worker, /DATE\s*=\s*'2026-09-01'/);
assert.doesNotMatch(worker, /\/api\/admin\/users|auth\.admin/);
for (const stage of ['CUSTOMER', 'PROJECT', 'OPERATOR', 'EQUIPMENT', 'ASSIGNMENT', 'RENTAL', 'PREPARE', 'RELEASE', 'ACTIVATE']) {
  assert.match(worker, new RegExp(`canonical\\(client,\\s*'${stage}'`));
  assert.match(worker, new RegExp(`command\\('${stage}',\\s*'`));
}
assert.match(worker, /frequency:\s*'PER_WORKDAY'/);
assert.match(index, /provision-deur-offline-restart-scenario/);
assert.match(index, /inspect-deur-offline-restart-scenario/);
assert.match(index, /uatAdminCorsHeaders\(request,environment\)/);
assert.match(cors, /access-control-allow-methods.*POST, OPTIONS/);
assert.match(cors, /access-control-allow-headers.*authorization, content-type/);
assert.match(migration, /DATE '2026-09-01'/);
assert.match(migration, /duplicateDailyDeurCount',duplicate_daily_deur_count/);
assert.match(migration, /operatorActive/);
assert.match(migration, /REVOKE ALL ON FUNCTION/);
assert.match(migration, /GRANT EXECUTE ON FUNCTION[\s\S]*TO service_role/);
assert.match(migration, /SCENARIO_NOT_PROVISIONING/);
assert.match(claimFix, /baseline_operator_id/);
assert.match(claimFix, /o\.id=baseline_operator_id/);
assert.doesNotMatch(claimFix, /WHERE o\.id=operator_id/);
assert.match(worker, /safeClaimFailure/);
assert.match(worker, /failedStage:\s*'CLAIM'/);
assert.match(worker, /failedCode:\s*claimCode/);
assert.match(scenarioFix, /SELECT baseline_source\.scenario INTO baseline/);
assert.match(scenarioFix, /scenario_draft/);
assert.doesNotMatch(scenarioFix, /SELECT scenario INTO baseline/);
assert.doesNotMatch(scenarioFix, /WHERE o\.id=operator_id/);
assert.match(operatorFix, /b49ab5f5-0ca0-4c9f-b43a-dc6e9c524a68/);
assert.match(operatorFix, /ASSIGNMENT_RESIDUE_CONFLICT/);
assert.match(worker, /command_create_operator/);
assert.doesNotMatch(worker, /\/api\/admin\/users|auth\.admin/);
console.log('PASS offline restart provisioner fixed scenario and read boundary');
