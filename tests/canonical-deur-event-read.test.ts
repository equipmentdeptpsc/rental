import { describe, expect, it } from "vitest";
import { applyCanonicalDeurEventOrder } from "@/integrations/supabase/canonicalDeurEventRead";
import type { CanonicalDeurEvent, DeurRecord } from "@/features/rental/deur/types";

const event = (id: string, sequence: number, action: CanonicalDeurEvent["action"], activityType: CanonicalDeurEvent["activityType"]): CanonicalDeurEvent => ({ id, sequence, physicalSequence: sequence, action, activityType, timestamp: "2026-09-28T05:35:00.000Z", source: "user" });
const record = (events: CanonicalDeurEvent[]): DeurRecord => ({ id: "d1", rentalId: "r1", rentalEquipmentLineId: "line1", equipmentId: "eq1", operatorId: "op1", workDate: "2026-09-28", status: "Acknowledged", createdAt: "2026-09-28T00:00:00.000Z", updatedAt: "2026-09-28T00:00:00.000Z", logs: [], events, totalOperatingMinutes: 1, totalIdleMinutes: 0, totalMaintenanceMinutes: 0, totalMealBreakMinutes: 0, totalMobilizationMinutes: 0, totalDemobilizationMinutes: 0 });

describe("canonical DEUR event read boundary", () => {
  it("applies database logical order while retaining physical sequence", () => {
    const raw = [{ ...event("original", 1, "start", "shift"), superseded: true }, event("operation-start", 2, "start", "operation"), event("operation-end", 3, "end", "operation"), event("shift-end", 4, "end", "shift"), event("replacement", 5, "start", "shift")];
    const result = applyCanonicalDeurEventOrder(record(raw), [
      { event_id: "replacement", physical_sequence: 5, logical_sequence: 1, lineage_root_event_id: "original" },
      { event_id: "operation-start", physical_sequence: 2, logical_sequence: 2, lineage_root_event_id: "operation-start" },
      { event_id: "operation-end", physical_sequence: 3, logical_sequence: 3, lineage_root_event_id: "operation-end" },
      { event_id: "shift-end", physical_sequence: 4, logical_sequence: 4, lineage_root_event_id: "shift-end" },
    ]);
    expect(result).toMatchObject({ success: true, value: { events: [{ id: "replacement", sequence: 1, physicalSequence: 5 }, { id: "operation-start", sequence: 2 }, { id: "operation-end", sequence: 3 }, { id: "shift-end", sequence: 4 }] } });
    expect(raw.map((item) => item.sequence)).toEqual([1, 2, 3, 4, 5]);
  });
  it("fails closed when the projection does not cover the effective raw stream", () => {
    const result = applyCanonicalDeurEventOrder(record([event("event", 1, "start", "shift")]), []);
    expect(result).toMatchObject({ success: false, error: { code: "REMOTE_ROW_MALFORMED" } });
  });
});
