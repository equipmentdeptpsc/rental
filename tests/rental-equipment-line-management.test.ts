import { beforeEach, describe, expect, it } from "vitest";
import { storage } from "@/core/storage";
import type { RentalRecord } from "@/features/rental/types";
import type { RentalEquipmentLine } from "@/features/rental/equipment-line";
import { rentalEquipmentLineRepository } from "@/features/rental/equipment-line";
import { canRemoveRentalEquipmentLine, validateRentalEquipmentLineInputs } from "@/features/rental/services/manageRentalEquipmentLines";
import { prepareRentalEquipmentLineRelease } from "@/features/rental/services/prepareRentalEquipmentLineRelease";
import { configureRentalCommercialTerms } from "@/features/rental/services/configureRentalCommercialTerms";
import { rentalContractRepository } from "@/features/rental/repository/rentalContractRepository";
import { resolveRentalWorkspaceEquipmentLines } from "@/features/rental/workspace/resolveRentalWorkspaceEquipmentLines";
import { createApplicationBackup, restoreApplicationBackup, validateApplicationBackup } from "@/features/settings/services/applicationBackupService";

const rental = (status: RentalRecord["status"] = "Reserved"): RentalRecord => ({ id: "rental-1", rentalNumber: "R-1", equipmentId: "", customerId: "customer-1", projectId: "project-1", customer: "Customer", project: "Project", rentedBy: "", dateOut: "2026-07-20", statusId: "", status, rentalType: "Operated Rental" });
const line = (id: string, equipmentId: string, operatorId = `operator-${id}`): RentalEquipmentLine => ({ id, rentalId: "rental-1", equipmentId, assignmentId: `assignment-${id}`, operatorId, status: "Reserved", commercialSnapshotRequired: true, createdAt: "2026-07-20T00:00:00.000Z", updatedAt: "2026-07-20T00:00:00.000Z" });
const machine = (id: string, status: "Available" | "Assigned" | "Rented" | "Maintenance" = "Assigned") => ({ id, prefixId: "", assetNo: id, equipmentName: id, category: "Moving Equipment" as const, maintenanceType: "Engine Hours" as const, currentReading: 0, projectId: "project-1", operatorId: `operator-line-${id.slice(-1)}`, status });
const assignment = (id: string, equipmentId: string, operatorId: string) => ({ id, equipmentId, operatorId, projectId: "project-1", assignedDate: "2026-07-19", expectedReturn: "2026-07-30", remarks: "", status: "Active" as const });
const contractFor = (equipmentLine: RentalEquipmentLine, method: "Per Hour" | "Per Day", rate: number) => {
  const result = configureRentalCommercialTerms({ rental: rental(), line: equipmentLine, equipmentId: equipmentLine.equipmentId, commercialTerms: { billingMethod: method, currency: "PHP", unitRate: rate, operatorIncluded: true, transactionRelationship: "Non-Affiliate", vatApplicability: "Applicable", taxRate: 12 }, timestamp: "2026-07-20T00:00:00.000Z" });
  if (!result.success) throw new Error(result.message); return result.contract;
};

describe("Rental Equipment Line management", () => {
  beforeEach(() => storage.clear());

  it("persists one or multiple lines and rejects duplicate equipment", () => {
    expect(rentalEquipmentLineRepository.createMany([line("line-1", "equipment-1")]).success).toBe(true);
    expect(rentalEquipmentLineRepository.getByRentalId("rental-1")).toHaveLength(1);
    expect(rentalEquipmentLineRepository.createMany([line("line-2", "equipment-2")]).success).toBe(true);
    expect(rentalEquipmentLineRepository.getByRentalId("rental-1")).toHaveLength(2);
    expect(rentalEquipmentLineRepository.createMany([line("line-3", "equipment-2")])).toMatchObject({ success: false, message: expect.stringContaining("Duplicate") });
  });

  it("rejects unavailable equipment, rental conflicts, and cross-project assignments", () => {
    const requested = [{ equipmentId: "equipment-1", operatorId: "operator-1", assignmentId: "assignment-1" }];
    expect(validateRentalEquipmentLineInputs({ rental: rental(), requested, existingLines: [], assignments: [assignment("assignment-1", "equipment-1", "operator-1")], equipment: [machine("equipment-1", "Maintenance")], blockingEquipmentIds: new Set() })).toEqual([expect.objectContaining({ code: "EQUIPMENT_UNAVAILABLE", equipmentId: "equipment-1" })]);
    expect(validateRentalEquipmentLineInputs({ rental: rental(), requested, existingLines: [], assignments: [assignment("assignment-1", "equipment-1", "operator-1")], equipment: [machine("equipment-1")], blockingEquipmentIds: new Set(["equipment-1"]) })).toEqual([expect.objectContaining({ code: "EQUIPMENT_RENTAL_CONFLICT" })]);
    expect(validateRentalEquipmentLineInputs({ rental: { ...rental(), projectId: "other" }, requested, existingLines: [], assignments: [assignment("assignment-1", "equipment-1", "operator-1")], equipment: [machine("equipment-1")], blockingEquipmentIds: new Set() })).toEqual([expect.objectContaining({ code: "PROJECT_MISMATCH" })]);
  });

  it("allows removal only in Draft or Reserved and never after a snapshot", () => {
    expect(canRemoveRentalEquipmentLine(rental("Draft"), line("line-1", "equipment-1"))).toBeUndefined();
    expect(canRemoveRentalEquipmentLine(rental("Reserved"), line("line-1", "equipment-1"))).toBeUndefined();
    expect(canRemoveRentalEquipmentLine(rental("Released"), line("line-1", "equipment-1"))).toMatchObject({ code: "RENTAL_NOT_EDITABLE" });
    expect(canRemoveRentalEquipmentLine(rental(), { ...line("line-1", "equipment-1"), commercialSnapshot: { billingMethod: "Per Hour", unitRate: 100, currency: "PHP", operatorIncluded: true, capturedAt: "2026-07-20T00:00:00.000Z" } })).toMatchObject({ code: "LINE_SNAPSHOT_LOCKED" });
  });

  it("blocks zero-line release and reports every incomplete equipment line", () => {
    expect(prepareRentalEquipmentLineRelease({ rental: rental(), lines: [], contracts: [], timestamp: "2026-07-20T00:00:00.000Z" })).toMatchObject({ success: false, issues: [{ code: "RENTAL_EQUIPMENT_LINE_MISSING" }] });
    const result = prepareRentalEquipmentLineRelease({ rental: rental(), lines: [line("line-1", "equipment-1"), line("line-2", "equipment-2")], contracts: [], timestamp: "2026-07-20T00:00:00.000Z" });
    expect(result).toMatchObject({ success: false });
    if (result.success) return;
    expect(result.issues).toEqual(expect.arrayContaining([expect.objectContaining({ equipmentId: "equipment-1" }), expect.objectContaining({ equipmentId: "equipment-2" })]));
  });

  it("releases all configured lines with independent methods and rates", () => {
    const lines = [line("line-1", "equipment-1"), line("line-2", "equipment-2")];
    const contracts = [contractFor(lines[0], "Per Hour", 100), contractFor(lines[1], "Per Day", 750)];
    contracts.forEach((contract) => expect(rentalContractRepository.saveForRentalEquipmentLine(contract).success).toBe(true));
    const result = prepareRentalEquipmentLineRelease({ rental: rental(), lines, contracts, timestamp: "2026-07-21T00:00:00.000Z" });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.lines[0].commercialSnapshot).toMatchObject({ billingMethod: "Per Hour", unitRate: 100 });
    expect(result.lines[1].commercialSnapshot).toMatchObject({ billingMethod: "Per Day", unitRate: 750 });
  });

  it("preserves multiple lines and terms across refresh, backup, and restore", () => {
    const lines = [line("line-1", "equipment-1"), line("line-2", "equipment-2")];
    rentalEquipmentLineRepository.createMany(lines);
    rentalContractRepository.saveForRentalEquipmentLine(contractFor(lines[0], "Per Hour", 100));
    rentalContractRepository.saveForRentalEquipmentLine(contractFor(lines[1], "Per Day", 750));
    expect(rentalEquipmentLineRepository.getByRentalId("rental-1")).toHaveLength(2);
    const backup = createApplicationBackup(new Date("2026-07-21T00:00:00.000Z")); storage.clear(); restoreApplicationBackup(validateApplicationBackup(backup));
    expect(rentalEquipmentLineRepository.getByRentalId("rental-1")).toHaveLength(2);
    expect(rentalContractRepository.listByRentalId("rental-1").map((item) => item.unitRate).sort((a, b) => a - b)).toEqual([100, 750]);
  });

  it("workspace resolves a sole line but never silently chooses from multiple lines", () => {
    expect(resolveRentalWorkspaceEquipmentLines([line("line-1", "equipment-1")])).toMatchObject({ kind: "sole", line: { id: "line-1" } });
    expect(resolveRentalWorkspaceEquipmentLines([line("line-1", "equipment-1"), line("line-2", "equipment-2")])).toMatchObject({ kind: "multiple", lines: [{ id: "line-1" }, { id: "line-2" }] });
  });
});
