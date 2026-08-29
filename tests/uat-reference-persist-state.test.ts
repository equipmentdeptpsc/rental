import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
describe("UAT reference persistence state contract",()=>it("does not write an invalid transitional residue state",()=>{const sql=readFileSync("supabase/migrations/20260830000200_fix_uat_reference_persist_state.sql","utf8");expect(sql).toContain("state=existing.state");expect(sql).not.toContain("state='RESOLVING_REFERENCES'");expect(sql).toContain("SCENARIO_REFERENCE_CONFLICT");}));
