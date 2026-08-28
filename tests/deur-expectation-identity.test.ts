import { beforeEach, describe, expect, it, vi } from "vitest";
import { storage } from "@/core/storage";
import type { DeurRecord } from "@/features/rental/deur/types";
import type { RentalRecord } from "@/features/rental/types";
import { frozenDeurLine } from "./helpers/deurReleaseFixture";

const KEY = "equipment-rental-deur";
const rental = (frequency: "PER_WORKDAY" | "PER_SHIFT"): RentalRecord => ({ id: "r", equipmentId: "e", operatorId: "o", customer: "C", project: "P", rentedBy: "", dateOut: "2026-07-20", statusId: "", status: "Active", deurExpectationPolicy: { frequency, effectiveFrom: "2026-07-20", expectedShiftCodes: frequency === "PER_SHIFT" ? ["DAY", "NIGHT"] : undefined, capturedAt: "2026-07-20T00:00:00Z" } });
const record = (overrides: Partial<DeurRecord> = {}): DeurRecord => ({ id: "d", rentalId: "r", equipmentId: "e", operatorId: "o", workDate: "2026-07-20", shift: "Day", status: "Submitted", legacy: false, events: [], logs: [], totalOperatingMinutes: 0, totalIdleMinutes: 0, totalMaintenanceMinutes: 0, totalMealBreakMinutes: 0, totalMobilizationMinutes: 0, totalDemobilizationMinutes: 0, createdAt: "2026-07-20T00:00:00Z", updatedAt: "2026-07-20T00:00:00Z", ...overrides });

describe("DEUR expectation identity", () => {
  beforeEach(() => { storage.remove(KEY); storage.remove("equipment-rental-deur-sync-queue"); const source=rental("PER_SHIFT"); storage.set("equipment-rental-equipment-lines",{schemaVersion:1,records:[frozenDeurLine({rental:source,equipmentId:"e",operatorId:"o"})]}); vi.resetModules(); });
  it("blocks every second same-workday DEUR regardless of shift or policy label", async () => {
    storage.set(KEY, [record()]);
    const { getDeurCreationError } = await import("@/features/rental/deur/services/CreateDeurService");
    const request = { rentalId: "r", rentalStatus: "Active" as const, equipmentId: "e", operatorId: "o", workDate: "2026-07-20", shift: "Night" as const, rental: rental("PER_SHIFT") };
    expect(getDeurCreationError(request)).toContain("already exists");
    expect(getDeurCreationError({ ...request, shift: "Day" })).toContain("already exists");
    expect(getDeurCreationError({ ...request, rental: rental("PER_WORKDAY") })).toContain("already exists");
  });
  it("does not require shift metadata and rejects invalid calendar dates", async () => {
    const { getDeurCreationError } = await import("@/features/rental/deur/services/CreateDeurService");
    const request = { rentalId: "r", rentalStatus: "Active" as const, equipmentId: "e", operatorId: "o", workDate: "2026-02-30", rental: rental("PER_SHIFT") };
    expect(getDeurCreationError(request)).toContain("valid DEUR work date");
    expect(getDeurCreationError({ ...request, workDate: "2026-07-20" })).toBeUndefined();
  });
  it("keeps canonical work date and shift immutable after submission, including inbound stale updates", async () => {
    const { deurRepository } = await import("@/features/rental/deur/repository/deurRepository");
    deurRepository.create(record());
    deurRepository.update({ ...record(), workDate: "2026-07-21", shift: "Night" });
    expect(deurRepository.getById("d")).toMatchObject({ workDate: "2026-07-20", shift: "Day" });
    deurRepository.applyInbound({ ...record(), workDate: "2026-07-22", shift: "Night" });
    expect(deurRepository.getById("d")).toMatchObject({ workDate: "2026-07-20", shift: "Day" });
  });
});
