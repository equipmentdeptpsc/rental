import { readFileSync } from 'node:fs';

const source=readFileSync('supabase/migrations/20260902000300_fix_limited_pilot_duplicate_identity_read.sql','utf8');
let passed=0,failed=0; const check=(condition,label)=>condition?(passed++,console.log(`  PASS: ${label}`)):(failed++,console.error(`  FAIL: ${label}`));
const countDuplicates=(rows,tenant)=>{const groups=new Map();for(const row of rows.filter(row=>row.tenant===tenant)){const key=`${row.line}|${row.workDate}`;groups.set(key,(groups.get(key)??0)+1);}return [...groups.values()].reduce((sum,count)=>sum+Math.max(count-1,0),0);};
console.log('=== Limited Pilot Duplicate Identity Contract Tests ===');
check(source.includes('GROUP BY d.rental_equipment_line_id,d.work_date'),'aggregate groups by line and work date');
check(source.includes('d.company_id=tenant'),'duplicate grouping is tenant-scoped');
check(source.includes("duplicate.rental_equipment_line_id=d.rental_equipment_line_id AND duplicate.work_date=d.work_date"),'per-DEUR identity uses the complete daily key');
check(source.includes('HAVING count(*)>1'),'only repeated complete identities count as duplicates');
check(countDuplicates([{tenant:'T',line:'L1',workDate:'2026-09-01'},{tenant:'T',line:'L1',workDate:'2026-09-02'}],'T')===0,'same line on different dates is not a duplicate');
check(countDuplicates([{tenant:'T',line:'L1',workDate:'2026-09-01'},{tenant:'T',line:'L1',workDate:'2026-09-01'}],'T')===1,'same line and date is a duplicate');
check(countDuplicates([{tenant:'T',line:'L1',workDate:'2026-09-01'},{tenant:'T',line:'L2',workDate:'2026-09-01'}],'T')===0,'different lines on the same date are not duplicates');
check(countDuplicates([{tenant:'T1',line:'L1',workDate:'2026-09-01'},{tenant:'T2',line:'L1',workDate:'2026-09-01'}],'T1')===0,'same line/date across tenants is isolated');
check(countDuplicates([{tenant:'T',line:'L1',workDate:'2026-09-01'},{tenant:'T',line:'L1',workDate:'2026-09-02'},{tenant:'T',line:'L2',workDate:'2026-09-01'}],'T')===0,'the current four-DEUR pilot pattern has no duplicate identity');
check(source.includes('REVOKE ALL ON FUNCTION erp.inspect_uat_limited_pilot_scenarios')&&!/\b(INSERT|UPDATE|DELETE)\b/.test(source),'read-only privileges are preserved');
console.log(`=== Results: ${passed} passed, ${failed} failed ===`); if(failed)process.exitCode=1;
