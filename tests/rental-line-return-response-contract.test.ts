import { describe, expect, it, vi } from "vitest";

import { SupabaseOperationalCommandRepository } from "@/integrations/supabase/SupabaseOperationalCommandRepository";

const command = {
  commandId: "return-command", idempotencyKey: "return-key", rentalId: "rental-1",
  rentalLineId: "line-1", equipmentId: "equipment-1", assignmentId: "assignment-1",
  expectedVersion: 4, actualReturnDate: "2026-10-04",
};
const accepted = {
  success: true as const, disposition: "ACCEPTED" as const, serverOccurredAt: "2026-10-04T00:00:00.000Z",
  refresh: ["rental-1", "line-1"],
  value: { rentalId: "rental-1", rentalLineId: "line-1", status: "Returned", version: 5, actualReturnDate: "2026-10-04" },
};

function repository(data: unknown) {
  const rpc = vi.fn().mockResolvedValue({ data, error: null });
  return { rpc, repository: new SupabaseOperationalCommandRepository({ schema: () => ({ rpc }) }) };
}

describe("rental-line return response contract", () => {
  it("accepts the canonical successful per-line response shape", async () => {
    const subject = repository(accepted);
    await expect(subject.repository.returnLine(command)).resolves.toEqual(accepted);
    expect(subject.rpc).toHaveBeenCalledWith("command_return_rental_line", { command });
  });

  it("normalizes only the known legacy failure envelope so the UI receives its safe rejection", async () => {
    const response = { success: false, code: "CONFLICT", retryable: false, refreshRequired: true, currentVersion: 5 };
    await expect(repository(response).repository.returnLine(command)).resolves.toEqual({ ...response, message: "Rental Equipment Line version is stale. Refresh before retrying." });
  });

  it("fails closed for an unknown or malformed response", async () => {
    const malformed = { ...accepted, value: { rentalId: "rental-1", rentalLineId: "line-1", status: "Returned" } };
    await expect(repository(malformed).repository.returnLine(command)).resolves.toMatchObject({ success: false, code: "VALIDATION_REJECTED", message: "The server returned an invalid response." });
    await expect(repository({ success: false, code: "UNKNOWN", retryable: false, refreshRequired: false }).repository.returnLine(command)).resolves.toMatchObject({ success: false, code: "VALIDATION_REJECTED" });
  });

  it("continues to accept the canonical Return All response shape", async () => {
    const all = { ...accepted, value: { rentalId: "rental-1", lines: [accepted.value], version: 5 } };
    await expect(repository(all).repository.returnAll({ ...command, actualReturnDate: "2026-10-04" })).resolves.toEqual(all);
  });
});
