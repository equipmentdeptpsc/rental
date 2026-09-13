import { describe, expect, it } from "vitest";
import { repositoryFailure } from "@/core/persistence";
import { EquipmentAvailabilityController } from "@/features/equipment/availability/controller";

const result = (available: boolean) => ({ success: true as const, value: { equipmentId: "e", available, conflictCount: available ? 0 : 1, conflicts: [] } });
const request = (key: string, extra = {}) => ({ key, equipmentId: "e", windowStart: "2026-09-01", windowEnd: "2026-09-03", ...extra });

describe("D4B1 availability controller", () => {
  it("handles neutral, checking, available, conflict, and error states", async () => {
    const calls: unknown[] = []; const repo = { checkEquipmentAvailability: async (input: unknown) => { calls.push(input); return result(true); }, searchEquipmentCommitments: async () => { throw new Error(); } };
    const controller = new EquipmentAvailabilityController(repo);
    expect((await controller.check({ ...request("x"), equipmentId: "" })).status).toBe("not_checked");
    const pending = controller.check(request("x")); expect(controller.getState("x").status).toBe("checking"); expect((await pending).status).toBe("available"); expect(calls).toHaveLength(1);
    const conflictRepo = new EquipmentAvailabilityController({ ...repo, checkEquipmentAvailability: async () => result(false) }); expect((await conflictRepo.check(request("x"))).status).toBe("conflict");
    const errorRepo = new EquipmentAvailabilityController({ ...repo, checkEquipmentAvailability: async () => repositoryFailure("REMOTE_READ_FAILED", "read failed") }); expect((await errorRepo.check(request("x"))).status).toBe("error");
  });
  it("propagates explicit source context and isolates keys", async () => {
    let seen: any; const repo = { checkEquipmentAvailability: async (input: any) => { seen = input; return result(true); }, searchEquipmentCommitments: async () => { throw new Error(); } };
    const c = new EquipmentAvailabilityController(repo); await c.check({ ...request("line", { sourceAssignmentId: "a1", windowEnd: "" }), windowEnd: "2026-09-03" }); expect(seen.sourceAssignmentId).toBe("a1");
    const first = new Promise<any>(r => setTimeout(() => r(result(false)), 20)); const second = new Promise<any>(r => setTimeout(() => r(result(true)), 1)); let n = 0; const stale = new EquipmentAvailabilityController({ ...repo, checkEquipmentAvailability: async () => (++n === 1 ? first : second) }); const a = stale.check(request("x")); const b = stale.check({ ...request("x"), windowStart: "2026-09-02" }); await Promise.all([a, b]); expect(stale.getState("x").status).toBe("available");
  });
  it("maps only the canonical write conflict", () => { const c = new EquipmentAvailabilityController({} as any); expect(c.markWriteResult("x", { success: false, code: "EQUIPMENT_INTERVAL_CONFLICT", message: "blocked" }).status).toBe("conflict"); expect(c.markWriteResult("x", { success: false, code: "OTHER" }).status).toBe("conflict"); });
});
