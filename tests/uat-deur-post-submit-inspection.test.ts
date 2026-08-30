import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("isolated UAT post-submit certification read boundary", () => {
  const migration = readFileSync("supabase/migrations/20260830001800_isolated_uat_deur_post_submit_read.sql", "utf8");
  const route = readFileSync("worker/uatDeurPostSubmitInspection.ts", "utf8");
  const index = readFileSync("worker/index.ts", "utf8");
  it("is fixed scope and read-only", () => {
    expect(migration).toContain("inspect_isolated_uat_deur_post_submit");
    expect(migration).toContain("ff89d583-b3fa-4627-9b53-f5741e56a5c2");
    expect(migration).toContain("SUBMIT_DEUR");
    expect(migration).toContain("inspect_isolated_uat_scenario_lineage");
    expect(migration).toContain("REVOKE ALL ON FUNCTION");
    expect(migration).not.toContain("INSERT INTO");
    expect(migration).not.toContain("UPDATE ");
    expect(migration).not.toContain("DELETE ");
  });
  it("exposes an authenticated fixed-contract worker route", () => {
    expect(route).toContain("settings.update");
    expect(route).toContain("expectedDeurNumber");
    expect(route).toContain("inspect_isolated_uat_deur_post_submit");
    expect(index).toContain("/api/admin/uat/inspect-deur-post-submit");
  });
});
