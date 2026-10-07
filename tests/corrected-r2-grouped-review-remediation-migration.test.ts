import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/20260930000800_corrected_grouped_review_remediation.sql", "utf8");

describe("corrected R2 grouped-review remediation", () => {
  it("keeps initial reviews on their physical work date while admitting only a corrected revision on its local submission date", () => {
    expect(sql).toContain("work_date=requested_date OR (previous_revision_id IS NOT NULL AND submitted_at IS NOT NULL AND (submitted_at AT TIME ZONE rental_record.timezone)::date=requested_date)");
    expect(sql).toContain("candidate predicate did not match the authoritative definition");
  });

  it("distinguishes a zero-actionable result from a created actionable review batch", () => {
    expect(sql).toContain("NO_ACTIONABLE_REVIEWS");
    expect(sql).toContain("IF actionable_count=0 THEN");
  });

  it("resolves a current corrected R2 by exact ID before the work-date-bound number fallback", () => {
    expect(sql).toContain("'deurId','deurNumber','workDate'");
    expect(sql).toContain("target_deur_id IS NOT NULL AND d.id=target_deur_id");
    expect(sql).toContain("target_deur_id IS NULL AND d.deur_number=target_deur_number AND d.work_date=target_work_date");
    expect(sql).toContain("'resolutionMode',CASE WHEN target_deur_id IS NOT NULL THEN 'DEUR_ID'");
  });

  it("keeps the resolver read-only and the legacy number fallback bounded", () => {
    const resolver = sql.slice(sql.indexOf("CREATE OR REPLACE FUNCTION erp.resolve_isolated_uat_grouped_review_dispatch"));
    expect(resolver).not.toMatch(/\b(INSERT|UPDATE|DELETE)\b/);
    expect(resolver).toContain("TARGET_NOT_FOUND");
  });
});
