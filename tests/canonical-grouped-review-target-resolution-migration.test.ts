import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/20260829000300_canonical_grouped_review_target_resolution.sql", "utf8");

describe("canonical grouped-review target resolution", () => {
  it("resolves an explicit DEUR number through a service-role-only canonical function", () => {
    expect(sql).toContain("resolve_isolated_uat_grouped_review_target");
    expect(sql).toContain("auth.role()<>'service_role'");
    expect(sql).toContain("'deurNumber'");
    expect(sql).toContain("coalesce(cardinality(resolved_ids),0)<>1");
  });

  it("retains canonical tenant, current-line, and current-DEUR guards", () => {
    for (const predicate of ["r.company_id='TENANT-LOCAL-001'", "l.deleted_at IS NULL", "d.superseded_by_revision_id IS NULL", "d.work_date=target_work_date"]) expect(sql).toContain(predicate);
  });
});
