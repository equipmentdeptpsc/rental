import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/20260729002100_phase_c4b2_deur_read_policies.sql", "utf8");

describe("Phase C4B.2 DEUR read policy repair", () => {
  it("removes every redundant policy that invokes the private permission helper", () => {
    for (const policy of [
      "assignments_operator_or_privileged_read",
      "deur_events_operator_or_privileged_read",
      "deurs_operator_or_privileged_read",
      "rental_lines_operator_or_privileged_read",
    ]) expect(sql).toContain(`DROP POLICY IF EXISTS ${policy}`);
    expect(sql).not.toContain("current_user_has_permission");
  });

  it("adds tenant-scoped immutable checkpoint reads without mutation grants", () => {
    expect(sql).toContain("ON deur_meter_checkpoints");
    expect(sql).toContain("USING (can_read_company_row(company_id))");
    expect(sql).toContain("GRANT SELECT ON deur_meter_checkpoints");
    expect(sql).not.toMatch(/GRANT\s+(?:INSERT|UPDATE|DELETE|ALL)/i);
  });

  it("does not alter frozen permissions, private helper execution, or service-role access", () => {
    expect(sql).not.toMatch(/app_permissions|role_permissions|service_role/i);
    expect(sql).not.toMatch(/GRANT EXECUTE/i);
    expect(sql).not.toMatch(/USING\s*\(\s*true\s*\)/i);
  });
});
