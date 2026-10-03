import { describe, expect, it } from "vitest";
import { resolveRentalBillingReadiness } from "@/features/rental/billing/resolveRentalBillingReadiness";
import type { DeurRecord } from "@/features/rental/deur/types";
import type { RentalEquipmentLine } from "@/features/rental/equipment-line";

const line = (id: string, equipmentId = id): RentalEquipmentLine => ({ id, rentalId: "rental-1", equipmentId, assignmentId: `assignment-${id}`, operatorId: `operator-${id}`, status: "Active", commercialSnapshotRequired: true, commercialSnapshot: { billingMethod: "Per Hour", unitRate: 100, currency: "PHP", operatorIncluded: true, capturedAt: "2026-09-01T00:00:00.000Z" } } as RentalEquipmentLine);
const deur = (id: string, lineId: string, overrides: Partial<DeurRecord> = {}): DeurRecord => ({ id, rentalId: "rental-1", rentalEquipmentLineId: lineId, equipmentId: lineId, operatorId: `operator-${lineId}`, workDate: "2026-09-01", reportDate: "2026-09-01", events: [], logs: [], totalOperatingMinutes: 0, totalIdleMinutes: 0, totalMaintenanceMinutes: 0, totalMealBreakMinutes: 0, totalMobilizationMinutes: 0, totalDemobilizationMinutes: 0, status: "Acknowledged", legacy: false, billingLocked: false, createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z", commercialSnapshot: { billingMethod: "Per Hour", unitRate: 100, currency: "PHP", operatorIncluded: true, capturedAt: "2026-09-01T00:00:00.000Z" }, ...overrides } as DeurRecord);
const eligibleEvents = [
  { id: "shift-start", activityType: "shift", action: "start", timestamp: "2026-09-01T00:00:00.000Z", sequence: 1, source: "user" as const },
  { id: "operation-start", activityType: "operation", action: "start", timestamp: "2026-09-01T01:00:00.000Z", sequence: 2, source: "user" as const },
  { id: "operation-end", activityType: "operation", action: "end", timestamp: "2026-09-01T02:00:00.000Z", sequence: 3, source: "user" as const },
  { id: "shift-end", activityType: "shift", action: "end", timestamp: "2026-09-01T03:00:00.000Z", sequence: 4, source: "user" as const },
];
const completedZeroEvents = [
  { id: "shift-start", activityType: "shift", action: "start", timestamp: "2026-09-01T00:00:00.000Z", sequence: 1, source: "user" as const },
  { id: "shift-end", activityType: "shift", action: "end", timestamp: "2026-09-01T00:01:00.000Z", sequence: 2, source: "user" as const },
];

describe("rental billing readiness", () => {
  it("blocks when one acknowledged effective DEUR has no billable activity", () => {
    const result = resolveRentalBillingReadiness({ rentalEquipmentLines: [line("line-1"), line("line-2")], deurs: [deur("ready", "line-1", { events: eligibleEvents }), deur("zero", "line-2", { deurNumber: "DEUR-2026-000023", events: completedZeroEvents })] });
    expect(result.ready).toBe(false);
    expect(result.issues).toEqual(expect.arrayContaining([expect.objectContaining({ deurNumber: "DEUR-2026-000023", code: "NO_BILLABLE_ACTIVITY" })]));
  });

  it("is ready only when every effective DEUR is acknowledged and eligible", () => {
    const result = resolveRentalBillingReadiness({ rentalEquipmentLines: [line("line-1"), line("line-2")], deurs: [deur("ready-1", "line-1", { events: eligibleEvents }), deur("ready-2", "line-2", { events: eligibleEvents })] });
    expect(result).toMatchObject({ ready: true, issues: [] });
  });

  it("blocks an unacknowledged required DEUR", () => {
    const result = resolveRentalBillingReadiness({ rentalEquipmentLines: [line("line-1")], deurs: [deur("submitted", "line-1", { status: "Submitted", events: eligibleEvents })] });
    expect(result).toMatchObject({ ready: false });
    expect(result.issues[0].code).toBe("NOT_ACKNOWLEDGED");
  });

  it("reports NO_BILLABLE_ACTIVITY for a zero-minute Per Hour DEUR", () => {
    const result = resolveRentalBillingReadiness({ rentalEquipmentLines: [line("line-1")], deurs: [deur("zero", "line-1", { events: completedZeroEvents })] });
    expect(result.issues[0]).toMatchObject({ code: "NO_BILLABLE_ACTIVITY", message: "The DEUR has no billable operational evidence." });
  });

  it("matches canonical preview eligibility decisions", () => {
    const blocked = resolveRentalBillingReadiness({ rentalEquipmentLines: [line("line-1")], deurs: [deur("zero", "line-1", { events: completedZeroEvents })] });
    const ready = resolveRentalBillingReadiness({ rentalEquipmentLines: [line("line-1")], deurs: [deur("ready", "line-1", { events: eligibleEvents })] });
    expect(blocked.ready).toBe(false);
    expect(ready.ready).toBe(true);
  });

  it("is read-only and creates no billing or invoice records", () => {
    const records = [deur("zero", "line-1", { events: completedZeroEvents })];
    const before = structuredClone(records);
    resolveRentalBillingReadiness({ rentalEquipmentLines: [line("line-1")], deurs: records });
    expect(records).toEqual(before);
  });
});
