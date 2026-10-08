import { describe, expect, it } from "vitest";
import { SupabaseOperationalCommandRepository } from "@/integrations/supabase/SupabaseOperationalCommandRepository";

const input = { commandId: "command", idempotencyKey: "idempotency", sourceRevisionId: "deur", deurId: "deur", expectedVersion: 1, changes: {}, reasonCode: "INCORRECT_TIME_ENTRY", reasonDetails: "safe diagnostic" };

describe("remote correction response mapping", () => {
  it("preserves canonical failure codes when legacy responses omit contract fields", async () => {
    const repository = new SupabaseOperationalCommandRepository({
      schema: () => ({ rpc: async () => ({ data: { success: false, code: "CONFLICT", currentVersion: 7 }, error: null }) }),
    });
    const result = await repository.createCorrection(input);
    expect(result).toMatchObject({ success: false, code: "CONFLICT", message: "The request was rejected.", retryable: false, refreshRequired: true, currentVersion: 7 });
  });

  it("keeps correction diagnostics safe while preserving the canonical validation code", async () => {
    const repository = new SupabaseOperationalCommandRepository({
      schema: () => ({ rpc: async () => ({ data: { success: false, code: "VALIDATION_REJECTED", details: { reason: "CORRECTION_REASON_INVALID", detail: "internal SQL text", secret: "must not surface" } }, error: null }) }),
    });
    const result = await repository.createCorrection(input);
    expect(result).toMatchObject({ success: false, code: "VALIDATION_REJECTED", message: "The request was rejected.", retryable: false, refreshRequired: false, details: { reason: "CORRECTION_REASON_INVALID" } });
    expect(JSON.stringify(result)).not.toContain("internal SQL text");
    expect(JSON.stringify(result)).not.toContain("must not surface");
  });
});
