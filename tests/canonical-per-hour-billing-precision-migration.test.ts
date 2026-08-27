import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/20260827000200_canonical_per_hour_billing_precision.sql", "utf8");

describe("canonical per-hour billing precision", () => {
  it("prices exact operating minutes without rounding billable hours before multiplication", () => {
    expect(sql).toContain("billable_hours=greatest(source.total_operating_minutes::numeric/60");
    expect(sql).toContain("hours=round(billable_hours,4)");
    expect(sql).toContain("WHEN 'Per Hour' THEN billable_hours*rate");
    expect(sql).not.toContain("WHEN 'Per Hour' THEN hours*rate");
    expect(Math.round(((233 / 60) * 1000) * 100) / 100).toBe(3883.33);
  });

  it("preserves eligibility, immutable snapshot, duplicate, and security guards", () => {
    for (const marker of ["source.status<>'Acknowledged'", "source.superseded_by_revision_id IS NOT NULL", "source.billing_locked", "source.commercial_snapshot_id", "rental_equipment_line_id IS NOT DISTINCT FROM source.rental_equipment_line_id", "commercialTermsSource','IMMUTABLE_SNAPSHOT", "REVOKE ALL ON FUNCTION erp.calculate_deur_billing_evidence"]) expect(sql).toContain(marker);
  });
});
