import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("isolated UAT DEUR turnover inspection", () => {
  const migration = readFileSync("supabase/migrations/20260830002400_deur_turnover_uat_read_boundaries.sql", "utf8");
  const route = readFileSync("worker/uatDeurTurnoverInspection.ts", "utf8");
  const index = readFileSync("worker/index.ts", "utf8");
  it("uses fixed scenario input, service-only certification, and a sanitized response", () => {
    expect(migration).toContain("inspect_isolated_uat_deur_turnover");
    expect(migration).toContain("MULTI-EQUIPMENT-RUNTIME-CERT-2026-08-29");
    expect(migration).toContain("REVOKE ALL ON FUNCTION erp.inspect_isolated_uat_deur_turnover(jsonb) FROM PUBLIC,anon,authenticated");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION erp.inspect_isolated_uat_deur_turnover(jsonb) TO service_role");
    expect(migration).not.toMatch(/INSERT INTO|UPDATE |DELETE /);
    expect(route).toContain("settings.update");
    expect(index).toContain("/api/admin/uat/inspect-deur-turnover");
  });

  it("exposes nominated or accepted work only through an actor-derived RPC", () => {
    expect(migration).toContain("read_current_operator_deur_turnover_work");
    expect(migration).toContain("turnover.to_operator_id=actor.operator_id");
    expect(migration).toContain("turnover.status='PENDING'");
    expect(migration).toContain("turnover.status='ACCEPTED'");
    expect(migration).toContain("REVOKE ALL ON FUNCTION erp.read_current_operator_deur_turnover_work() FROM PUBLIC,anon,service_role");
    expect(migration).not.toContain("GRANT SELECT ON erp.deur_turnovers TO authenticated");
  });
});
