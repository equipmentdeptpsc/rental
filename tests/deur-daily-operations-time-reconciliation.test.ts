import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { calculateDeurBillingStatementLine } from "@/features/rental/billingstatement/services/calculateDeurBillingStatementLine";
import type { DeurRecord, CanonicalDeurEvent } from "@/features/rental/deur/types";
import type { RentalEquipmentLine } from "@/features/rental/equipment-line";
import { buildRentalLineOperations } from "@/features/rental/workspace/deur/buildRentalLineOperations";

const line: RentalEquipmentLine = {
  id: "line-1",
  rentalId: "rental-1",
  equipmentId: "equipment-1",
  operatorId: "operator-1",
  assignmentId: "assignment-1",
  status: "Active",
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
};

function event(id: string, activityType: CanonicalDeurEvent["activityType"], action: CanonicalDeurEvent["action"], timestamp: string, sequence: number): CanonicalDeurEvent {
  return { id, activityType, action, timestamp, sequence, source: "user" };
}

function record(overrides: Partial<DeurRecord> = {}): DeurRecord {
  return {
    id: "deur-1",
    deurNumber: "DEUR-000001",
    rentalId: line.rentalId,
    rentalEquipmentLineId: line.id,
    equipmentId: line.equipmentId,
    operatorId: line.operatorId,
    creationSource: "OPERATOR_DIGITAL",
    workDate: "2026-10-01",
    status: "Acknowledged",
    legacy: false,
    events: [
      event("shift-start", "shift", "start", "2026-10-01T00:00:00.000Z", 1),
      event("operation-start", "operation", "start", "2026-10-01T00:30:00.000Z", 2),
      event("operation-end", "operation", "end", "2026-10-01T02:30:00.000Z", 3),
      event("shift-end", "shift", "end", "2026-10-01T03:00:00.000Z", 4),
    ],
    totals: { shiftMinutes: 999, operationMinutes: 999, idleMinutes: 999, standbyMinutes: 999, mealBreakMinutes: 999, breakdownMinutes: 999 },
    logs: [],
    totalOperatingMinutes: 120,
    totalIdleMinutes: 0,
    totalStandbyMinutes: 0,
    totalMaintenanceMinutes: 0,
    totalMealBreakMinutes: 0,
    totalMobilizationMinutes: 0,
    totalDemobilizationMinutes: 0,
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T03:00:00.000Z",
    ...overrides,
  };
}

function summary(deurs: DeurRecord[], evaluatedAt = "2026-10-02T00:00:00.000Z") {
  return buildRentalLineOperations({ lines: [line], deurs, evaluatedAt })[0];
}

describe("Daily Operations canonical DEUR time reconciliation", () => {
  it("uses approved persisted category totals for a normal completed shift", () => {
    const result = summary([record({ totalOperatingMinutes: 120, totalIdleMinutes: 30, totalStandbyMinutes: 15, totalMealBreakMinutes: 45, totalMaintenanceMinutes: 20 })]);

    expect(result).toMatchObject({
      projectedOperationMinutes: 120,
      idleMinutes: 30,
      standbyMinutes: 15,
      mealBreakMinutes: 45,
      breakdownMinutes: 20,
      shiftMinutes: 180,
    });
  });

  it("keeps standby and meal-break evidence separate in the submitted eDEUR summary", () => {
    const source = readFileSync("src/pages/OperatorDeur/index.tsx", "utf8");
    expect(source).toContain("submitted.totalStandbyMinutes ?? 0");
    expect(source).toContain("Meal Break {(submitted.totalMealBreakMinutes / 60).toFixed(2)} h");
    expect(source).not.toContain("Standby {(submitted.totalMealBreakMinutes / 60).toFixed(2)} h");
  });

  it("derives elapsed shift time from canonical instants across midnight", () => {
    const overnight = record({
      workDate: "2026-10-01",
      events: [
        event("s", "shift", "start", "2026-10-01T12:00:00.000Z", 1),
        event("o1", "operation", "start", "2026-10-01T13:00:00.000Z", 2),
        event("o2", "operation", "end", "2026-10-01T20:00:00.000Z", 3),
        event("e", "shift", "end", "2026-10-01T21:00:00.000Z", 4),
      ],
      totalOperatingMinutes: 420,
    });

    expect(summary([overnight])).toMatchObject({ projectedOperationMinutes: 420, shiftMinutes: 540 });
  });

  it("keeps a live DEUR ahead of completed entries while projecting every active time category", () => {
    const completed = record({ id: "completed", workDate: "2026-10-02", updatedAt: "2026-10-02T10:00:00.000Z" });
    const active = record({
      id: "active",
      workDate: "2026-10-01",
      status: "In Progress",
      updatedAt: "2026-10-01T01:00:00.000Z",
      events: [
        event("s", "shift", "start", "2026-10-01T00:00:00.000Z", 1),
        event("o1", "operation", "start", "2026-10-01T00:10:00.000Z", 2),
        event("o2", "operation", "end", "2026-10-01T00:40:00.000Z", 3),
        event("i1", "idle", "start", "2026-10-01T00:40:00.000Z", 4),
      ],
      totalOperatingMinutes: 0,
      totalIdleMinutes: 0,
    });

    expect(summary([completed, active], "2026-10-01T01:10:00.000Z")).toMatchObject({
      deur: { id: "active" },
      projectedOperationMinutes: 30,
      idleMinutes: 30,
      shiftMinutes: 70,
    });
  });

  it("selects the return-day DEUR instead of an older DEUR corrected later", () => {
    const correctedOlder = record({ id: "older", workDate: "2026-10-01", updatedAt: "2026-10-10T10:00:00.000Z", totalOperatingMinutes: 60 });
    const returnDay = record({ id: "return", workDate: "2026-10-05", updatedAt: "2026-10-05T10:00:00.000Z", totalOperatingMinutes: 180 });

    expect(summary([correctedOlder, returnDay])).toMatchObject({ deur: { id: "return" }, projectedOperationMinutes: 180 });
  });

  it("does not let a missing end event grow an immutable DEUR after submission", () => {
    const incomplete = record({
      status: "Submitted",
      events: [
        event("s", "shift", "start", "2026-10-01T00:00:00.000Z", 1),
        event("o", "operation", "start", "2026-10-01T00:30:00.000Z", 2),
      ],
      totalOperatingMinutes: 37,
    });

    const result = summary([incomplete], "2026-10-10T00:00:00.000Z");
    expect(result.projectedOperationMinutes).toBe(37);
    expect(result.issue).toContain("canonical persisted totals");
  });

  it("uses the canonical local work date instead of re-bucketing UTC timestamps", () => {
    const manilaDay = record({ id: "manila-day", workDate: "2026-10-02", updatedAt: "2026-10-01T16:05:00.000Z", totalOperatingMinutes: 90 });
    const priorLocalDay = record({ id: "prior-day", workDate: "2026-10-01", updatedAt: "2026-10-01T23:59:00.000Z", totalOperatingMinutes: 240 });

    expect(summary([priorLocalDay, manilaDay])).toMatchObject({ deur: { id: "manila-day" }, projectedOperationMinutes: 90 });
  });

  it("reconciles operating evidence with billing while keeping minimum approved billable hours separate", () => {
    const deur = record();
    const daily = summary([deur]);
    const actual = calculateDeurBillingStatementLine(deur, { billingMethod: "Per Hour", unitRate: 100, operatorIncluded: true });
    const approvedMinimum = calculateDeurBillingStatementLine(deur, { billingMethod: "Per Hour", unitRate: 100, minimumBillableHours: 8, operatorIncluded: true });

    expect(daily.projectedOperationMinutes).toBe(120);
    expect(actual).toMatchObject({ success: true, charges: { operatingHours: 2, operatingCharge: 200 } });
    expect(approvedMinimum).toMatchObject({ success: true, charges: { operatingHours: 8, operatingCharge: 800 } });
  });
});
