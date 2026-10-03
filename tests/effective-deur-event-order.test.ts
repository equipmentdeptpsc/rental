import { describe, expect, it } from "vitest";
import { evaluateDeurBillingEligibility } from "@/features/rental/deur/billing/evaluateDeurBillingEligibility";
import { calculateDeurTotals } from "@/features/rental/deur/services/calculateDeurTotals";
import { orderEffectiveDeurEvents } from "@/features/rental/deur/services/effectiveDeurEventOrder";
import type { CanonicalDeurEvent, DeurRecord } from "@/features/rental/deur/types";

const event = (id: string, activityType: CanonicalDeurEvent["activityType"], action: CanonicalDeurEvent["action"], timestamp: string, physicalSequence: number, extras: Partial<CanonicalDeurEvent> = {}): CanonicalDeurEvent => ({ id, activityType, action, timestamp, sequence: physicalSequence, physicalSequence, source: "user", ...extras });
const record = (events: CanonicalDeurEvent[]): DeurRecord => ({ id: "deur-1", rentalId: "rental-1", rentalEquipmentLineId: "line-1", equipmentId: "equipment-1", operatorId: "operator-1", workDate: "2026-09-01", logs: [], totalOperatingMinutes: 0, totalIdleMinutes: 0, totalMaintenanceMinutes: 0, totalMealBreakMinutes: 0, totalMobilizationMinutes: 0, totalDemobilizationMinutes: 0, status: "Acknowledged", createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z", commercialSnapshot: { billingMethod: "Per Hour", unitRate: 1, currency: "PHP", operatorIncluded: true, capturedAt: "2026-09-01T00:00:00.000Z" }, events });

describe("effective DEUR logical order", () => {
  it("places an appended terminal replacement in its original logical slot without changing raw input", () => {
    const raw = [event("original", "shift", "start", "2026-09-01T05:35:00.000Z", 1, { superseded: true }), event("operation-start", "operation", "start", "2026-09-01T05:35:00.000Z", 2), event("operation-end", "operation", "end", "2026-09-01T05:36:00.000Z", 3), event("shift-end", "shift", "end", "2026-09-01T05:36:00.000Z", 4), event("replacement", "shift", "start", "2026-09-01T05:35:00.000Z", 5, { replacesEventId: "original" })];
    const before = structuredClone(raw);
    const effective = orderEffectiveDeurEvents({ creationSource: "MANUAL_WEB", events: raw });
    expect(effective.map((item) => item.id)).toEqual(["replacement", "operation-start", "operation-end", "shift-end"]);
    expect(effective.map((item) => item.sequence)).toEqual([1, 2, 3, 4]);
    expect(raw).toEqual(before);
    expect(evaluateDeurBillingEligibility({ deur: record(effective), billingMethod: "Per Hour", unitRate: 1 })).toMatchObject({ eligible: true, reasonCode: "ELIGIBLE" });
  });
  it("uses the terminal replacement for a multi-generation lineage", () => {
    const raw = [event("original", "shift", "start", "2026-09-01T05:35:00.000Z", 1, { superseded: true }), event("operation-start", "operation", "start", "2026-09-01T05:35:00.000Z", 2), event("operation-end", "operation", "end", "2026-09-01T05:36:00.000Z", 3), event("shift-end", "shift", "end", "2026-09-01T05:36:00.000Z", 4), event("replacement-1", "shift", "start", "2026-09-01T05:35:00.000Z", 5, { superseded: true, replacesEventId: "original" }), event("replacement-2", "shift", "start", "2026-09-01T05:35:00.000Z", 6, { replacesEventId: "replacement-1" })];
    expect(orderEffectiveDeurEvents({ creationSource: "MANUAL_WEB", events: raw }).map((item) => item.id)).toEqual(["replacement-2", "operation-start", "operation-end", "shift-end"]);
  });
  it("uses the established manual physical-occurrence rule for the sibling stream", () => {
    const effective = orderEffectiveDeurEvents({ creationSource: "MANUAL_WEB", events: [event("shift-start", "shift", "start", "2026-09-01T02:19:03.000Z", 1), event("operation-start", "operation", "start", "2026-09-01T02:19:03.000Z", 2), event("shift-end", "shift", "end", "2026-09-01T05:13:00.000Z", 3), event("operation-end", "operation", "end", "2026-09-01T05:12:00.000Z", 4)] });
    expect(effective.map((item) => item.id)).toEqual(["shift-start", "operation-start", "operation-end", "shift-end"]);
    expect(calculateDeurTotals(effective).totals.operationMinutes).toBe(173);
    expect(evaluateDeurBillingEligibility({ deur: record(effective), billingMethod: "Per Hour", unitRate: 1 })).toMatchObject({ eligible: true, reasonCode: "ELIGIBLE" });
  });
  it("keeps a valid zero-activity timeline non-billable", () => {
    const effective = orderEffectiveDeurEvents({ creationSource: "MANUAL_WEB", events: [event("shift-start", "shift", "start", "2026-09-01T02:19:03.000Z", 1), event("shift-end", "shift", "end", "2026-09-01T02:19:03.000Z", 2)] });
    expect(evaluateDeurBillingEligibility({ deur: record(effective), billingMethod: "Per Hour", unitRate: 1 })).toMatchObject({ eligible: false, reasonCode: "NO_BILLABLE_ACTIVITY" });
  });
  it("preserves rejection of a genuinely invalid non-superseded history", () => {
    const effective = orderEffectiveDeurEvents({ creationSource: "MANUAL_WEB", events: [event("shift-start", "shift", "start", "2026-09-01T00:00:00.000Z", 1), event("shift-start-duplicate", "shift", "start", "2026-09-01T00:01:00.000Z", 2), event("shift-end", "shift", "end", "2026-09-01T00:02:00.000Z", 3)] });
    expect(evaluateDeurBillingEligibility({ deur: record(effective), billingMethod: "Per Hour", unitRate: 1 })).toMatchObject({ eligible: false, reasonCode: "INVALID_EVENT_HISTORY" });
  });
});
