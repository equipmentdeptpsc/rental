import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/20260829000100_canonical_grouped_review_eligibility_timezone.sql", "utf8");

describe("canonical grouped-review eligibility timezone", () => {
  it("uses the frozen Per Workday policy timezone when the Rental projection is unset", () => {
    expect(sql).toContain("coalesce(nullif(r.timezone,''),nullif(l.operational_metadata#>>'{deurExpectationSnapshot,policy,timezone}',''))='Asia/Manila'");
  });

  it("retains tenant, active Rental, submitted, current revision, and work-date guards", () => {
    for (const predicate of ["r.company_id='TENANT-LOCAL-001'", "r.status='Active'", "d.superseded_by_revision_id IS NULL", "d.status='Submitted'", "d.work_date=target_work_date"]) expect(sql).toContain(predicate);
  });
});
