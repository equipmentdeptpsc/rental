import { beforeEach, describe, expect, it, vi } from "vitest";
import { storage } from "@/core/storage";
import type { DeurRecord } from "@/features/rental/deur/types";

const record = (overrides: Partial<DeurRecord> = {}): DeurRecord => ({
  id: "deur-1", rentalId: "rental-1", equipmentId: "equipment-1", operatorId: "operator-1",
  workDate: "2026-02-27", logs: [], totalOperatingMinutes: 0, totalIdleMinutes: 0,
  totalMaintenanceMinutes: 0, totalMealBreakMinutes: 0, totalMobilizationMinutes: 0,
  totalDemobilizationMinutes: 0, status: "Draft", createdAt: "2026-02-27T00:00:00.000Z",
  updatedAt: "2026-02-27T00:00:00.000Z", operationalMetadata: {
    costCode: { id: "cost-1", code: "5031HEAVYEQPT", name: "Heavy Equipment" },
    activityCode: { id: "activity-1", code: "LDC", name: "LAUCHANCO DEVELOPMENT CORPORATION" },
    workDescription: { id: "work-1", code: "MATERIAL_HAULING", name: "MATERIAL HAULING", requiresRemarks: false },
  }, ...overrides,
});

describe("DEUR operational metadata repository", () => {
  beforeEach(() => { storage.clear(); vi.resetModules(); });

  it("deep-clones metadata on write/read and preserves it through lifecycle transitions", async () => {
    const { deurRepository } = await import("@/features/rental/deur/repository/deurRepository");
    const input = record();
    const created = deurRepository.create(input);
    input.operationalMetadata!.costCode!.name = "Caller mutation";
    created.operationalMetadata!.activityCode!.name = "Returned mutation";
    expect(deurRepository.getById(input.id)?.operationalMetadata).toMatchObject({
      costCode: { name: "Heavy Equipment" }, activityCode: { name: "LAUCHANCO DEVELOPMENT CORPORATION" },
    });
    const read = deurRepository.getById(input.id)!;
    read.operationalMetadata!.workDescription!.name = "Read mutation";
    expect(deurRepository.getById(input.id)?.operationalMetadata?.workDescription?.name).toBe("MATERIAL HAULING");

    const canonical = record({ status: "In Progress", events: [
      { id: "1", activityType: "shift", action: "start", timestamp: "2026-02-27T00:00:00Z", sequence: 1, source: "user" },
      { id: "2", activityType: "operation", action: "start", timestamp: "2026-02-27T00:10:00Z", sequence: 2, source: "user" },
      { id: "3", activityType: "operation", action: "end", timestamp: "2026-02-27T00:50:00Z", sequence: 3, source: "user" },
      { id: "4", activityType: "shift", action: "end", timestamp: "2026-02-27T01:00:00Z", sequence: 4, source: "user" },
    ], legacy: false });
    storage.clear(); deurRepository.create(canonical);
    const submitted = deurRepository.submit(canonical.id, { name: "Admin" });
    expect(submitted.success).toBe(true);
    if (submitted.success) expect(submitted.record.operationalMetadata).toEqual(canonical.operationalMetadata);
  });

  it("loads legacy and malformed records without backfilling or crashing", async () => {
    storage.set("equipment-rental-deur", [record({ operationalMetadata: undefined }), record({ id: "bad", operationalMetadata: { costCode: { code: "", name: "" } } })]);
    const { deurRepository } = await import("@/features/rental/deur/repository/deurRepository");
    expect(deurRepository.getById("deur-1")?.operationalMetadata).toBeUndefined();
    expect(deurRepository.getById("bad")?.operationalMetadata).toEqual({});
  });

  it("preserves and detaches the immutable commercial snapshot across ordinary and inbound updates", async () => {
    const { deurRepository } = await import("@/features/rental/deur/repository/deurRepository");
    const snapshot = { billingMethod:"Per Hour" as const,unitRate:100,minimumBillableHours:0,standbyRate:0,overtimeRate:0,mobilizationFee:0,demobilizationFee:0,fuelCharge:0,operatorIncluded:true,operatorRate:0,taxRate:12,withholdingTax:2,currency:"PHP",capturedAt:"2026-02-27T08:15:00.000Z" };
    deurRepository.create(record({ commercialSnapshot:snapshot,commercialSnapshotRequired:true }));
    const changed=deurRepository.getById("deur-1")!;changed.commercialSnapshot={...snapshot,unitRate:999};deurRepository.update(changed);
    expect(deurRepository.getById("deur-1")?.commercialSnapshot?.unitRate).toBe(100);
    deurRepository.applyInbound(record({commercialSnapshot:undefined,commercialSnapshotRequired:undefined,updatedAt:"later"}));
    const read=deurRepository.getById("deur-1")!;expect(read.commercialSnapshot?.unitRate).toBe(100);read.commercialSnapshot!.unitRate=42;expect(deurRepository.getById("deur-1")?.commercialSnapshot?.unitRate).toBe(100);
  });
});
