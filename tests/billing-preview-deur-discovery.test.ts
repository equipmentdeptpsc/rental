import { beforeEach, describe, expect, it, vi } from "vitest";
import { storage } from "@/core/storage";
import { deurRepository } from "@/features/rental/deur/repository/deurRepository";
import { saveDeurHours } from "@/features/rental/deur/services/saveDeurHours";
import {
  getCompletedDeursForBillingPeriod,
  getDeurPreviewReference,
  resolveDefaultBillingPeriodDate,
} from "@/features/rental/workspace/billing/BillingPreviewBuilder";

const record = () => ({
  id: "deur-1",
  rentalId: "rental-1",
  equipmentId: "equipment-1",
  operatorId: "operator-1",
  workDate: "2026-07-17",
  logs: [],
  totalOperatingMinutes: 0,
  totalIdleMinutes: 0,
  totalMaintenanceMinutes: 0,
  totalMealBreakMinutes: 0,
  totalMobilizationMinutes: 0,
  totalDemobilizationMinutes: 0,
  status: "Draft" as const,
  createdAt: "",
  updatedAt: "",
});

describe("completed DEUR billing preview discovery", () => {
  beforeEach(() => storage.clear());

  it("finds a completed persisted DEUR in its work-date billing period without a rental contract", async () => {
    deurRepository.create(record());
    expect(saveDeurHours("deur-1", "5", "1", "2026-07-17", true).success).toBe(true);

    vi.resetModules();
    const { deurRepository: reloaded } = await import("@/features/rental/deur/repository/deurRepository");
    const discovered = getCompletedDeursForBillingPeriod(
      reloaded.getByRentalId("rental-1"),
      "2026-07-01",
      "2026-07-31"
    );

    expect(discovered).toHaveLength(1);
    expect(discovered[0]).toMatchObject({
      id: "deur-1",
      rentalId: "rental-1",
      workDate: "2026-07-17",
      totalOperatingMinutes: 300,
      totalIdleMinutes: 60,
      endOfDay: expect.any(String),
    });
    expect(getDeurPreviewReference(discovered[0])).toBe("DEUR-000001");
  });

  it("keeps two different completed DEURs as separate, stably identified preview rows", () => {
    deurRepository.create(record());
    saveDeurHours("deur-1", "5", "1", "2026-07-17", true);
    deurRepository.create({
      ...record(),
      id: "deur-2",
      deurNumber: "DEUR-000002",
      endOfDay: "2026-07-17T17:00:00.000Z",
      status: "Pending Acknowledgement",
    });

    const discovered = getCompletedDeursForBillingPeriod(
      deurRepository.getByRentalId("rental-1"),
      "2026-07-01",
      "2026-07-31"
    );

    expect(discovered).toHaveLength(2);
    expect(discovered.map(getDeurPreviewReference)).toEqual(["DEUR-000001", "DEUR-000002"]);
    expect(getDeurPreviewReference({ ...record(), id: "canonical-id", deurNumber: "   " })).toBe("DEUR number unavailable");
  });

  it("includes and excludes completed DEURs strictly by persisted workDate", () => {
    deurRepository.create(record());
    saveDeurHours("deur-1", "5", "1", "2026-07-17", true);
    const deurs = deurRepository.getByRentalId("rental-1");

    expect(getCompletedDeursForBillingPeriod(deurs, "2026-07-17", "2026-07-17")).toHaveLength(1);
    expect(getCompletedDeursForBillingPeriod(deurs, "2026-07-18", "2026-07-31")).toHaveLength(0);
  });

  it("does not duplicate a completed DEUR after repeated completion", () => {
    deurRepository.create(record());
    expect(saveDeurHours("deur-1", "5", "1", "2026-07-17", true).success).toBe(true);
    expect(saveDeurHours("deur-1", "5", "1", "2026-07-17", true).success).toBe(false);

    expect(getCompletedDeursForBillingPeriod(
      deurRepository.getByRentalId("rental-1"),
      "2026-07-01",
      "2026-07-31"
    )).toHaveLength(1);
  });

  it("defaults the period to the latest unconsumed acknowledged DEUR date", () => {
    const acknowledged = { ...record(), status: "Acknowledged" as const, reportDate: "2026-08-26" };
    expect(resolveDefaultBillingPeriodDate([
      { ...acknowledged, id: "older", reportDate: "2026-08-25" },
      acknowledged,
      { ...acknowledged, id: "consumed", reportDate: "2026-08-27", billingLocked: true },
    ], "2026-08-27")).toBe("2026-08-26");
    expect(resolveDefaultBillingPeriodDate([], "2026-08-27")).toBe("2026-08-27");
  });
});
