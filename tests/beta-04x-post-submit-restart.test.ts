import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20260915000200_fix_deur_operational_open_uniqueness.sql", "utf8");

describe("Beta 04X post-submit DEUR restart", () => {
  it("limits the Start Shift uniqueness guard to operationally open original DEURs", () => {
    expect(migration).toContain("DROP INDEX IF EXISTS erp.uq_deur_line_workday_origin");
    expect(migration).toContain("ON erp.deurs(company_id,rental_equipment_line_id,work_date)");
    expect(migration).toContain("previous_revision_id IS NULL AND status IN ('Draft','In Progress')");
  });

  it("keeps terminal and downstream DEUR states outside the duplicate-start guard", () => {
    expect(migration).not.toMatch(/status IN \([^)]*Submitted/i);
    expect(migration).not.toMatch(/status IN \([^)]*Acknowledg/i);
    expect(migration).not.toMatch(/status IN \([^)]*Rejected/i);
  });

  it("keeps the one-open invariant scoped to canonical operational states", () => {
    const isOperationallyOpen = (status: string) => status === "Draft" || status === "In Progress";
    expect(isOperationallyOpen("In Progress")).toBe(true);
    expect(isOperationallyOpen("Draft")).toBe(true);
    for (const terminal of ["Submitted", "Pending Acknowledgement", "Acknowledged", "Rejected", "Billed"]) {
      expect(isOperationallyOpen(terminal)).toBe(false);
    }
  });
});
