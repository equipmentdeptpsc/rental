import { beforeEach, describe, expect, it, vi } from "vitest";
import { storage } from "@/core/storage";
import { generateDeurNumber, isCanonicalBillingEligible, normalizeDeur } from "@/features/rental/deur/services/canonicalDeur";
import type { DeurRecord } from "@/features/rental/deur/types";

const record = (overrides: Partial<DeurRecord> = {}): DeurRecord => ({
  id: "deur-1", rentalId: "rental-1", equipmentId: "equipment-1", operatorId: "operator-1", workDate: "2026-07-17",
  logs: [], totalOperatingMinutes: 0, totalIdleMinutes: 0, totalMaintenanceMinutes: 0, totalMealBreakMinutes: 0,
  totalMobilizationMinutes: 0, totalDemobilizationMinutes: 0, status: "Draft", createdAt: "2026-07-17T00:00:00.000Z", updatedAt: "2026-07-17T00:00:00.000Z", ...overrides,
});

describe("canonical DEUR foundation", () => {
  beforeEach(() => { storage.clear(); vi.resetModules(); });

  it("generates sequential numbers without reusing gaps or malformed values", () => {
    expect(generateDeurNumber([])).toBe("DEUR-000001");
    expect(generateDeurNumber([record({ deurNumber: "DEUR-000001" }), record({ id: "2", deurNumber: "DEUR-000003" }), record({ id: "bad", deurNumber: "legacy" })])).toBe("DEUR-000004");
  });

  it("normalizes legacy records without inventing events or acknowledgement", () => {
    const legacy = normalizeDeur(record({ totalOperatingMinutes: 90, totalIdleMinutes: 30 }));
    expect(legacy.id).toBe("deur-1");
    expect(legacy.legacy).toBe(true);
    expect(legacy.events).toEqual([]);
    expect(legacy.totals).toMatchObject({ operationMinutes: 90, idleMinutes: 30 });
    expect(legacy.acknowledgedAt).toBeUndefined();
  });

  it("allows only acknowledged canonical, unlocked records for billing", () => {
    expect(isCanonicalBillingEligible(normalizeDeur(record({ status: "Acknowledged", events: [{ id: "e", activityType: "shift", action: "start", timestamp: "2026-07-17T00:00:00.000Z", sequence: 1, source: "user" }], legacy: false })))).toBe(true);
    expect(isCanonicalBillingEligible(normalizeDeur(record({ status: "Submitted", legacy: false, events: [] })))).toBe(false);
    expect(isCanonicalBillingEligible(normalizeDeur(record({ status: "Acknowledged", legacy: false, billingLocked: true, events: [] })))).toBe(false);
  });

  it("persists the same normalized shape returned by creation", async () => {
    const { deurRepository } = await import("@/features/rental/deur/repository/deurRepository");
    const created = deurRepository.create(record());
    expect(deurRepository.getById(created.id)).toEqual(created);
    expect(created.deurNumber).toBe("DEUR-000001");
  });
});
