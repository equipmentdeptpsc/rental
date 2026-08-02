import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const sql = fs.readFileSync(path.resolve("supabase/migrations/20260802003500_phase_c7_deur_release_readiness_gate.sql"), "utf8");
describe("DEUR release readiness migration", () => {
  it("revalidates every active line under deterministic locks before release", () => {
    expect(sql).toContain("FUNCTION rental_release_readiness(target_rental_id text)");
    expect(sql).toContain("status<>'Cancelled'"); expect(sql).toContain("deleted_at IS NULL");
    expect(sql).toContain("ORDER BY id FOR UPDATE"); expect(sql).toContain("'RELEASE_NOT_READY'");
    expect(sql.indexOf("readiness=rental_release_readiness")).toBeLessThan(sql.indexOf("execute_rental_lifecycle_transition(command,'RELEASE_RENTAL'"));
  });
  it("checks operational, relationship, shift, work, meter, billing and stale snapshot evidence", () => {
    for (const field of ["assignment", "operator", "project", "deurPolicy", "requiredShift", "shiftWindow", "workDescription", "meterConfiguration", "billingTerms", "operationalMetadata", "snapshotFreshness"]) expect(sql).toContain(`'${field}'`);
  });
  it("keeps the RPC authenticated with a minimal search path", () => {
    expect(sql).toContain("FROM PUBLIC,anon"); expect(sql).toContain("TO authenticated"); expect(sql).not.toMatch(/SET search_path\s*=[^;\n]*\bpublic\b/i);
  });
});
