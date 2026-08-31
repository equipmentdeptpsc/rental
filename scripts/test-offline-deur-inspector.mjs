import fs from 'node:fs';

const path = 'supabase/migrations/20260901000400_fix_uat_offline_deur_projection_workdate.sql';
const sql = fs.readFileSync(path, 'utf8');
const required = [
  "CREATE OR REPLACE FUNCTION erp.inspect_uat_deur_offline_runtime_scenario",
  "DEUR-OFFLINE-RUNTIME-CERT-2026-08-31",
  "UAT_DEUR_OFFLINE_RUNTIME_V1",
  "target_work_date date := DATE '2026-08-31'",
  "'deurId'",
  "'deurNumber'",
  "'workDate'",
  "'status'",
  "'version'",
  "'currentActivity'",
  "'activeActivityCount'",
  "'operationalTimelineCount'",
  "'lifecycleEventCount'",
  "'duplicateDailyDeurCount'",
  "REVOKE ALL ON FUNCTION erp.inspect_uat_deur_offline_runtime_scenario(jsonb)",
];
for (const fragment of required) {
  if (!sql.includes(fragment)) throw new Error(`missing inspector contract fragment: ${fragment}`);
}
if (/INSERT\s+INTO|UPDATE\s+|DELETE\s+FROM/i.test(sql.replace(/--.*$/gm, ''))) {
  throw new Error('offline inspector must remain read-only');
}
if (!sql.includes("IF target_deur.id IS NOT NULL")) throw new Error('no-DEUR null projection guard missing');
if (!sql.includes("d.id<>target_deur.id")) throw new Error('duplicate daily identity guard missing');
if (sql.includes("v->>'workDate'")) throw new Error('projection must not rely on absent scenario workDate payload');
console.log('offline DEUR inspector projection checks: PASS');
