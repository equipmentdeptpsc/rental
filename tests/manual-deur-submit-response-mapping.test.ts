import { describe, expect, it, vi } from "vitest";
import { SupabaseDeurCommandRepository } from "@/integrations/supabase/SupabaseDeurCommandRepository";

describe("manual DEUR submit response mapping", () => {
  it("preserves a sanitized canonical validation code and message", async () => {
    const client = { schema: vi.fn(() => ({ rpc: vi.fn(async () => ({ error: null, data: {
      success: false,
      code: "PHYSICAL_CLOSING_METER_REQUIRED",
      message: "PHYSICAL_CLOSING_METER_REQUIRED",
      retryable: false,
      refreshRequired: false,
      details: { phase: "TIMELINE_VALIDATION" },
    } })) })) } as never;
    const result = await new SupabaseDeurCommandRepository(client).submitManualDeur({ commandId: "command", idempotencyKey: "idempotency", deurId: "deur", expectedVersion: 1 });
    expect(result).toMatchObject({ success: false, code: "PHYSICAL_CLOSING_METER_REQUIRED", message: "PHYSICAL_CLOSING_METER_REQUIRED", details: { phase: "TIMELINE_VALIDATION" } });
    expect(result).not.toHaveProperty("canonicalCode");
  });

  it("does not collapse an unknown but sanitized canonical code to a persistence error", async () => {
    const client = { schema: vi.fn(() => ({ rpc: vi.fn(async () => ({ error: null, data: {
      success: false,
      code: "CORRECTION_TIMELINE_DIAGNOSTIC",
      message: "CORRECTION_TIMELINE_DIAGNOSTIC",
      retryable: false,
      refreshRequired: false,
    } })) })) } as never;
    const result = await new SupabaseDeurCommandRepository(client).submitManualDeur({ commandId: "command", idempotencyKey: "idempotency", deurId: "deur", expectedVersion: 1 });
    expect(result).toMatchObject({ success: false, code: "VALIDATION_REJECTED", canonicalCode: "CORRECTION_TIMELINE_DIAGNOSTIC", message: "CORRECTION_TIMELINE_DIAGNOSTIC" });
  });

  it("surfaces an unknown canonical code when the server omits a message", async () => {
    const client = { schema: vi.fn(() => ({ rpc: vi.fn(async () => ({ error: null, data: { success: false, code: "SCOPE_MISMATCH", retryable: false, refreshRequired: false } })) })) } as never;
    const result = await new SupabaseDeurCommandRepository(client).submitManualDeur({ commandId: "command", idempotencyKey: "idempotency", deurId: "deur", expectedVersion: 1 });
    expect(result).toMatchObject({ success: false, code: "VALIDATION_REJECTED", canonicalCode: "SCOPE_MISMATCH", message: "SCOPE_MISMATCH" });
  });

  it("fails safely when the response is malformed", async () => {
    const client = { schema: vi.fn(() => ({ rpc: vi.fn(async () => ({ error: null, data: { success: false, code: { unsafe: true }, message: "select * from secrets" } })) })) } as never;
    const result = await new SupabaseDeurCommandRepository(client).submitManualDeur({ commandId: "command", idempotencyKey: "idempotency", deurId: "deur", expectedVersion: 1 });
    expect(result).toMatchObject({ success: false, code: "VALIDATION_REJECTED", message: "The shift information is incomplete or invalid." });
    expect(result).not.toHaveProperty("canonicalCode");
  });
});
