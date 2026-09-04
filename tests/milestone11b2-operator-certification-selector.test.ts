import { describe, expect, it, vi } from "vitest";
import { SupabaseOperatorCertificationRepository } from "@/features/operators/certifications/repository";

describe("Milestone 11.2B operator certification repository", () => {
  it("loads active assignable types through the canonical ERP RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ id: "type-1", name: "Forklift", active: true, row_version: 2 }], error: null });
    const client = { schema: vi.fn(() => ({ rpc })) } as never;
    const result = await new SupabaseOperatorCertificationRepository(client).listAssignableTypes();
    expect(result.success).toBe(true);
    expect(rpc).toHaveBeenCalledWith("list_assignable_certification_types");
    expect(result.success && result.value[0]).toMatchObject({ id: "type-1", name: "Forklift", active: true });
  });

  it("uses canonical assignment commands and preserves exact identifiers", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { success: true }, error: null });
    const client = { schema: vi.fn(() => ({ rpc })) } as never;
    const repository = new SupabaseOperatorCertificationRepository(client);
    await repository.assign({ commandId: "command-1", idempotencyKey: "idem-1", operatorId: "operator-1", certificationTypeId: "type-1" });
    await repository.remove({ commandId: "command-2", idempotencyKey: "idem-2", operatorId: "operator-1", certificationTypeId: "type-1" });
    expect(rpc).toHaveBeenNthCalledWith(1, "command_assign_operator_certification", { command: { commandId: "command-1", idempotencyKey: "idem-1", operatorId: "operator-1", certificationTypeId: "type-1" } });
    expect(rpc).toHaveBeenNthCalledWith(2, "command_remove_operator_certification", { command: { commandId: "command-2", idempotencyKey: "idem-2", operatorId: "operator-1", certificationTypeId: "type-1" } });
  });
});
