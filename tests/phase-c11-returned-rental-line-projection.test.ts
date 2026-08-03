import { describe, expect, it } from "vitest";
import type { RentalRecord } from "@/features/rental/types";
import type { RentalEquipmentLine } from "@/features/rental/equipment-line";
import type { DeurRecord } from "@/features/rental/deur/types";
import { buildRentalDeurComplianceReport } from "@/features/rental/deur/compliance/buildRentalDeurComplianceReport";
import { resolveRentalTransactionPresentation } from "@/features/rental/services/resolveRentalTransactionPresentation";
import { matchDeursToExpectations } from "@/features/rental/deur/expectation/matchDeursToExpectations";

const rental: RentalRecord = { id: "returned-rental", rentalNumber: "R-RETURNED", equipmentId: "", customer: "Customer", project: "Project", rentedBy: "Admin", dateOut: "2026-08-03", returnedAt: "2026-08-03T09:00:00.000Z", statusId: "returned", status: "Returned", deurExpectationPolicyRequired: true, deurExpectationPolicy: { frequency: "PER_WORKDAY", effectiveFrom: "2026-08-03", timezone: "Asia/Manila", capturedAt: "2026-08-03T00:00:00.000Z" } };
const lines: RentalEquipmentLine[] = [
  { id: "line-a", rentalId: rental.id, equipmentId: "equipment-a", assignmentId: "assignment-a", operatorId: "operator-a", status: "Returned", createdAt: "2026-08-03T00:00:00.000Z", updatedAt: "2026-08-03T18:00:00.000Z" },
  { id: "line-b", rentalId: rental.id, equipmentId: "equipment-b", assignmentId: "assignment-b", operatorId: "operator-b", status: "Returned", createdAt: "2026-08-03T00:00:00.000Z", updatedAt: "2026-08-03T18:00:00.000Z" },
];
const deurs: DeurRecord[] = lines.map((line, index) => ({ id: `deur-${index + 1}`, deurNumber: `DEUR-${index + 1}`, rentalId: rental.id, rentalEquipmentLineId: line.id, assignmentId: line.assignmentId, equipmentId: line.equipmentId, operatorId: line.operatorId, creationSource: "OPERATOR_DIGITAL", workDate: "2026-08-03", events: [], logs: [], totalOperatingMinutes: 60, totalIdleMinutes: 0, totalMaintenanceMinutes: 0, totalMealBreakMinutes: 0, totalMobilizationMinutes: 0, totalDemobilizationMinutes: 0, status: "Acknowledged", legacy: false, createdAt: "2026-08-03T08:00:00.000Z", updatedAt: "2026-08-03T18:00:00.000Z" }));
const equipment = [
  { id: "equipment-a", prefixId: "EQ", assetNo: "EQ-001", equipmentName: "Excavator", category: "Moving Equipment" as const, maintenanceType: "Engine Hours" as const, currentReading: 0, projectId: "", operatorId: "", status: "Available" as const },
  { id: "equipment-b", prefixId: "EQ", assetNo: "EQ-002", equipmentName: "Dump Truck", category: "Moving Equipment" as const, maintenanceType: "Engine Hours" as const, currentReading: 0, projectId: "", operatorId: "", status: "Available" as const },
];
const operators = [
  { id: "operator-a", name: "Operator One", email: "", licenseNumber: "", certificationType: "None" as const, status: "Active" as const, joinedDate: "" },
  { id: "operator-b", name: "Operator Two", email: "", licenseNumber: "", certificationType: "None" as const, status: "Active" as const, joinedDate: "" },
];

describe("returned multi-equipment Rental projection", () => {
  it("retains equipment and operator presentation from immutable rental lines after live assignment release", () => {
    expect(resolveRentalTransactionPresentation({ rental, lines, equipment, operators })).toMatchObject({
      equipmentLabel: "EQ-001 - Excavator; EQ-002 - Dump Truck",
      operatorLabel: "Operator One; Operator Two",
      rentalEquipmentLineIds: ["line-a", "line-b"],
    });
  });

  it("matches acknowledged same-day DEURs independently by Rental, Rental Line, and Work Date", () => {
    const report = buildRentalDeurComplianceReport({ rentals: [rental], assignments: [], rentalEquipmentLines: lines, deurs, evaluationTimestamp: "2026-08-04T00:00:00.000Z" });
    expect(report.monitored[0].result).toMatchObject({ status: "COMPLIANT", expectedCount: 2, compliantCount: 2, missingCount: 0, incompleteCount: 0 });
    expect(report.rows).toEqual([]);
    expect(JSON.stringify(report)).not.toContain("Multiple unrelated effective DEURs match this expectation");
  });

  it("does not allow a line-scoped expectation to match the other line's DEUR", () => {
    const expectation = { expectationId: "line-a:2026-08-03", rentalId: rental.id, rentalEquipmentLineId: "line-a", workDate: "2026-08-03", status: "DUE" as const, source: "EXPLICIT_POLICY" as const };
    expect(matchDeursToExpectations({ expectations: [expectation], deurs }).results[0]).toMatchObject({ status: "COMPLIANT", matchingEffectiveDeurId: "deur-1" });
  });
});
