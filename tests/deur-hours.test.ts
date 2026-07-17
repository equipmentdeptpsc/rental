import { beforeEach, describe, expect, it, vi } from "vitest";
import { storage } from "@/core/storage";
import { deurRepository } from "@/features/rental/deur/repository/deurRepository";
import { saveDeurHours } from "@/features/rental/deur/services/saveDeurHours";
import { buildBillingPreview } from "@/features/rental/workspace/billing/BillingPreviewBuilder";

const record = () => ({ id: "deur-1", rentalId: "rental-1", equipmentId: "equipment-1", operatorId: "operator-1", workDate: "2026-07-17", logs: [], totalOperatingMinutes: 0, totalIdleMinutes: 0, totalMaintenanceMinutes: 0, totalMealBreakMinutes: 0, totalMobilizationMinutes: 0, totalDemobilizationMinutes: 0, status: "Draft" as const, createdAt: "", updatedAt: "" });
describe("DEUR operator hours", () => {
  beforeEach(() => storage.clear());
  it("persists valid hours and completes the existing record", () => {
    deurRepository.create(record());
    expect(saveDeurHours("deur-1", "20", "4", "2026-07-17", true).success).toBe(true);
    expect(deurRepository.getById("deur-1")).toMatchObject({ totalOperatingMinutes: 1200, totalIdleMinutes: 240, status: "Pending Acknowledgement" });
    expect(deurRepository.getById("deur-1")?.endOfDay).toBeTruthy();
  });
  it("rejects invalid and over-limit hour entries without changing the record", () => {
    deurRepository.create(record());
    expect(saveDeurHours("deur-1", "x", "1", "2026-07-17").success).toBe(false);
    expect(saveDeurHours("deur-1", "-1", "1", "2026-07-17").success).toBe(false);
    expect(saveDeurHours("deur-1", "20", "5", "2026-07-17").success).toBe(false);
    expect(deurRepository.getById("deur-1")?.totalOperatingMinutes).toBe(0);
  });
  it("does not complete when persistence fails", () => {
    deurRepository.create(record());
    const before = structuredClone(deurRepository.getById("deur-1"));
    vi.spyOn(deurRepository, "update").mockReturnValueOnce(undefined);

    expect(saveDeurHours("deur-1", "5", "1", "2026-07-17", true)).toMatchObject({
      success: false,
      message: "DEUR could not be saved.",
    });
    expect(deurRepository.getById("deur-1")).toEqual(before);
  });
  it("keeps completed saved hours discoverable in the billing period after reload", async () => {
    deurRepository.create(record());
    expect(saveDeurHours("deur-1", "5", "1", "2026-07-17", true).success).toBe(true);

    vi.resetModules();
    const { deurRepository: reloaded } = await import("@/features/rental/deur/repository/deurRepository");
    const completed = reloaded.getById("deur-1");
    const lines = buildBillingPreview([completed!], {
      id: "contract-1", contractNo: "C-001", customerId: "customer-1", equipmentId: "equipment-1", projectId: "project-1",
      rentalType: "Operated Rental", billingMethod: "Per Hour", currency: "PHP", unitRate: 100, operatorIncluded: true,
      startDate: "2026-07-01", expectedEndDate: "2026-07-31", status: "Active", createdAt: "", updatedAt: "",
    }, "2026-07-17", "2026-07-17");

    expect(completed).toMatchObject({ totalOperatingMinutes: 300, totalIdleMinutes: 60, endOfDay: expect.any(String) });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ deurId: "deur-1", workDate: "2026-07-17", operatingHours: 5 });
  });
  it("does not overwrite or duplicate a DEUR when Complete End Day is repeated", () => {
    deurRepository.create(record());
    expect(saveDeurHours("deur-1", "5", "1", "2026-07-17", true).success).toBe(true);
    const completed = structuredClone(deurRepository.getById("deur-1"));

    expect(saveDeurHours("deur-1", "5", "1", "2026-07-17", true).success).toBe(false);
    expect(deurRepository.getByRentalId("rental-1")).toHaveLength(1);
    expect(deurRepository.getById("deur-1")).toEqual(completed);
  });
});
