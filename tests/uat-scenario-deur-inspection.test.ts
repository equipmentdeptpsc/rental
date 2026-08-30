import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
describe("isolated UAT scenario DEUR read boundary",()=>{
 const source=readFileSync("worker/uatScenarioDeurInspection.ts","utf8"); const index=readFileSync("worker/index.ts","utf8"); const migration=readFileSync("supabase/migrations/20260830002000_fix_scenario_deur_inspection_line_scope.sql","utf8");
 it("accepts fixed-scenario DEUR numbers while preserving line scope",()=>{expect(source).toContain("expectedDeurNumber"); expect(source).toContain("^[A-Z]+-\\d{4}-\\d{6}"); expect(migration).toContain("d1df121a-94f2-47e3-a153-3e47e1218878"); expect(migration).toContain("rental_equipment_line_id=ANY(target_lines)"); expect(index).toContain("/api/admin/uat/inspect-scenario-deur");});
 it("remains authenticated, read-only, and sanitized",()=>{expect(source).toContain("settings.update"); expect(migration).toContain("REVOKE ALL ON FUNCTION"); expect(migration).toContain("GRANT EXECUTE ON FUNCTION erp.inspect_isolated_uat_scenario_deur(jsonb) TO service_role"); expect(migration).not.toContain("INSERT INTO"); expect(migration).not.toContain("UPDATE "); expect(migration).not.toContain("DELETE ");});
});
