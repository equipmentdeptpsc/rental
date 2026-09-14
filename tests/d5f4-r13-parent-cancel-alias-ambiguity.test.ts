import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/20260914000600_fix_parent_cancel_line_alias_ambiguity.sql", "utf8");
const functionSection = sql.slice(sql.indexOf("CREATE OR REPLACE FUNCTION erp.command_cancel_rental"), sql.indexOf("$$;", sql.indexOf("CREATE OR REPLACE FUNCTION erp.command_cancel_rental")));

describe("D5F4-R13 parent cancel line alias remediation", () => {
  it("is one forward-only replacement of the parent cancel function", () => {
    expect(sql.startsWith("BEGIN;")).toBe(true);
    expect(sql).toContain("CREATE OR REPLACE FUNCTION erp.command_cancel_rental(command jsonb)");
    expect(sql).toContain("COMMIT;");
    expect(sql).not.toMatch(/\b(?:DROP|DELETE|ALTER\s+TABLE|CREATE\s+TABLE)\b/i);
  });

  it("removes the SQLSTATE 42702 row-variable/table-alias topology", () => {
    expect(functionSection).toContain("rental_line_row erp.rental_equipment_lines%ROWTYPE");
    expect(functionSection).not.toMatch(/\bline\s+erp\.rental_equipment_lines%ROWTYPE/i);
    expect(functionSection).not.toMatch(/erp\.rental_equipment_lines\s+line\b/i);
    expect(functionSection).not.toMatch(/FOR\s+line\s+IN/i);
    expect(functionSection).toContain("UPDATE erp.rental_equipment_lines AS rental_line");
    expect(functionSection).toContain("WHERE rental_line.rental_id = target.id");
  });

  it("keeps source Assignment state out of the parent-cancel guard", () => {
    const beforeCascade = functionSection.slice(0, functionSection.indexOf("prior_status = target.status::text"));
    expect(beforeCascade).not.toContain("assignment_row.status = 'Active'");
    expect(beforeCascade).toContain("PARENT_CANCEL_ACTIVE_EQUIPMENT");
  });

  it("preserves the parent cancel lifecycle, billing, authorization, audit, and command rules", () => {
    for (const marker of [
      "current_user_has_permission('rental.update')",
      "PARENT_READ_ONLY",
      "'Draft', 'Assigned', 'Reserved', 'Released', 'Active'",
      "PARENT_CANCEL_ACTIVE_EQUIPMENT",
      "calculate_deur_billing_evidence(deur.id, tenant)",
      "PARENT_CANCEL_BILLABLE_DEUR",
      "IN ('Draft', 'Assigned', 'Reserved', 'Released')",
      "status = 'Cancelled', canonical_line_status = 'Cancelled'",
      "IDEMPOTENCY_MISMATCH",
      "'CONFLICT'",
      "finish_operational_command(command, 'CANCEL_RENTAL'",
      "'CANCEL_RENTAL'",
    ]) expect(functionSection).toContain(marker);
    expect(functionSection).not.toContain("IN ('Returned', 'Cancelled')");
  });

  it("uses a distinct loop record and retains source-Assignment equipment reconciliation", () => {
    expect(functionSection).toContain("FOR rental_line_row IN SELECT * FROM erp.rental_equipment_lines AS rental_line");
    expect(functionSection).toContain("assignment_row.id = rental_line_row.assignment_id");
    expect(functionSection).toContain("WHERE equipment_row.id = rental_line_row.equipment_id");
  });
});
