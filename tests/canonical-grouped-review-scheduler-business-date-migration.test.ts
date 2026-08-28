import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/20260829000400_canonical_grouped_review_scheduler_business_date.sql", "utf8");
const schedulerSql = readFileSync("supabase/migrations/20260803007500_phase_c12_daily_scheduler_bounded_candidate_claiming.sql", "utf8");

describe("canonical grouped-review scheduler business date", () => {
  it("allows a claimed historical date only inside trusted scheduler preparation", () => {
    expect(sql).toContain("coalesce(current_setting(''erp.scheduler_preparation'',true),'''')");
    expect(sql).toContain("requested_date<local_today");
    expect(sql).toContain("requested_date>local_today+1");
  });

  it("scopes both effective-DEUR lookups to the daily batch date", () => {
    expect(sql).toContain("<>2");
    expect(sql).toContain("superseded_by_revision_id IS NULL AND work_date=requested_date;");
  });

  it("keeps daily batch identity and same-date duplicate prevention intact", () => {
    expect(schedulerSql).toContain("uq_daily_grouped_review_scheduler_group_business_date");
    expect(schedulerSql).toContain("business_date");
    expect(sql).not.toContain("DEUR-2026-000002");
    expect(sql).not.toContain("2026-08-28");
  });

  it("keeps the existing function permission boundary", () => {
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION erp.command_generate_customer_review_batch(jsonb) TO authenticated");
  });
});
