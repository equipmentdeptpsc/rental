import { beforeEach, describe, expect, it } from "vitest";
import { buildManagerApprovalEmailSnapshot } from "@/features/rental/approval-email/buildManagerApprovalEmailSnapshot";
import { APPROVAL_EMAIL_EXPIRY_HOURS, DEVELOPMENT_APPROVAL_EMAIL_OUTBOX_KEY, developmentApprovalEmailOutbox } from "@/features/rental/approval-email/developmentApprovalEmailOutbox";
import { managerApprovalEmailSubject, renderManagerApprovalEmail } from "@/features/rental/approval-email/renderManagerApprovalEmail";
import type { RentalRecord } from "@/features/rental/types";

const rental: RentalRecord = { id: "rental-1", rentalNumber: "RENT-00001", equipmentId: "equipment-1", customerId: "customer-1", projectId: "project-1", operatorId: "operator-1", assignmentId: "assignment-1", customer: "Customer A", project: "Project A", rentedBy: "Dispatcher", dateOut: "2026-07-22", expectedReturn: "2026-07-25", rentalType: "Operated Rental", statusId: "", status: "Reserved", approvalStatus: "Pending" };
const requestedAt = "2026-07-22T01:00:00.000Z";

function createSnapshot() {
  return buildManagerApprovalEmailSnapshot({
    rental,
    lines: [{ id: "line-1", rentalId: rental.id, equipmentId: "equipment-1", assignmentId: "assignment-1", operatorId: "operator-1", status: "Reserved", commercialSnapshotRequired: true, createdAt: requestedAt, updatedAt: requestedAt }],
    contracts: [{ id: "contract-1", rentalId: rental.id, rentalEquipmentLineId: "line-1", contractNo: "CON-1", customerId: "customer-1", equipmentId: "equipment-1", projectId: "project-1", rentalType: "Operated Rental", billingMethod: "Per Day", currency: "PHP", unitRate: 12500, contractAmount: 50000, operatorIncluded: true, fuelCharge: 0, vatApplicability: "Applicable", startDate: "2026-07-22", expectedEndDate: "2026-07-25", status: "Draft", createdAt: requestedAt, updatedAt: requestedAt }],
    equipment: [{ id: "equipment-1", prefixId: "prefix-1", assetNo: "ME-000001", equipmentName: "Excavator", category: "Moving Equipment", status: "Assigned", maintenanceType: "Engine Hours", currentReading: 100, projectId: "project-1", operatorId: "operator-1" }],
    assignments: [{ id: "assignment-1", equipmentId: "equipment-1", operatorId: "operator-1", projectId: "project-1", assignedDate: requestedAt, expectedReturn: "", remarks: "", status: "Active" }],
    operators: [{ id: "operator-1", name: "Operator One", email: "operator@example.test", licenseNumber: "LIC-1", certificationType: "Heavy Machinery", status: "Active", joinedDate: requestedAt }],
    project: { id: "project-1", projectCode: "PRJ-1", projectName: "Project A", customerId: "customer-1", location: "Site", projectManager: "Manager", status: "Active" },
    customer: { id: "customer-1", customerCode: "CUS-1", companyName: "Customer A", contactPerson: "Contact", contactNumber: "1", email: "customer@example.test", address: "Address", active: true },
    requestedBy: "Admin User", requestedAt, commercialTermsComplete: true, conflictsDetected: false,
  });
}

describe("Manager Rental Approval Email Snapshot", () => {
  beforeEach(() => localStorage.clear());

  it("builds the executive snapshot from canonical Rental relationships and commercial terms", () => {
    const snapshot = createSnapshot();
    expect(snapshot).toMatchObject({ rentalNumber: "RENT-00001", customer: "Customer A", project: "Project A", approvalStatus: "Pending", readiness: { assignmentComplete: true, commercialTermsComplete: true, equipmentAvailable: true, operatorAssigned: true, conflictsDetected: false } });
    expect(snapshot.equipment[0]).toEqual({ equipmentCode: "ME-000001", equipmentName: "Excavator", assetNumber: "ME-000001", assignedOperator: "Operator One", quantity: 1 });
    expect(snapshot.commercial[0]).toMatchObject({ billingMethod: "Per Day", unitRate: 12500, contractAmount: 50000, vatIncluded: true, fuelIncluded: false, operatorIncluded: true, commercialTermsConfigured: true, commercialSnapshotLocked: false });
  });

  it("renders a safe focused template without prohibited ERP details", () => {
    const snapshot = createSnapshot();
    const html = renderManagerApprovalEmail(snapshot, "/rental-approval/token");
    expect(managerApprovalEmailSubject(snapshot)).toBe("Rental Approval Required [RENT-00001] Customer A");
    expect(html).toContain("Rental Approval Request");
    expect(html).toContain("Approval does NOT release equipment");
    expect(html).not.toMatch(/audit history|DEUR records|invoice details|maintenance history|repository identifiers/i);
    expect(html).not.toContain(rental.id);
  });

  it("persists an immutable local preview with token, expiry and decision status", () => {
    const email = developmentApprovalEmailOutbox.create({ rentalId: rental.id, recipientName: "UAT Manager", recipient: "uat.manager@example.test", generatedAt: requestedAt, snapshot: createSnapshot() });
    expect(email.status).toBe("Pending");
    expect(email).toMatchObject({ recipientName: "UAT Manager", recipient: "uat.manager@example.test" });
    expect(new Date(email.expiresAt).getTime() - new Date(requestedAt).getTime()).toBe(APPROVAL_EMAIL_EXPIRY_HOURS * 60 * 60 * 1000);
    expect(developmentApprovalEmailOutbox.getByToken(email.approvalToken)?.snapshot.rentalNumber).toBe("RENT-00001");
    developmentApprovalEmailOutbox.setDecision(rental.id, "Approved", "2026-07-22T02:00:00.000Z");
    expect(developmentApprovalEmailOutbox.getById(email.id)?.status).toBe("Approved");
    expect(JSON.parse(localStorage.getItem(DEVELOPMENT_APPROVAL_EMAIL_OUTBOX_KEY) ?? "[]")).toHaveLength(1);
  });

  it("expires an unused token and surfaces readiness warnings without weakening submission rules", () => {
    const snapshot = buildManagerApprovalEmailSnapshot({ rental: { ...rental, customer: "", project: "" }, lines: [], contracts: [], equipment: [], assignments: [], operators: [], requestedBy: "Admin User", requestedAt, commercialTermsComplete: false, conflictsDetected: true });
    expect(snapshot.warnings).toEqual(expect.arrayContaining(["Customer is missing.", "Project is missing.", "Commercial Terms are incomplete.", "Equipment conflicts were detected."]));
    const email = developmentApprovalEmailOutbox.create({ rentalId: rental.id, recipientName: "UAT Manager", recipient: "uat.manager@example.test", generatedAt: requestedAt, snapshot });
    const afterExpiry = new Date(new Date(email.expiresAt).getTime() + 1).toISOString();
    expect(developmentApprovalEmailOutbox.getAll(afterExpiry)[0].status).toBe("Expired");
  });
});
