import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { EquipmentAvailabilityController } from "@/features/equipment/availability/controller";
import { SupabaseEquipmentAvailabilityRepository } from "@/integrations/supabase/SupabaseEquipmentAvailabilityRepository";

const success = (available: boolean) => ({ success: true as const, value: { equipmentId: "eq", available, conflictCount: available ? 0 : 1, conflicts: [] } });
const request = { key: "line", equipmentId: "eq", windowStart: "2034-02-10", windowEnd: "2034-02-12", sourceAssignmentId: "assignment" };
const form = readFileSync("src/features/rental/components/RentalForm.tsx", "utf8");

describe("D5F4-R2 bounded Rental availability", () => {
  it("maps a bounded repository request to a distinct safe timeout failure and aborts it", async () => {
    let fire: (() => void) | undefined;
    let aborted = false;
    const requestPromise = new Promise<never>(() => {}) as Promise<never> & { abortSignal(signal: AbortSignal): Promise<never> };
    requestPromise.abortSignal = (signal) => { signal.addEventListener("abort", () => { aborted = true; }); return requestPromise; };
    const rpc = () => requestPromise;
    const repository = new SupabaseEquipmentAvailabilityRepository({ schema: () => ({ rpc }) } as never, { setTimeout: (callback) => { fire = callback; return 0 as never; }, clearTimeout: () => undefined });
    const pending = repository.checkEquipmentAvailability(request);
    await Promise.resolve();
    fire?.();
    const result = await pending;
    expect(result).toMatchObject({ success: false, error: { code: "AVAILABILITY_CHECK_TIMEOUT" } });
    expect(aborted).toBe(true);
  });

  it("turns repository rejection into error and prevents a stale response replacing a newer result", async () => {
    let resolveFirst!: (value: ReturnType<typeof success>) => void;
    const first = new Promise<ReturnType<typeof success>>((resolve) => { resolveFirst = resolve; });
    let calls = 0;
    const controller = new EquipmentAvailabilityController({ checkEquipmentAvailability: () => ++calls === 1 ? first : Promise.resolve(success(true)) } as never);
    const stale = controller.check(request);
    const current = controller.check({ ...request, windowStart: "2034-02-11" });
    await current;
    resolveFirst(success(false));
    await stale;
    expect(controller.getState("line").status).toBe("available");
    const rejected = new EquipmentAvailabilityController({ checkEquipmentAvailability: async () => { throw new Error("transport"); } } as never);
    expect((await rejected.check(request)).status).toBe("error");
  });

  it("fails closed in the form while retaining the selected line and retry inputs", () => {
    expect(form).toContain('status: "error" as const');
    expect(form).toContain('availabilityLines.some((line) => availabilityByKey[line.key]?.status !== "available")');
    expect(form).toMatch(/try\s*\{\s*return \[line\.key, await availabilityController\.check/);
    expect(form).toContain('windowStart: form.dateOut');
    expect(form).toContain('windowEnd: form.expectedReturn || null');
    expect(form).toContain('sourceAssignmentId: line.sourceAssignmentId');
  });
});
