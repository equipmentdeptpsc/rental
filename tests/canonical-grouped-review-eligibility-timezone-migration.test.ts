import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const fallbackSql = readFileSync("supabase/migrations/20260829000100_canonical_grouped_review_eligibility_timezone.sql", "utf8");
const sql = readFileSync("supabase/migrations/20260829000200_canonical_grouped_review_policy_timezone_precedence.sql", "utf8");

describe("canonical grouped-review eligibility timezone", () => {
  it("uses the frozen Per Workday policy timezone before a stale Rental projection", () => {
    expect(fallbackSql).toContain("coalesce(nullif(r.timezone,''),nullif(l.operational_metadata#>>'{deurExpectationSnapshot,policy,timezone}',''))='Asia/Manila'");
    expect(sql).toContain("coalesce(nullif(l.operational_metadata#>>'{deurExpectationSnapshot,policy,timezone}',''),nullif(r.timezone,''))='Asia/Manila'");
  });

  it("retains tenant, active Rental, submitted, current revision, and work-date guards", () => {
    for (const predicate of ["r.company_id='TENANT-LOCAL-001'", "r.status='Active'", "d.superseded_by_revision_id IS NULL", "d.status='Submitted'", "d.work_date=target_work_date"]) expect(sql).toContain(predicate);
  });
});
