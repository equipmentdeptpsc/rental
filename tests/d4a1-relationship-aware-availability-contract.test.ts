import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const legacy = readFileSync("supabase/migrations/20260906000200_equipment_availability_conflict_read.sql", "utf8");
const migration = readFileSync("supabase/migrations/20260911000300_relationship_aware_equipment_availability_read.sql", "utf8");

describe("D4A1 relationship-aware availability read", () => {
  it("preserves the legacy three-argument RPC and adds a distinct four-input RPC", () => {
    expect(legacy).toContain("CREATE FUNCTION erp.check_equipment_availability(");
    expect(migration).toContain("CREATE FUNCTION erp.check_equipment_availability_for_pending_rental(");
    expect(migration).toContain("p_source_assignment_id text");
    expect(migration).not.toMatch(/DROP\s+FUNCTION\s+erp\.check_equipment_availability/i);
  });
  it("exempts only an exact active source Assignment with null-safe end equality", () => {
    for (const token of ["assignment.id = p_source_assignment_id", "assignment.equipment_id = p_equipment_id", "assignment.status = 'Active'", "assignment.assigned_date = p_window_start", "assignment.expected_return IS NOT DISTINCT FROM p_window_end"]) expect(migration).toContain(token);
  });
  it("keeps mismatches and independent Rental or Assignment conflicts in the result", () => {
    expect(migration).toContain("c.source_type = 'ASSIGNMENT' AND c.assignment_id = p_source_assignment_id");
    expect(migration).toContain("AND EXISTS (SELECT 1 FROM exact_source)");
    expect(migration).toContain("FROM erp._equipment_commitment_rows() c");
    expect(migration).toContain("WHERE NOT EXISTS (SELECT 1 FROM conflicts)");
  });
});
