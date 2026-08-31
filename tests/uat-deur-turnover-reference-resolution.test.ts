import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("fresh turnover reference resolution", () => {
  const worker = readFileSync("worker/uatDeurTurnoverDomainProvisioner.ts", "utf8");
  const migration = readFileSync("supabase/migrations/20260830002700_uat_turnover_reference_resolver.sql", "utf8");
  it("resolves all references through a service-only canonical RPC before claiming or mutating", () => {
    expect(worker).toContain('rpc("resolve_uat_deur_turnover_domain_references"');
    expect(worker.indexOf("resolve_uat_deur_turnover_domain_references")).toBeLessThan(worker.indexOf("claim_uat_deur_turnover_domain_scenario"));
    expect(worker).not.toMatch(/\.from\("(?:cost_codes|activity_codes|work_descriptions)"\)/);
    expect(migration).toContain("CREATE OR REPLACE FUNCTION erp.resolve_uat_deur_turnover_domain_references");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION erp.resolve_uat_deur_turnover_domain_references(jsonb) TO service_role");
  });
  it("uses deterministic active, non-deleted ordering and persists selected references", () => {
    for (const table of ["cost_codes", "activity_codes", "work_descriptions"]) expect(migration).toContain(`FROM erp.${table}`);
    expect(migration).toContain("ORDER BY (c.code LIKE 'UAT%') DESC,c.sort_order,c.code,c.id");
    expect(migration).toContain("'costCodeId',v->>'costCodeId'");
    expect(migration).toContain("'workDescriptionId',v->>'workDescriptionId'");
  });
  it("returns a safe stage code for canonical command failures", () => {
    expect(worker).toContain("UAT_TURNOVER_SCENARIO_FAILED:${name}:${code}");
    expect(readFileSync("worker/index.ts", "utf8")).toContain("message.startsWith(\"UAT_TURNOVER_SCENARIO_FAILED:\")");
  });
});
