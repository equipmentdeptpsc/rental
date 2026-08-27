import { beforeEach, describe, expect, it } from "vitest";
import { storage } from "@/core/storage";
import type { RentalRecord } from "@/features/rental/types";
import type { RentalEquipmentLine } from "@/features/rental/equipment-line";
import { rentalEquipmentLineRepository } from "@/features/rental/equipment-line";
import { createDeur, getDeurCreationError } from "@/features/rental/deur/services/CreateDeurService";
import { resolveLegacyDeurRentalEquipmentLine } from "@/features/rental/deur/services/resolveDeurRentalEquipmentLine";
import { deurRepository } from "@/features/rental/deur/repository/deurRepository";
import { evaluateRentalEquipmentLineDeurCompliance } from "@/features/rental/deur/compliance/evaluateRentalDeurCompliance";
import { getDeurRentalEligibility } from "@/features/rental/deur/services/deurRentalEligibility";
import { createApplicationBackup, restoreApplicationBackup, validateApplicationBackup } from "@/features/settings/services/applicationBackupService";
import { frozenDeurLine } from "./helpers/deurReleaseFixture";

const snapshot = (rate: number, billingMethod: "Per Hour" | "Per Day" = "Per Hour") => ({ billingMethod, unitRate: rate, operatorIncluded: true, currency: "PHP", capturedAt: "2026-07-20T00:00:00.000Z" } as const);
const metadata = { costCode: { code: "C", name: "Cost" }, activityCode: { code: "A", name: "Activity" } };
const rental: RentalRecord = { id: "rental-1", rentalNumber: "R-1", equipmentId: "", customerId: "customer-1", projectId: "project-1", customer: "Customer", project: "Project", rentedBy: "Admin", dateOut: "2026-07-20", statusId: "active", status: "Active", operationalMetadata: metadata };
const line = (id: string, equipmentId: string, operatorId: string, rate: number, billingMethod: "Per Hour" | "Per Day" = "Per Hour"): RentalEquipmentLine => frozenDeurLine({ rental, id, equipmentId, assignmentId: `assignment-${id}`, operatorId, work, billingMethod, unitRate: rate });
const work = { id: "work", code: "WORK", name: "Work", active: true, operatorSelectable: true, requiresRemarks: false };
const request = (equipmentLine: RentalEquipmentLine, workDate = "2026-07-21") => ({ rentalId: rental.id, rentalEquipmentLineId: equipmentLine.id, rentalStatus: rental.status, rental, equipmentId: equipmentLine.equipmentId, assignmentId: equipmentLine.assignmentId, operatorId: equipmentLine.operatorId, projectId: rental.projectId, customerId: rental.customerId, selectedWorkDescription: work, workDate });

describe("Rental Equipment Line-aware DEUR", () => {
  beforeEach(() => storage.clear());

  it("auto-resolves a sole line and persists its identity and snapshot", () => {
    const sole = line("line-1", "equipment-1", "operator-1", 100); rentalEquipmentLineRepository.create(sole);
    const result = createDeur({ ...request(sole), rentalEquipmentLineId: undefined });
    expect(result).toMatchObject({ success: true, record: { rentalEquipmentLineId: "line-1", equipmentId: "equipment-1", assignmentId: "assignment-line-1", operatorId: "operator-1", commercialSnapshot: { unitRate: 100 } } });
    if (result.success) expect(deurRepository.getById(result.record.id)?.rentalEquipmentLineId).toBe("line-1");
  });

  it("requires explicit selection for multiple lines and validates every relationship", () => {
    const first = line("line-1", "equipment-1", "operator-1", 100), second = line("line-2", "equipment-2", "operator-2", 750, "Per Day"); rentalEquipmentLineRepository.createMany([first, second]);
    expect(getDeurCreationError({ ...request(first), rentalEquipmentLineId: undefined })).toContain("Select a specific");
    expect(createDeur({ ...request(first), equipmentId: second.equipmentId })).toMatchObject({ success: false, message: expect.stringContaining("equipment") });
    expect(createDeur({ ...request(first), assignmentId: second.assignmentId })).toMatchObject({ success: false, message: expect.stringContaining("Assignment") });
    expect(createDeur({ ...request(first), operatorId: second.operatorId })).toMatchObject({ success: false, message: expect.stringContaining("Operator") });
  });

  it("copies only the selected line snapshot and allows same-date DEURs on different lines", () => {
    const first = line("line-1", "equipment-1", "operator-1", 100), second = line("line-2", "equipment-2", "operator-2", 750, "Per Day"); rentalEquipmentLineRepository.createMany([first, second]);
    const a = createDeur(request(first)), b = createDeur(request(second)); expect(a.success).toBe(true); expect(b.success).toBe(true);
    if (!a.success || !b.success) return;
    expect(a.record.commercialSnapshot?.unitRate).toBe(100); expect(b.record.commercialSnapshot).toMatchObject({ billingMethod: "Per Day", unitRate: 750 });
    expect(createDeur(request(first))).toMatchObject({ success: false, message: expect.stringContaining("already exists") });
  });

  it("resolves legacy records exactly once, reports ambiguity, and backfills idempotently without changing snapshots", () => {
    const first = line("line-1", "equipment-1", "operator-1", 100); rentalEquipmentLineRepository.create(first);
    const legacy = { id: "deur-legacy", rentalId: rental.id, equipmentId: first.equipmentId, operatorId: first.operatorId, workDate: "2026-07-20", logs: [], totalOperatingMinutes: 0, totalIdleMinutes: 0, totalMaintenanceMinutes: 0, totalMealBreakMinutes: 0, totalMobilizationMinutes: 0, totalDemobilizationMinutes: 0, status: "Acknowledged" as const, commercialSnapshot: snapshot(55), createdAt: "2026-07-20T00:00:00.000Z", updatedAt: "2026-07-20T00:00:00.000Z" };
    deurRepository.create(legacy); expect(resolveLegacyDeurRentalEquipmentLine(legacy, [rental])).toMatchObject({ success: true, line: { id: first.id } });
    expect(deurRepository.backfillRentalEquipmentLineIds([rental])).toMatchObject({ changed: true, issues: [] }); expect(deurRepository.backfillRentalEquipmentLineIds([rental]).changed).toBe(false);
    expect(deurRepository.getById(legacy.id)).toMatchObject({ rentalEquipmentLineId: first.id, commercialSnapshot: { unitRate: 55 } });
    storage.clear(); storage.set("equipment-rental-equipment-lines", { schemaVersion: 1, records: [first, { ...first, id: "line-duplicate" }] }); expect(resolveLegacyDeurRentalEquipmentLine(legacy, [rental])).toMatchObject({ success: false, issue: { code: "DEUR_LINE_AMBIGUOUS" } });
  });

  it("filters operator eligibility and compliance per equipment line", () => {
    const first = line("line-1", "equipment-1", "operator-1", 100), second = line("line-2", "equipment-2", "operator-2", 750); rentalEquipmentLineRepository.createMany([first, second]);
    const machines = [first, second].map((item) => ({ id: item.equipmentId, prefixId: "", assetNo: item.equipmentId, equipmentName: item.equipmentId, category: "Moving Equipment" as const, maintenanceType: "Engine Hours" as const, currentReading: 0, projectId: "project-1", operatorId: item.operatorId, status: "Rented" as const }));
    const operators = [first, second].map((item) => ({ id: item.operatorId, name: item.operatorId, email: "", licenseNumber: "", certificationType: "None" as const, status: "Active" as const, joinedDate: "" })); const projects = [{ id: "project-1", projectCode: "P", projectName: "Project", customerId: "customer-1", location: "", projectManager: "", startDate: "", endDate: "", status: "Active" as const }];
    const eligibility = getDeurRentalEligibility([rental], machines, operators, projects, []); expect(eligibility.eligible.map((item) => item.rentalEquipmentLineId)).toEqual([first.id, second.id]);
    const created = createDeur(request(first)); const results = evaluateRentalEquipmentLineDeurCompliance({ rental, lines: [first, second], deurs: created.success ? [created.record] : [] });
    expect(results).toHaveLength(2); expect(results[1]).toMatchObject({ rentalEquipmentLineId: second.id, equipmentId: second.equipmentId, result: { status: "MISSING_DEUR" } });
  });

  it("never lets a line-less compatibility DEUR satisfy a required canonical line expectation", () => {
    const first = line("line-1", "equipment-shared", "operator-1", 100);
    const second = line("line-2", "equipment-other", "operator-2", 100);
    const canonicalRental: RentalRecord = {
      ...rental,
      releasedAt: "2026-07-20T00:00:00Z",
      deurExpectationPolicyRequired: true,
      deurExpectationPolicy: { frequency: "PER_WORKDAY", effectiveFrom: "2026-07-20", timezone: "Asia/Manila", capturedAt: "2026-07-20T00:00:00Z" },
    };
    const compatibilityDeur = {
      id: "legacy-without-line", rentalId: rental.id, equipmentId: first.equipmentId, operatorId: first.operatorId,
      workDate: "2026-07-20", status: "Acknowledged", legacy: false, logs: [], totalOperatingMinutes: 60,
      totalIdleMinutes: 0, totalMaintenanceMinutes: 0, totalMealBreakMinutes: 0, totalMobilizationMinutes: 0,
      totalDemobilizationMinutes: 0, createdAt: "2026-07-20T00:00:00Z", updatedAt: "2026-07-20T01:00:00Z",
    } as const;
    const results = evaluateRentalEquipmentLineDeurCompliance({ rental: canonicalRental, lines: [first, second], deurs: [compatibilityDeur], evaluationTimestamp: "2026-07-21T00:00:00Z" });
    expect(results).toHaveLength(2);
    expect(results.every((item) => item.result.compliantCount === 0)).toBe(true);
    expect(results.every((item) => item.result.status === "MISSING_DEUR")).toBe(true);
  });

  it("preserves the line identity and embedded snapshot through backup and restore", () => {
    const sole = line("line-1", "equipment-1", "operator-1", 100); rentalEquipmentLineRepository.create(sole); const created = createDeur(request(sole)); if (!created.success) throw new Error(created.message);
    const backup = createApplicationBackup(new Date("2026-07-21T00:00:00.000Z")); storage.clear(); restoreApplicationBackup(validateApplicationBackup(backup));
    expect(deurRepository.getById(created.record.id)).toMatchObject({ rentalEquipmentLineId: sole.id, commercialSnapshot: { unitRate: 100 } });
  });
});
