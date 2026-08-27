import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/20260828000100_canonical_billing_lineage_integrity.sql", "utf8");

describe("canonical Billing lineage integrity migration", () => {
  it("freezes complete historical provenance without changing financial fields", () => {
    for (const marker of ["commercial_snapshot_id", "commercial_snapshot_hash", "rental_number_snapshot", "rental_equipment_line_snapshot", "equipment_snapshot", "assignment_snapshot", "operator_snapshot"]) expect(sql).toContain(marker);
    expect(sql).not.toMatch(/SET\s+(subtotal|amount|grand_total|unit_rate|hourly_rate)\s*=/i);
  });

  it("rejects wrong-rental, cross-line, unacknowledged, superseded, billed, and assignment-mismatched consumption", () => {
    for (const marker of [
      "statement_record.rental_id IS DISTINCT FROM deur_record.rental_id",
      "NEW.rental_equipment_line_id IS DISTINCT FROM deur_record.rental_equipment_line_id",
      "NEW.equipment_id IS DISTINCT FROM deur_record.equipment_id",
      "NEW.operator_id IS DISTINCT FROM deur_record.operator_id",
      "deur_record.status::text <> 'Acknowledged'",
      "deur_record.superseded_by_revision_id IS NOT NULL",
      "deur_record.billing_locked",
      "assignment_record.equipment_id IS DISTINCT FROM deur_record.equipment_id",
      "assignment_record.operator_id IS DISTINCT FROM deur_record.operator_id",
    ]) expect(sql).toContain(marker);
  });

  it("preserves canonical lineage immutably and remains tenant scoped", () => {
    expect(sql).toContain("CREATE TRIGGER capture_billing_statement_line_lineage");
    expect(sql).toContain("CREATE TRIGGER reject_billing_statement_line_lineage_mutation");
    expect(sql).toContain("statement_record.company_id IS DISTINCT FROM deur_record.company_id");
    expect(sql).toContain("commercial_record.rental_id IS DISTINCT FROM deur_record.rental_id");
    expect(sql).toContain("billing_statement_lines_canonical_lineage_required");
  });
});
