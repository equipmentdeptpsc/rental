import { describe, expect, it } from "vitest";
import { resolveManualDeurContext } from "@/features/rental/workspace/deur/resolveManualDeurContext";

const project = { id: "project-1", projectCode: "UAT-PROJ-001", projectName: "UAT Project", location: "", projectManager: "", status: "Active" as const };
const customer = { id: "customer-1", customerCode: "UAT-CUS-001", companyName: "UAT Customer", active: true };
const rental = { id: "rental-1", rentalNumber: "RNT-2026-000015", equipmentId: "equipment-1", customerId: customer.id, projectId: project.id, customer: customer.companyName, project: project.projectName, rentedBy: "admin", dateOut: "2026-09-27" };
const assignment = { id: "assignment-1", equipmentId: "equipment-1", operatorId: "operator-1", projectId: project.id, activityCodeId: "activity-1", assignedDate: "2026-09-27", status: "Active" as const };
const line = { id: "line-1", rentalId: rental.id, equipmentId: "equipment-1", assignmentId: assignment.id, operatorId: assignment.operatorId, status: "Active" as const, createdAt: "2026-09-27T00:00:00Z", updatedAt: "2026-09-27T00:00:00Z", deurExpectationSnapshot: { rentalEquipmentLineId: "line-1", rentalId: rental.id, equipmentId: "equipment-1", assignmentId: assignment.id, operatorId: assignment.operatorId, projectId: project.id, customerId: customer.id, policy: { frequency: "PER_WORKDAY", effectiveFrom: "2026-09-27", capturedAt: "2026-09-27T00:00:00Z" }, shiftWindows: [], workDescription: { id: "work-1", code: "UAT-WD-001", name: "Synthetic Work", requiresRemarks: false }, workDateRule: "RENTAL_DATE_OUT", workDate: "2026-09-27", meterRequirement: "odometer" as const, fuelEvidenceRequired: false, billingMethod: "Per Day" as const, operationalMetadata: { activityCode: { id: "activity-1", code: "UAT-ACT-001", name: "Synthetic Activity" } }, sourceFingerprint: "fingerprint", capturedAt: "2026-09-27T00:00:00Z" } };

describe("Manual DEUR canonical context", () => {
  it("projects project, customer, activity, work description, and frozen meter policy", () => {
    const result = resolveManualDeurContext({ rental, line, project, customer, assignment, activityCodes: [] });
    expect(result).toMatchObject({ project, customer, activityCode: { code: "UAT-ACT-001", name: "Synthetic Activity" }, workDescription: { code: "UAT-WD-001", name: "Synthetic Work" }, meterRequirement: "odometer", missing: [] });
  });

  it("uses canonical activity references when the snapshot only carries the assignment link", () => {
    const withoutActivity = { ...line, deurExpectationSnapshot: { ...line.deurExpectationSnapshot, operationalMetadata: {} } };
    const result = resolveManualDeurContext({ rental, line: withoutActivity, project, customer, assignment, activityCodes: [{ id: "activity-1", code: "UAT-ACT-001", name: "Synthetic Activity", active: true, sortOrder: 1 }] });
    expect(result.activityCode).toEqual({ code: "UAT-ACT-001", name: "Synthetic Activity" });
  });

  it.each([
    ["Project", { project: null }],
    ["Customer", { customer: null }],
    ["Activity Code", { line: { ...line, deurExpectationSnapshot: { ...line.deurExpectationSnapshot, operationalMetadata: {} }, } , activityCodes: [] }],
    ["Meter Requirement", { line: { ...line, deurExpectationSnapshot: { ...line.deurExpectationSnapshot, meterRequirement: undefined } } }],
  ])("reports missing canonical %s without defaults", (label, override) => {
    const result = resolveManualDeurContext({ rental, line: override.line ?? line, project: override.project === null ? undefined : project, customer: override.customer === null ? undefined : customer, assignment, activityCodes: override.activityCodes ?? [] });
    expect(result.missing).toContain(label);
  });
});
