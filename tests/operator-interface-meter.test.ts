import { beforeEach, describe, expect, it } from "vitest";
import type { DeurRecord } from "@/features/rental/deur/types";
import { setOperatorMeterReading } from "@/features/rental/deur/operator/setOperatorMeterReading";
import { applyDigitalDeurOperatorAction } from "@/features/rental/deur/operator/applyDigitalDeurOperatorAction";
import { createDeur } from "@/features/rental/deur/services/CreateDeurService";
import { storage } from "@/core/storage";
import type { User } from "@/features/auth/domain/user";

const deur = (overrides: Partial<DeurRecord> = {}): DeurRecord => ({
  id: "deur-1", rentalId: "rental-1", assignmentId: "assignment-1",
  equipmentId: "equipment-1", operatorId: "operator-1", workDate: "2026-07-28",
  creationSource: "OPERATOR_DIGITAL", events: [], logs: [],
  totalOperatingMinutes: 0, totalIdleMinutes: 0, totalMaintenanceMinutes: 0,
  totalMealBreakMinutes: 0, totalMobilizationMinutes: 0,
  totalDemobilizationMinutes: 0, status: "Draft",
  createdAt: "2026-07-28T00:00:00Z", updatedAt: "2026-07-28T00:00:00Z",
  ...overrides,
});

describe("operator interface meter readings", () => {
  beforeEach(() => storage.remove("equipment-rental-deur"));
  it("captures valid opening and closing readings without mutating the source", () => {
    const source = deur();
    const opening = setOperatorMeterReading({
      deur: source, phase: "opening", reading: 100,
      readingType: "HOUR_METER", timestamp: "2026-07-28T01:00:00Z",
    });
    expect(opening).toMatchObject({ success: true, record: { openingMeter: 100, meterReadingType: "HOUR_METER" } });
    expect(source.openingMeter).toBeUndefined();
    if (!opening.success) return;
    expect(setOperatorMeterReading({
      deur: opening.record, phase: "closing", reading: 108,
      readingType: "HOUR_METER", timestamp: "2026-07-28T09:00:00Z",
    })).toMatchObject({ success: true, record: { openingMeter: 100, closingMeter: 108 } });
  });

  it.each([
    [{ phase: "opening", reading: -1 }, "non-negative"],
    [{ phase: "closing", reading: 90 }, "lower"],
    [{ phase: "closing", reading: Number.NaN }, "non-negative"],
  ] as const)("rejects invalid readings", (change, message) => {
    const result = setOperatorMeterReading({
      deur: deur({ openingMeter: 100, meterReadingType: "ODOMETER" }),
      phase: change.phase, reading: change.reading, readingType: "ODOMETER",
      timestamp: "2026-07-28T09:00:00Z",
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.message).toContain(message);
  });

  it("adds canonical actor and work-item identity to every created event", () => {
    const result = applyDigitalDeurOperatorAction({
      deur: deur(), action: "START_OPERATION",
      actionTimestamp: "2026-07-28T01:00:00Z",
      actor: { id: "user-1", name: "Operator User" },
      idFactory: (() => { let id = 0; return () => `event-${++id}`; })(),
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.createdEvents).toHaveLength(2);
    expect(result.createdEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({
        actorId: "user-1", deurId: "deur-1", operatorId: "operator-1",
        equipmentId: "equipment-1", assignmentId: "assignment-1",
      }),
    ]));
  });

  it("prevents shift completion until a configured meter has an ending reading", () => {
    const result = applyDigitalDeurOperatorAction({
      deur: deur({
        meterReadingType: "HOUR_METER",
        openingMeter: 100,
        events: [{ id: "shift", activityType: "shift", action: "start", timestamp: "2026-07-28T01:00:00Z", sequence: 1, source: "user" }],
        status: "In Progress",
      }),
      action: "END_SHIFT",
      actionTimestamp: "2026-07-28T09:00:00Z",
      actor: { id: "user-1", name: "Operator User" },
    });
    expect(result).toMatchObject({ success: false, code: "DEUR_CLOSING_METER_REQUIRED" });
  });

  it("does not keep an old equipment-derived meter requirement when current terms require none", () => {
    const result = applyDigitalDeurOperatorAction({
      deur: deur({
        meterReadingType: "HOUR_METER",
        openingMeter: 100,
        events: [{ id: "shift", activityType: "shift", action: "start", timestamp: "2026-07-28T01:00:00Z", sequence: 1, source: "user" }],
        status: "In Progress",
      }),
      action: "END_SHIFT",
      actionTimestamp: "2026-07-28T09:00:00Z",
      actor: { id: "user-1", name: "Operator User" },
      meterRequirement: "none",
    });
    expect(result).toMatchObject({ success: true });
  });

  it("rejects a mismatched linked Operator before persistence", () => {
    const user: User = {
      id: "user-1", username: "operator.user", displayName: "Operator User",
      systemRoles: ["rental-operations"], status: "active", operatorId: "other-operator",
      createdAt: "", updatedAt: "",
    };
    const result = createDeur({
      authenticatedUser: user,
      enforceOperatorOwnership: true,
      rentalId: "rental-1",
      rentalStatus: "Released",
      equipmentId: "equipment-1",
      operatorId: "operator-1",
    });
    expect(result).toMatchObject({ success: false, message: expect.stringContaining("not linked") });
    expect(storage.get("equipment-rental-deur")).toBeNull();
  });
});
