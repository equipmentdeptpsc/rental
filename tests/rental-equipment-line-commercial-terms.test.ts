import { beforeEach, describe, expect, it } from "vitest";
import { storage } from "@/core/storage";
import type { RentalRecord } from "@/features/rental/types";
import type { RentalEquipmentLine } from "@/features/rental/equipment-line";
import { rentalEquipmentLineRepository } from "@/features/rental/equipment-line";
import { rentalContractRepository } from "@/features/rental/repository/rentalContractRepository";
import { configureRentalCommercialTerms, type RentalCommercialTermsInput } from "@/features/rental/services/configureRentalCommercialTerms";
import { prepareRentalEquipmentLineRelease } from "@/features/rental/services/prepareRentalEquipmentLineRelease";

const rental = (status: RentalRecord["status"] = "Reserved"): RentalRecord => ({
  id: "rental-1", rentalNumber: "R-1", equipmentId: "equipment-1", assignmentId: "assignment-1", operatorId: "operator-1",
  customerId: "customer-1", projectId: "project-1", customer: "Customer", project: "Project", rentedBy: "",
  dateOut: "2026-07-20", expectedReturn: "2026-07-21", rentalType: "Operated Rental", billingMethod: "Per Hour",
  statusId: status.toLowerCase(), status,
});
const line = (id = "line-1", equipmentId = "equipment-1"): RentalEquipmentLine => ({
  id, rentalId: "rental-1", equipmentId, assignmentId: `assignment-${id}`, operatorId: `operator-${id}`,
  status: "Reserved",
  commercialSnapshotRequired: true, createdAt: "2026-07-19T00:00:00.000Z", updatedAt: "2026-07-19T00:00:00.000Z",
});
const terms = (unitRate = 100, billingMethod: RentalCommercialTermsInput["billingMethod"] = "Per Hour"): RentalCommercialTermsInput => ({
  billingMethod, currency: "PHP", unitRate, operatorIncluded: true,
  transactionRelationship: "Non-Affiliate", vatApplicability: "Applicable", taxRate: 12,
});
const configure = (rentalStatus: RentalRecord["status"], equipmentLine = line(), commercialTerms = terms(), existingContract = undefined as ReturnType<typeof rentalContractRepository.getById>) =>
  configureRentalCommercialTerms({ rental: rental(rentalStatus), line: equipmentLine, equipmentId: equipmentLine.equipmentId, commercialTerms, existingContract, timestamp: "2026-07-20T00:00:00.000Z" });

describe("line-authoritative commercial terms", () => {
  beforeEach(() => storage.clear());

  it.each(["Draft", "Reserved"] as const)("saves and updates %s terms against the intended equipment line", (status) => {
    const created = configure(status); expect(created.success).toBe(true); if (!created.success) return;
    expect(rentalContractRepository.saveForRentalEquipmentLine(created.contract).success).toBe(true);
    const persisted = rentalContractRepository.getByRentalEquipmentLineId("line-1");
    expect(persisted).toMatchObject({ status: "found", contract: { rentalId: "rental-1", rentalEquipmentLineId: "line-1", equipmentId: "equipment-1", unitRate: 100 } });
    if (persisted.status !== "found") return;
    const edited = configure(status, line(), terms(250), persisted.contract); expect(edited.success).toBe(true); if (!edited.success) return;
    rentalContractRepository.saveForRentalEquipmentLine(edited.contract);
    expect(rentalContractRepository.getByRentalEquipmentLineId("line-1")).toMatchObject({ status: "found", contract: { id: created.contract.id, unitRate: 250, createdAt: created.contract.createdAt } });
  });

  it("preserves line-level terms after repository refresh", () => {
    const result = configure("Reserved"); if (!result.success) throw new Error(result.message);
    rentalContractRepository.saveForRentalEquipmentLine(result.contract);
    expect(rentalContractRepository.listByRentalId("rental-1")).toEqual([expect.objectContaining({ rentalEquipmentLineId: "line-1", unitRate: 100 })]);
  });

  it("rejects released or snapshotted line edits", () => {
    expect(configure("Released")).toMatchObject({ success: false, code: "COMMERCIAL_TERMS_READ_ONLY" });
    expect(configure("Reserved", { ...line(), commercialSnapshot: { billingMethod: "Per Hour", unitRate: 100, operatorIncluded: true, currency: "PHP", capturedAt: "2026-07-20T00:00:00.000Z" } })).toMatchObject({ success: false, code: "COMMERCIAL_TERMS_READ_ONLY" });
  });

  it("supports separate contracts for two internal lines without collision", () => {
    const first = configure("Reserved", line("line-1", "equipment-1"), terms(100, "Per Hour"));
    const second = configure("Reserved", line("line-2", "equipment-2"), terms(500, "Per Day"));
    if (!first.success || !second.success) throw new Error("configuration failed");
    expect(rentalContractRepository.saveForRentalEquipmentLine(first.contract).success).toBe(true);
    expect(rentalContractRepository.saveForRentalEquipmentLine(second.contract).success).toBe(true);
    expect(rentalContractRepository.listByRentalId("rental-1")).toEqual(expect.arrayContaining([
      expect.objectContaining({ rentalEquipmentLineId: "line-1", equipmentId: "equipment-1", billingMethod: "Per Hour", unitRate: 100 }),
      expect.objectContaining({ rentalEquipmentLineId: "line-2", equipmentId: "equipment-2", billingMethod: "Per Day", unitRate: 500 }),
    ]));
  });

  it("blocks release with equipment-specific details when a line lacks terms", () => {
    expect(prepareRentalEquipmentLineRelease({ rental: rental(), lines: [line()], contracts: [], timestamp: "2026-07-20T00:00:00.000Z" })).toMatchObject({ success: false, issues: [{ code: "COMMERCIAL_TERMS_MISSING", rentalEquipmentLineId: "line-1", equipmentId: "equipment-1" }] });
  });

  it("prepares every valid snapshot once and repository persistence cannot overwrite it", () => {
    const configured = configure("Reserved"); if (!configured.success) throw new Error(configured.message);
    rentalEquipmentLineRepository.create(line());
    const prepared = prepareRentalEquipmentLineRelease({ rental: rental(), lines: [line()], contracts: [configured.contract], timestamp: "2026-07-20T00:00:00.000Z" });
    expect(prepared).toMatchObject({ success: true, lines: [{ commercialSnapshot: { unitRate: 100, billingMethod: "Per Hour" } }] });
    if (!prepared.success) return;
    expect(rentalEquipmentLineRepository.saveCommercialSnapshotsOnce("rental-1", prepared.lines).success).toBe(true);
    const existing = rentalEquipmentLineRepository.getById("line-1")!;
    const repeated = prepareRentalEquipmentLineRelease({ rental: rental(), lines: [existing], contracts: [{ ...configured.contract, unitRate: 999 }], timestamp: "2026-07-21T00:00:00.000Z" });
    expect(repeated).toMatchObject({ success: true, lines: [{ commercialSnapshot: { unitRate: 100, capturedAt: "2026-07-20T00:00:00.000Z" } }] });
  });
});
