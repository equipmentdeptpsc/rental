import { describe, expect, it, vi } from "vitest";
import { SupabaseDeurCommandRepository } from "@/integrations/supabase/SupabaseDeurCommandRepository";

describe("manual DEUR submit response mapping", () => {
  const submitCommand = {
    commandId: "command",
    idempotencyKey: "idempotency",
    deurId: "deur",
    expectedVersion: 1,
  };

  const repositoryFor = (data: unknown, error: unknown = null) => {
    const client = {
      schema: vi.fn(() => ({ rpc: vi.fn(async () => ({ error, data })) })),
    } as never;
    return new SupabaseDeurCommandRepository(client);
  };

  it("preserves a sanitized canonical validation code and message", async () => {
    const client = { schema: vi.fn(() => ({ rpc: vi.fn(async () => ({ error: null, data: {
      success: false,
      code: "PHYSICAL_CLOSING_METER_REQUIRED",
      message: "PHYSICAL_CLOSING_METER_REQUIRED",
      retryable: false,
      refreshRequired: false,
      details: { phase: "TIMELINE_VALIDATION" },
    } })) })) } as never;
    const result = await new SupabaseDeurCommandRepository(client).submitManualDeur(submitCommand);
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
    const result = await new SupabaseDeurCommandRepository(client).submitManualDeur(submitCommand);
    expect(result).toMatchObject({ success: false, code: "VALIDATION_REJECTED", canonicalCode: "CORRECTION_TIMELINE_DIAGNOSTIC", message: "CORRECTION_TIMELINE_DIAGNOSTIC" });
  });

  it("surfaces an unknown canonical code when the server omits a message", async () => {
    const client = { schema: vi.fn(() => ({ rpc: vi.fn(async () => ({ error: null, data: { success: false, code: "CORRECTION_TIMELINE_DIAGNOSTIC", retryable: false, refreshRequired: false } })) })) } as never;
    const result = await new SupabaseDeurCommandRepository(client).submitManualDeur(submitCommand);
    expect(result).toMatchObject({ success: false, code: "VALIDATION_REJECTED", canonicalCode: "CORRECTION_TIMELINE_DIAGNOSTIC", message: "CORRECTION_TIMELINE_DIAGNOSTIC" });
  });

  it("fails safely when the response is malformed", async () => {
    const client = { schema: vi.fn(() => ({ rpc: vi.fn(async () => ({ error: null, data: { success: false, code: { unsafe: true }, message: "select * from secrets" } })) })) } as never;
    const result = await new SupabaseDeurCommandRepository(client).submitManualDeur(submitCommand);
    expect(result).toMatchObject({ success: false, code: "VALIDATION_REJECTED", message: "The shift information is incomplete or invalid." });
    expect(result).not.toHaveProperty("canonicalCode");
  });

  it("preserves sanitized PostgREST error diagnostics without exposing SQL", async () => {
    const client = { schema: vi.fn(() => ({ rpc: vi.fn(async () => ({ data: null, error: {
      code: "23514",
      message: "new row violates check constraint ck_deur_minutes",
      details: "row rejected",
      hint: "refresh the corrected DEUR",
    } })) })) } as never;
    const result = await new SupabaseDeurCommandRepository(client).submitManualDeur(submitCommand);
    expect(result).toMatchObject({ success: false, code: "TRANSPORT_FAILURE", canonicalCode: "23514", message: "new row violates check constraint ck_deur_minutes", details: { errorCode: "23514", errorDetails: "row rejected", errorHint: "refresh the corrected DEUR" } });
  });

  it.each([
    "PHYSICAL_ACTIVITY_INCOMPLETE",
    "PHYSICAL_ACTIVITY_OVERLAP",
    "PHYSICAL_ACTIVITY_MISMATCH",
    "PHYSICAL_SHIFT_END_REQUIRED",
    "PHYSICAL_METER_ROLLBACK",
    "PHYSICAL_CLOSING_METER_REQUIRED",
  ])("preserves the canonical physical-timeline code for %s", async (code) => {
    const result = await repositoryFor({
      success: false,
      code,
      message: code,
      retryable: false,
      refreshRequired: false,
    }).submitManualDeur(submitCommand);

    expect(result).toMatchObject({
      success: false,
      code,
      message: code,
      retryable: false,
      refreshRequired: false,
    });
    expect(result).not.toHaveProperty("canonicalCode");
  });

  it.each([
    "UNAUTHENTICATED",
    "USER_INACTIVE",
    "FORBIDDEN",
    "VALIDATION_REJECTED",
    "INVALID_TRANSITION",
    "NOT_FOUND",
    "MANUAL_DEUR_REQUIRED",
    "SCOPE_MISMATCH",
    "DEUR_EXPECTATION_REQUIRED",
    "IDEMPOTENCY_MISMATCH",
  ])("preserves a safe non-timeline validation code for %s", async (code) => {
    const result = await repositoryFor({
      success: false,
      code,
      message: code,
      retryable: false,
      refreshRequired: false,
    }).submitManualDeur(submitCommand);

    expect(result).toMatchObject({
      success: false,
      code,
      message: code,
      retryable: false,
      refreshRequired: false,
    });
    expect(result).not.toHaveProperty("canonicalCode");
  });
});
