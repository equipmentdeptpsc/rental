import { describe, expect, it, vi } from "vitest";
import { SupabaseCanonicalRentalRepository } from "@/integrations/supabase/SupabaseCanonicalRentalRepository";
import { SupabaseOperationalCommandRepository } from "@/integrations/supabase/SupabaseOperationalCommandRepository";

const approvalMessage = "Operations Manager approval is required before this rental can be released.";
const client = { schema: () => ({ rpc: vi.fn(async () => ({ data: null, error: { message: approvalMessage, code: "23514" } })) }) };

describe("rental release approval error", () => {
  it("shows the server's approval gate for the parent release", async () => {
    const repository = new SupabaseCanonicalRentalRepository(client as never);
    const result = await repository.release({ commandId: "c", idempotencyKey: "k", rentalId: "r", expectedVersion: 1 });
    expect(result).toMatchObject({ success: false, code: "MANAGEMENT_APPROVAL_REQUIRED", message: approvalMessage });
  });

  it("shows a non-retryable approval gate for the line release", async () => {
    const repository = new SupabaseOperationalCommandRepository(client as never);
    const result = await repository.releaseLine({} as never);
    expect(result).toMatchObject({ success: false, code: "INVALID_TRANSITION", message: approvalMessage, retryable: false });
  });
});
