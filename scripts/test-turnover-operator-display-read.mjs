import { readFileSync } from 'node:fs';

const source=readFileSync('supabase/migrations/20260902000200_add_turnover_operator_display_names.sql','utf8');
let passed=0,failed=0;
const check=(value,label)=>value?(passed++,console.log(`  PASS: ${label}`)):(failed++,console.error(`  FAIL: ${label}`));

console.log('=== Turnover Operator Display Read Contract Tests ===');
check(source.includes("'primaryOperatorDisplayName',primary_operator.name"),'primary custody name is projected from the canonical operator relation');
check(source.includes("'currentAuthorizedOperatorDisplayName',current_operator.name"),'current custody name is projected from the canonical operator relation');
check(source.includes('primary_operator.id=d.operator_id')&&source.includes('current_operator.id=erp.resolve_deur_authorized_operator(d.id,tenant)'),'names are tied to immutable primary and canonical current custody IDs');
check(source.includes('primary_operator.company_id=tenant')&&source.includes('current_operator.company_id=tenant'),'operator lookup remains tenant-scoped');
check(source.includes("WHERE t.company_id=tenant")&&source.includes("t.status IN ('PENDING','ACCEPTED')"),'existing bounded turnover authorization scope is retained');
check(source.includes('REVOKE ALL ON FUNCTION')&&source.includes('GRANT EXECUTE ON FUNCTION erp.read_current_operator_deur_turnover_work() TO authenticated'),'RPC privilege boundary is unchanged');
console.log(`=== Results: ${passed} passed, ${failed} failed ===`);
if(failed)process.exitCode=1;
