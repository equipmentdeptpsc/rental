import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20261004000500_audit_canonical_rental_line_returns.sql", "utf8");

describe("canonical rental-line return audit", () => {
  it("documents the historical trigger that is removed by the forward deduplication migration", () => {
    for (const marker of ["audit_canonical_rental_line_return", "prior_status <> 'Returned'", "next_status = 'Returned'", "'RETURN_RENTAL_LINE'", "NEW.company_id", "NEW.rental_id", "NEW.equipment_id", "NEW.assignment_id", "NEW.actual_return_date", "auth.uid()", "CREATE TRIGGER audit_canonical_rental_line_return"]) expect(migration).toContain(marker);
  });
});
