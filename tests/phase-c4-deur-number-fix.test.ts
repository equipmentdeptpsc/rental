import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const sql = fs.readFileSync(
  path.resolve("supabase/migrations/20260729001500_phase_c4_deur_number_fix.sql"),
  "utf8",
);

describe("Phase C4 DEUR number forward fix", () => {
  it("uses an unambiguous tenant-scoped year variable", () => {
    expect(sql).toContain("target_year integer");
    expect(sql).toContain("VALUES(tenant,'DEUR',target_year,1,'DEUR')");
    expect(sql).toContain("ON CONFLICT(company_id,scope,sequence_year)");
    expect(sql).not.toContain("sequence_year integer=");
  });

  it("keeps the helper private with a minimal path", () => {
    expect(sql).toContain("SET search_path=erp,auth");
    expect(sql).toContain("FROM PUBLIC,anon,authenticated");
  });
});
