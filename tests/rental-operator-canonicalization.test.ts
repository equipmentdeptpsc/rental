import { describe, expect, it } from "vitest";
import type { AssignmentRecord } from "@/features/assignment/types";
import type { EquipmentRecord } from "@/features/equipment/types";
import type { Operator } from "@/features/operators/types";
import type { ProjectRecord } from "@/features/project/types";
import type { DeurRecord } from "@/features/rental/deur/types";
import type { RentalRecord } from "@/features/rental/types";
import { evaluateOperatorDigitalDeurAccess } from "@/features/rental/deur/operator/evaluateOperatorDigitalDeurAccess";
import { resolveRentalDeurOperator } from "@/features/rental/deur/operator/resolveRentalDeurOperator";
import { getDeurRentalEligibility } from "@/features/rental/deur/services/deurRentalEligibility";

const original: Operator = { id: "operator-original", name: "Original Operator", email: "", licenseNumber: "", certificationType: "None", status: "Active", joinedDate: "" };
const reassigned: Operator = { ...original, id: "operator-reassigned", name: "Reassigned Operator" };
const rental: RentalRecord = { id: "rental-1", rentalNumber: "R-1", assignmentId: "assignment-1", equipmentId: "equipment-1", operatorId: original.id, projectId: "project-1", customer: "Customer", project: "Project", rentedBy: "Admin", dateOut: "2026-07-20", statusId: "released", status: "Released", operationalMetadata: { costCode: { code: "C", name: "Cost" }, activityCode: { code: "A", name: "Activity" } }, commercialSnapshotRequired: true, commercialSnapshot: { billingMethod: "Per Hour", unitRate: 100, operatorIncluded: true, currency: "PHP", capturedAt: "2026-07-20T00:00:00.000Z" } };
const assignment: AssignmentRecord = { id: "assignment-1", equipmentId: "equipment-1", operatorId: reassigned.id, projectId: "project-1", assignedDate: "2026-07-20", expectedReturn: "", remarks: "", status: "Active" };
const equipment: EquipmentRecord = { id: "equipment-1", prefixId: "", assetNo: "EQ-1", equipmentName: "Excavator", category: "Moving Equipment", maintenanceType: "Engine Hours", currentReading: 0, projectId: "project-1", operatorId: reassigned.id, status: "Rented" };
const project: ProjectRecord = { id: "project-1", projectCode: "P-1", projectName: "Project", client: "", location: "", projectManager: "", startDate: "", targetCompletion: "", status: "Active" };
const existingDeur: DeurRecord = { id: "deur-1", rentalId: rental.id, assignmentId: assignment.id, equipmentId: rental.equipmentId, operatorId: original.id, projectId: rental.projectId, creationSource: "OPERATOR_DIGITAL", evidenceMode: "TIME_TIMELINE", billingMethodSnapshot: "Per Hour", workDate: "2026-07-20", events: [], legacy: false, logs: [], totalOperatingMinutes: 0, totalIdleMinutes: 0, totalMaintenanceMinutes: 0, totalMealBreakMinutes: 0, totalMobilizationMinutes: 0, totalDemobilizationMinutes: 0, status: "Draft", createdAt: "2026-07-20T00:00:00.000Z", updatedAt: "2026-07-20T00:00:00.000Z" };

describe("canonical Rental DEUR operator identity", () => {
  it("uses the Rental operator for normal Rental Workspace and Daily Operations resolution", () => {
    expect(resolveRentalDeurOperator(rental, [original, reassigned])).toBe(original);
    expect(getDeurRentalEligibility([rental], [equipment], [original, reassigned], [project], [assignment]).eligible[0]).toMatchObject({ operatorId: original.id, operatorLabel: original.name });
  });

  it("does not let assignment reassignment rewrite DEUR authority or historical Rental identity", () => {
    const before = structuredClone(rental);
    expect(resolveRentalDeurOperator(rental, [original, reassigned])?.id).toBe(original.id);
    expect(evaluateOperatorDigitalDeurAccess({ actor: { id: original.id, name: original.name, role: "Operator" }, operator: original, assignment, rental, deurs: [], evaluationTimestamp: "2026-07-20T01:00:00.000Z" })).toMatchObject({ allowed: true, operatorId: original.id });
    expect(evaluateOperatorDigitalDeurAccess({ actor: { id: reassigned.id, name: reassigned.name, role: "Operator" }, operator: reassigned, assignment, rental, deurs: [], evaluationTimestamp: "2026-07-20T01:00:00.000Z" })).toMatchObject({ allowed: false, issues: [{ code: "RENTAL_OPERATOR_MISMATCH" }] });
    expect(rental).toEqual(before);
  });

  it("continues resolving an existing DEUR under the same historical operator", () => {
    expect(evaluateOperatorDigitalDeurAccess({ actor: { id: original.id, name: original.name, role: "Operator" }, operator: original, assignment, rental, deurs: [existingDeur], evaluationTimestamp: "2026-07-20T01:00:00.000Z" })).toMatchObject({ allowed: true, operatorId: original.id, activeDeurId: existingDeur.id });
    expect(existingDeur.operatorId).toBe(rental.operatorId);
  });
});
