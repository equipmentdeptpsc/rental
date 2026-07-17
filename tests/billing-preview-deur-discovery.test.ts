import { beforeEach, describe, expect, it, vi } from "vitest";
import { storage } from "@/core/storage";
import { deurRepository } from "@/features/rental/deur/repository/deurRepository";
import { saveDeurHours } from "@/features/rental/deur/services/saveDeurHours";
import { getCompletedDeursForBillingPeriod } from "@/features/rental/workspace/billing/BillingPreviewBuilder";

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
});
