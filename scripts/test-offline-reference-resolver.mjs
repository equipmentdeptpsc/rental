import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync('supabase/migrations/20260901000200_resolve_uat_offline_runtime_references.sql', 'utf8');
const worker = readFileSync('worker/uatDeurOfflineDomainProvisioner.ts', 'utf8');

for (const table of ['erp.cost_codes', 'erp.activity_codes', 'erp.work_descriptions']) {
  assert.match(migration, new RegExp(`FROM ${table.replace('.', '\\.')}`));
}
assert.match(migration, /WHERE c\.active AND c\.deleted_at IS NULL/);
assert.match(migration, /WHERE a\.active AND a\.deleted_at IS NULL/);
assert.match(migration, /WHERE w\.active AND w\.deleted_at IS NULL/);
assert.match(migration, /ORDER BY \(c\.code LIKE 'UAT%'\) DESC,c\.sort_order,c\.code,c\.id/);
assert.match(migration, /'referencesReady'/);
assert.match(migration, /'failedReferences'/);
assert.doesNotMatch(worker, /ACTIVE_CANONICAL_(COST_CODE|ACTIVITY_CODE|WORK_DESCRIPTION)/);
assert.match(worker, /resolve_uat_deur_offline_runtime_references/);
console.log('PASS offline reference resolver contract');
