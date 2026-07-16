import { beforeEach, describe, expect, it } from "vitest";
import { storage } from "@/core/storage";
import { deurRepository } from "@/features/rental/deur/repository/deurRepository";
import { saveDeurHours } from "@/features/rental/deur/services/saveDeurHours";

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
});
