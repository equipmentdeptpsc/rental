import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

import { EquipmentAvailabilityController } from "@/features/equipment/availability/controller";
import { SupabaseEquipmentAvailabilityRepository } from "@/integrations/supabase/SupabaseEquipmentAvailabilityRepository";

const migration = readFileSync("supabase/migrations/20260911000400_support_open_ended_equipment_availability_read.sql", "utf8");

describe("D4B3A open-ended canonical availability read", () => {
  it("preserves both established RPC signatures with forward-only replacements", () => {
    expect(migration).toContain("CREATE OR REPLACE FUNCTION erp.check_equipment_availability(");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION erp.check_equipment_availability_for_pending_rental(");
    expect(migration).toContain("p_window_end date");
    expect(migration).not.toMatch(/DROP\s+FUNCTION/i);
  });

  it("keeps finite inclusive behavior and accepts NULL as an open-ended requested end", () => {
    expect(migration).toContain("p_window_end IS NOT NULL AND p_window_start > p_window_end");
    expect(migration).toContain("p_window_end IS NOT NULL AND p_window_end - p_window_start > 92");
    expect(migration).toContain("(p_window_end IS NULL OR commitment.commitment_start <= p_window_end)");
    expect(migration).toContain("(commitment.commitment_end IS NULL OR commitment.commitment_end >= p_window_start)");
  });

  it("covers finite and open-ended canonical interval cases with inclusive endpoints", () => {
    const overlaps = (requestStart: string, requestEnd: string | null, commitmentStart: string, commitmentEnd: string | null) =>
      (requestEnd === null || commitmentStart <= requestEnd) && (commitmentEnd === null || commitmentEnd >= requestStart);
    expect(overlaps("2031-04-10", "2031-04-12", "2031-04-13", "2031-04-14")).toBe(false);
    expect(overlaps("2031-04-10", "2031-04-12", "2031-04-12", "2031-04-13")).toBe(true);
    expect(overlaps("2031-04-13", null, "2031-04-10", "2031-04-12")).toBe(false);
    expect(overlaps("2031-04-12", null, "2031-04-10", "2031-04-12")).toBe(true);
    expect(overlaps("2031-04-10", null, "2031-04-20", null)).toBe(true);
    expect(overlaps("2031-04-10", null, "2031-04-20", "2031-04-21")).toBe(true);
  });

  it("keeps the relationship-aware exact source exemption null-safe and aligned", () => {
    expect(migration).toContain("PERFORM * FROM erp.check_equipment_availability(p_equipment_id, p_window_start, p_window_end)");
    expect(migration).toContain("assignment.expected_return IS NOT DISTINCT FROM p_window_end");
    expect(migration).toContain("(p_window_end IS NULL OR c.commitment_start <= p_window_end)");
    expect(migration).toContain("AND EXISTS (SELECT 1 FROM exact_source)");
  });

  it("sends a NULL end through the ordinary and relationship-aware RPCs", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ equipment_id: "e1", available: true, conflict_count: 0 }], error: null });
    const repository = new SupabaseEquipmentAvailabilityRepository({ schema: vi.fn(() => ({ rpc })) } as never);
    await repository.checkEquipmentAvailability({ equipmentId: "e1", windowStart: "2031-04-10", windowEnd: null });
    expect(rpc).toHaveBeenLastCalledWith("check_equipment_availability", { p_equipment_id: "e1", p_window_start: "2031-04-10", p_window_end: null });
    await repository.checkEquipmentAvailability({ equipmentId: "e1", windowStart: "2031-04-10", windowEnd: null, sourceAssignmentId: "a1" });
    expect(rpc).toHaveBeenLastCalledWith("check_equipment_availability_for_pending_rental", { p_equipment_id: "e1", p_window_start: "2031-04-10", p_window_end: null, p_source_assignment_id: "a1" });
  });

  it("allows the existing controller to check, rather than neutralize, an open-ended request", async () => {
    const checkEquipmentAvailability = vi.fn().mockResolvedValue({ success: true, value: { equipmentId: "e1", available: false, conflictCount: 1, conflicts: [] } });
    const controller = new EquipmentAvailabilityController({ checkEquipmentAvailability, searchEquipmentCommitments: vi.fn() });
    await expect(controller.check({ key: "assignment", equipmentId: "e1", windowStart: "2031-04-10", windowEnd: null })).resolves.toMatchObject({ status: "conflict" });
    expect(checkEquipmentAvailability).toHaveBeenCalledWith(expect.objectContaining({ windowEnd: null }));
  });
});
