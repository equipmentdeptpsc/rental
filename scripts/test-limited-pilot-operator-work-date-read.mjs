import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql=readFileSync('supabase/migrations/20260902000100_uat_limited_pilot_operator_work_date_read.sql','utf8');
assert.match(sql,/read_uat_limited_pilot_operator_work_date\(line_id text\)/);
assert.match(sql,/LIMITED-OPERATIONAL-PILOT-2026-09/);
assert.match(sql,/UAT_LIMITED_PILOT_V1/);
assert.match(sql,/auth\.uid\(\) IS NULL/);
assert.match(sql,/actor\.operator_id/);
assert.match(sql,/line_record\.operator_id=actor\.operator_id/);
assert.match(sql,/effective_business_date/);
assert.match(sql,/NOT_PILOT_WORK/);
assert.match(sql,/OWNERSHIP_MISMATCH/);
assert.match(sql,/CLOCK_NOT_INITIALIZED/);
assert.match(sql,/REVOKE ALL ON FUNCTION/);
assert.match(sql,/GRANT EXECUTE ON FUNCTION erp\.read_uat_limited_pilot_operator_work_date\(text\) TO authenticated/);
assert.doesNotMatch(sql,/INSERT INTO|UPDATE |DELETE FROM|command_start_deur_shift/);
console.log('PASS fixed-pilot authenticated work-date reader is read-only and ownership-scoped');
