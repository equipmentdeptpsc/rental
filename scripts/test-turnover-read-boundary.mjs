import fs from 'node:fs';
const file='supabase/migrations/20260830003100_extend_uat_turnover_scenario_read.sql';
const sql=fs.readFileSync(file,'utf8');
for (const needle of ["DEUR-TURNOVER-RUNTIME-CERT-2026-08-31","UAT_DEUR_TURNOVER_RUNTIME_V1","TENANT-LOCAL-001","erp.deur_turnovers","pendingTurnoverCount","acceptedTurnoverCount","currentAuthorizedOperatorId","primaryMutationAuthorized","relieverMutationAuthorized","crossOperatorExposure"]) {
  if (!sql.includes(needle)) throw new Error(`missing ${needle}`);
}
if (/\b(INSERT|UPDATE|DELETE)\b/i.test(sql.replace(/--.*$/gm,''))) throw new Error('read boundary contains mutation');
console.log('turnover read boundary: PASS');
