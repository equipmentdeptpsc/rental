import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { mapCanonicalAudit } from "@/integrations/supabase/readRepositories";

describe("canonical audit read surface", () => {
  it("maps canonical Return and expectation disposition identities without payloads", () => {
    const result = mapCanonicalAudit({ id: "audit-1", company_id: "tenant-1", aggregate_type: "Rental", aggregate_id: "rental-1", action: "RETURNED", actor_id: "actor-1", actor_name: "UAT Admin", occurred_at: "2026-08-29T05:58:28Z", correlation_id: "cmd-1", new_values: { secret: "must not map" } });
    expect(result).toMatchObject({ success: true, value: { id: "audit-1", companyId: "tenant-1", aggregateType: "Rental", aggregateId: "rental-1", action: "RETURNED", actorId: "actor-1", actorName: "UAT Admin" } });
    if (result.success) expect(result.value).not.toHaveProperty("newValues");
  });
  it("uses the canonical remote audit repository and visible error state", () => {
    const source = readFileSync("src/features/administration/pages/AuditTrailPage.tsx", "utf8");
    expect(source).toContain("readRepositories.canonicalAudit.list");
    expect(source).toContain('role="alert"');
  });
});
