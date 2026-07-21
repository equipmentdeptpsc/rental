import { describe, expect, it } from "vitest";
import type { RentalAggregate } from "@/features/rental/aggregate";
import type { DeurRecord } from "@/features/rental/deur/types";
import type { RentalCommercialSnapshot } from "@/features/rental/types";
import { buildRentalLineAwareBillingPreview, createRentalLineAwareBillingStatement } from "@/features/rental/billingstatement/services/buildRentalLineAwareBilling";
import { storage } from "@/core/storage";
import { createApplicationBackup, restoreApplicationBackup } from "@/features/settings/services/applicationBackupService";

const events = [
  { id: "s", activityType: "shift", action: "start", timestamp: "2026-07-02T00:00:00.000Z", sequence: 1, source: "user" },
  { id: "o1", activityType: "operation", action: "start", timestamp: "2026-07-02T01:00:00.000Z", sequence: 2, source: "user" },
  { id: "o2", activityType: "operation", action: "end", timestamp: "2026-07-02T03:00:00.000Z", sequence: 3, source: "user" },
  { id: "e", activityType: "shift", action: "end", timestamp: "2026-07-02T04:00:00.000Z", sequence: 4, source: "user" },
] as DeurRecord["events"];

function snapshot(unitRate: number, billingMethod: RentalCommercialSnapshot["billingMethod"] = "Per Hour"): RentalCommercialSnapshot {
  return { billingMethod, unitRate, operatorIncluded: true, currency: "PHP", taxRate: 12, withholdingTax: 2, capturedAt: "2026-07-01T00:00:00.000Z" };
}

function deur(id: string, lineId: string | undefined, equipmentId: string, commercialSnapshot = snapshot(100)): DeurRecord {
  return { id, deurNumber: `DEUR-${id}`, rentalId: "rental-1", rentalEquipmentLineId: lineId, equipmentId, operatorId: `operator-${equipmentId}`, workDate: "2026-07-02", reportDate: "2026-07-02", events, logs: [], totalOperatingMinutes: 120, totalIdleMinutes: 0, totalMaintenanceMinutes: 0, totalMealBreakMinutes: 0, totalMobilizationMinutes: 0, totalDemobilizationMinutes: 0, status: "Acknowledged", legacy: false, commercialSnapshotRequired: true, commercialSnapshot, billingMethodSnapshot: commercialSnapshot.billingMethod, evidenceMode: "TIME_TIMELINE", createdAt: "2026-07-02", updatedAt: "2026-07-02" };
}

function aggregate(deurs: DeurRecord[]): RentalAggregate {
  return {
    rental: { id: "rental-1", rentalNumber: "R-1", equipmentId: "equipment-1", operatorId: "operator-equipment-1", customerId: "customer-1", projectId: "project-1", customer: "Customer", project: "Project", rentedBy: "", dateOut: "2026-07-01", expectedReturn: "2026-07-31", statusId: "", status: "Active" },
    rentalEquipmentLines: [
      { id: "line-1", rentalId: "rental-1", equipmentId: "equipment-1", operatorId: "operator-equipment-1", status: "Active", commercialSnapshot: snapshot(100), createdAt: "2026-07-01", updatedAt: "2026-07-01" },
      { id: "line-2", rentalId: "rental-1", equipmentId: "equipment-2", operatorId: "operator-equipment-2", status: "Active", commercialSnapshot: snapshot(999), createdAt: "2026-07-01", updatedAt: "2026-07-01" },
    ],
    contract: { id: "changed-contract", contractNo: "C-1", customerId: "customer-1", equipmentId: "equipment-1", projectId: "project-1", rentalType: "Operated Rental", billingMethod: "Per Hour", currency: "PHP", unitRate: 9999, operatorIncluded: true, startDate: "2026-07-01", expectedEndDate: "2026-07-31", status: "Active", createdAt: "", updatedAt: "" },
    deurs,
    billing: { totalOperatingCharge: 0, totalIdleCharge: 0, totalMobilizationCharge: 0, totalDemobilizationCharge: 0, totalAdjustment: 0, subtotal: 0, invoiced: 0, collected: 0, outstanding: 0 },
  };
}

describe("Rental multi-line billing", () => {
  it("calculates every DEUR independently from its embedded immutable snapshot and aggregates taxes", () => {
    const result = buildRentalLineAwareBillingPreview({ aggregate: aggregate([deur("1", "line-1", "equipment-1", snapshot(100)), deur("2", "line-2", "equipment-2", snapshot(250, "Per Day"))]), from: "2026-07-01", to: "2026-07-31" });
    expect(result.issues).toEqual([]);
    expect(result.lines).toHaveLength(2);
    expect(result.lines).toEqual(expect.arrayContaining([
      expect.objectContaining({ deurId: "1", rentalEquipmentLineId: "line-1", equipmentId: "equipment-1", hourlyRate: 100, amount: 200 }),
      expect.objectContaining({ deurId: "2", rentalEquipmentLineId: "line-2", equipmentId: "equipment-2", billingMethod: "Per Day", hourlyRate: 250, amount: 250 }),
    ]));
    expect(result.subtotal).toBe(result.lines.reduce((sum, line) => sum + line.amount, 0));
    expect(result.vat).toBe(result.lines.reduce((sum, line) => sum + (line.vat ?? 0), 0));
    expect(result.withholdingTax).toBe(result.lines.reduce((sum, line) => sum + (line.withholdingTax ?? 0), 0));
    expect(result.grandTotal).toBe(result.lines.reduce((sum, line) => sum + (line.grandTotal ?? 0), 0));
    expect(result.lines.every((line) => line.fuelCharge === 0 && line.mobilizationCharge === 0)).toBe(true);
  });

  it("preserves all-or-nothing behavior and reports the affected equipment", () => {
    const invalid = deur("2", "line-2", "equipment-2", snapshot(250)); invalid.status = "Rejected";
    const result = buildRentalLineAwareBillingPreview({ aggregate: aggregate([deur("1", "line-1", "equipment-1"), invalid]), from: "2026-07-01", to: "2026-07-31" });
    expect(result.lines).toHaveLength(1);
    expect(result.issues).toContainEqual(expect.objectContaining({ code: "REJECTED", deurId: "2", equipmentId: "equipment-2", rentalEquipmentLineId: "line-2" }));
  });

  it("rejects ambiguous legacy line resolution instead of selecting the first line", () => {
    const legacy = deur("legacy", undefined, "equipment-1");
    const input = aggregate([legacy]);
    input.rentalEquipmentLines.push({ ...input.rentalEquipmentLines[0], id: "line-duplicate" });
    const result = buildRentalLineAwareBillingPreview({ aggregate: input, from: "2026-07-01", to: "2026-07-31" });
    expect(result.lines).toEqual([]);
    expect(result.issues).toContainEqual(expect.objectContaining({ code: "AMBIGUOUS_LEGACY_DEUR_LINE", equipmentId: "equipment-1" }));
  });

  it("creates one statement, consumes both DEURs, and compensates a partial consumption failure", () => {
    const source = [deur("1", "line-1", "equipment-1"), deur("2", "line-2", "equipment-2", snapshot(250))];
    const statementRecords: any[] = []; const deurRecords = new Map(source.map((item) => [item.id, structuredClone(item)]));
    const statements = { getByRentalId: () => statementRecords, create: (record: any) => { statementRecords.push(record); return record; }, delete: (id: string) => { const index = statementRecords.findIndex((item) => item.id === id); return index >= 0 ? statementRecords.splice(index, 1)[0] : undefined; } };
    const deurs = { getById: (id: string) => structuredClone(deurRecords.get(id)), update: (record: DeurRecord) => { deurRecords.set(record.id, structuredClone(record)); return structuredClone(record); } };
    const result = createRentalLineAwareBillingStatement({ aggregate: aggregate(source), from: "2026-07-01", to: "2026-07-31", identity: { id: "statement-1", statementNo: "BS-1" } }, { statements, deurs });
    expect(result.success).toBe(true); expect(statementRecords).toHaveLength(1); expect(statementRecords[0].lines).toHaveLength(2);
    expect([...deurRecords.values()].every((item) => item.billingStatementId === "statement-1" && item.billingLocked)).toBe(true);
    expect(createRentalLineAwareBillingStatement({ aggregate: { ...aggregate(source), deurs: [...deurRecords.values()] }, from: "2026-07-01", to: "2026-07-31" }, { statements, deurs }).success).toBe(false);

    const rollbackRecords = new Map(source.map((item) => [item.id, structuredClone(item)])); let calls = 0; const rollbackStatements: any[] = [];
    const failed = createRentalLineAwareBillingStatement({ aggregate: aggregate(source), from: "2026-07-01", to: "2026-07-31", identity: { id: "statement-2", statementNo: "BS-2" } }, { statements: { ...statements, getByRentalId: () => [], create: (record: any) => { rollbackStatements.push(record); return record; }, delete: (id: string) => { const index = rollbackStatements.findIndex((item) => item.id === id); return index >= 0 ? rollbackStatements.splice(index, 1)[0] : undefined; } }, deurs: { getById: (id) => structuredClone(rollbackRecords.get(id)), update: (record) => { calls += 1; if (calls === 2) return undefined; rollbackRecords.set(record.id, structuredClone(record)); return structuredClone(record); } } });
    expect(failed).toMatchObject({ success: false, code: "BATCH_CONSUMPTION_FAILED" }); expect(rollbackStatements).toEqual([]); expect(rollbackRecords.get("1")?.billingLocked).not.toBe(true);
  });

  it("preserves equipment-aware statement lines through refresh-compatible storage and backup restore", () => {
    const statement = { id: "statement-1", statementNo: "BS-1", version: 1, rentalId: "rental-1", equipmentId: "", operatorId: "", customer: "Customer", project: "Project", billingFrom: "2026-07-01", billingTo: "2026-07-31", subtotal: 450, vat: 54, withholdingTax: 9, grandTotal: 495, approvalStatus: "Draft", invoiceStatus: "Not Invoiced", lines: [{ id: "1", deurId: "1", rentalEquipmentLineId: "line-1", equipmentId: "equipment-1", operatorId: "operator-1", workDate: "2026-07-02", description: "Rental", costCode: "", hours: 2, hourlyRate: 100, amount: 200 }, { id: "2", deurId: "2", rentalEquipmentLineId: "line-2", equipmentId: "equipment-2", operatorId: "operator-2", workDate: "2026-07-02", description: "Rental", costCode: "", hours: 1, hourlyRate: 250, amount: 250 }], createdBy: "System", createdAt: "2026-07-02" };
    storage.clear(); storage.set("equipment-rental-billing-statements", [statement]);
    expect(storage.get<any[]>("equipment-rental-billing-statements")?.[0].lines[1]).toMatchObject({ rentalEquipmentLineId: "line-2", equipmentId: "equipment-2", deurId: "2" });
    const backup = createApplicationBackup(); storage.clear(); restoreApplicationBackup({ backup, sections: Object.keys(backup.data) as any });
    expect(storage.get<any[]>("equipment-rental-billing-statements")?.[0]).toEqual(statement);
  });
});
