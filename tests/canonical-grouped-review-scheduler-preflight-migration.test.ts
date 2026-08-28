import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/20260829000500_canonical_grouped_review_scheduler_preflight.sql", "utf8");
describe("canonical grouped-review scheduler preflight", () => {
  it("checks the target date without creating a batch", () => {
    expect(sql).toContain("b.review_date=target_work_date");
    expect(sql).toContain("preparedBatchCount',1");
    expect(sql).not.toMatch(/INSERT|UPDATE|DELETE/);
  });
  it("requires the scheduler principal and excludes an active target request", () => {
    expect(sql).toContain("grouped_review.schedule");
    expect(sql).toContain("q.revision_id=target_deur_id");
  });

  it("is a service-only, tenant-scoped read boundary with no historical mutation", () => {
    expect(sql).toContain("auth.role()<>'service_role'");
    expect(sql).toContain("TENANT-LOCAL-001");
    expect(sql).toContain("q.consumed_at IS NULL");
    expect(sql).not.toContain("DEUR-2026-000001");
    expect(sql).not.toContain("2026-08-26");
  });
});
