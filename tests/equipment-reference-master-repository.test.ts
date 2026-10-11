import { describe, expect, it, vi } from "vitest";
import { SupabaseEquipmentReferenceMasterRepository } from "@/integrations/supabase/SupabaseEquipmentReferenceMasterRepository";

const record = { id: "brand-1", code: "BR", name: "Brand", description: null, active: true, rowVersion: 1 };
const client = (rpc: (name: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: null }>) => ({ schema: (_name: string) => ({ rpc }) });

describe("canonical Equipment reference master boundary", () => {
  it("reads canonical active and inactive records without local persistence", async () => {
    const rpc = vi.fn(async () => ({ data: { success: true, items: [record, { ...record, id: "brand-2", active: false }] }, error: null }));
    const repository = new SupabaseEquipmentReferenceMasterRepository(client(rpc));
    await expect(repository.list("brand")).resolves.toEqual({ success: true, value: [record, { ...record, id: "brand-2", active: false }] });
    expect(rpc).toHaveBeenCalledWith("read_equipment_reference_master", { kind: "brand" });
  });
  it("sends create, edit and deactivation through canonical commands", async () => {
    const rpc = vi.fn(async () => ({ data: { success: true, value: record }, error: null }));
    const repository = new SupabaseEquipmentReferenceMasterRepository(client(rpc));
    const base = { kind: "brand" as const, id: record.id, commandId: "c1", idempotencyKey: "c1" };
    await repository.save({ ...base, operation: "CREATE", name: record.name });
    await repository.save({ ...base, operation: "UPDATE", name: "Revised", expectedRowVersion: 1 });
    await repository.save({ ...base, operation: "SET_ACTIVE", active: false, expectedRowVersion: 2 });
    const calls = rpc.mock.calls as unknown as Array<[string, { command: unknown }]>;
    expect(calls.map((call) => call[0])).toEqual(["command_save_equipment_reference_master", "command_save_equipment_reference_master", "command_save_equipment_reference_master"]);
    expect(calls[2]?.[1].command).toMatchObject({ operation: "SET_ACTIVE", active: false, expectedRowVersion: 2 });
  });
  it("preserves permission and concurrency denials without a fallback", async () => {
    const rpc = vi.fn(async () => ({ data: { success: false, code: "FORBIDDEN" }, error: null }));
    const repository = new SupabaseEquipmentReferenceMasterRepository(client(rpc));
    await expect(repository.list("brand")).resolves.toMatchObject({ success: false, code: "FORBIDDEN" });
    await expect(repository.save({ kind: "brand", operation: "CREATE", id: "x", name: "X", commandId: "c", idempotencyKey: "c" })).resolves.toMatchObject({ success: false, code: "FORBIDDEN" });
    rpc.mockResolvedValueOnce({ data: { success: false, code: "CONFLICT" }, error: null });
    await expect(repository.save({ kind: "brand", operation: "UPDATE", id: "x", name: "X", expectedRowVersion: 1, commandId: "c", idempotencyKey: "c" })).resolves.toMatchObject({ success: false, code: "CONFLICT" });
  });
  it("rejects malformed remote responses", async () => {
    const repository = new SupabaseEquipmentReferenceMasterRepository(client(vi.fn(async () => ({ data: { success: true, items: [{ id: "bad" }] }, error: null }))));
    await expect(repository.list("brand")).resolves.toMatchObject({ success: false, code: "INVALID_RESPONSE" });
  });
});
