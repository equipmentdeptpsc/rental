import { describe, expect, it } from "vitest";
import { evaluateRentalReleaseReadiness, regenerateRentalLineDeurExpectation } from "@/features/rental/services/evaluateRentalReleaseReadiness";
import type { RentalEquipmentLine } from "@/features/rental/equipment-line";
import type { RentalRecord } from "@/features/rental/types";

const now = "2026-08-02T00:00:00.000Z";
const rental = (overrides: Partial<RentalRecord> = {}): RentalRecord => ({ id: "r1", equipmentId: "e1", customerId: "c1", projectId: "p1", operatorId: "o1", assignmentId: "a1", customer: "Customer", project: "Project", rentedBy: "", dateOut: "2026-08-02", rentalType: "Operated Rental", billingMethod: "Per Hour", statusId: "reserved", status: "Reserved", approvalStatus: "Approved", deurExpectationPolicyRequired: true, deurExpectationPolicy: { frequency: "PER_SHIFT", effectiveFrom: "2026-08-02", expectedShiftCodes: ["DAY"], timezone: "Asia/Manila", capturedAt: now }, ...overrides });
const line = (id = "l1", equipmentId = "e1"): RentalEquipmentLine => ({ id, rentalId: "r1", equipmentId, assignmentId: `a${equipmentId.slice(-1)}`, operatorId: `o${equipmentId.slice(-1)}`, status: "Reserved", deurWorkDescriptionId: "w1", operationalMetadata: { costCode: { code: "C", name: "Cost" }, activityCode: { code: "A", name: "Activity" } }, commercialSnapshot: { billingMethod: "Per Hour", unitRate: 1, operatorIncluded: true, currency: "PHP", capturedAt: now }, commercialSnapshotRequired: true, createdAt: now, updatedAt: now });
function input(lines: RentalEquipmentLine[], source = rental()): Parameters<typeof evaluateRentalReleaseReadiness>[0] {
  return { rental: source, lines, assignments: lines.map((item) => ({ id: item.assignmentId!, equipmentId: item.equipmentId, operatorId: item.operatorId, projectId: "p1", status: "Active", assignedDate: "2026-08-02", expectedReturn: "2026-08-03", remarks: "" as const })), operators: lines.map((item) => ({ id: item.operatorId, name: item.operatorId, email: "operator@example.test", licenseNumber: "L", certificationType: "Heavy Machinery" as const, status: "Active" as const, joinedDate: "2026-01-01" })), equipment: lines.map((item) => ({ id: item.equipmentId, prefixId: "EQ", assetNo: item.equipmentId, equipmentName: item.equipmentId, category: "Moving Equipment" as const, status: "Assigned" as const, maintenanceType: "Engine Hours" as const, currentReading: 0, projectId: "p1", operatorId: item.operatorId, active: true })), projects: [{ id: "p1", projectCode: "P", projectName: "Project", location: "Site", projectManager: "Manager", status: "Active" as const }], contracts: lines.map((item) => ({ id: `c-${item.id}`, rentalId: "r1", rentalEquipmentLineId: item.id, contractNo: "C", customerId: "c1", equipmentId: item.equipmentId, projectId: "p1", rentalType: "Operated Rental" as const, billingMethod: "Per Hour" as const, currency: "PHP", unitRate: 1, operatorIncluded: true, startDate: "2026-08-02", expectedEndDate: "2026-08-03", status: "Active" as const, createdAt: now, updatedAt: now })), workDescriptions: [{ id: "w1", code: "WORK", name: "Earthmoving", active: true, operatorSelectable: true }], shiftWindows: [{ code: "DAY" as const, label: "Day", startTime: "08:00", endTime: "17:00", timezone: "Asia/Manila" }], timestamp: now };
}
function configured(lines: RentalEquipmentLine[], source = rental()) {
  return lines.map((item) => { const result = regenerateRentalLineDeurExpectation(input(lines, source), item.id); expect(result.snapshot).toBeDefined(); return { ...item, deurExpectationSnapshot: result.snapshot }; });
}

describe("mandatory DEUR release readiness", () => {
  it("allows one complete persisted line and blocks missing policy or operational metadata", () => {
    const complete = configured([line()]);
    expect(evaluateRentalReleaseReadiness(input(complete)).eligible).toBe(true);
    expect(evaluateRentalReleaseReadiness(input(complete, rental({ deurExpectationPolicy: undefined }))).reasonCodes).toContain("RELEASE_NOT_READY");
    expect(evaluateRentalReleaseReadiness(input([{ ...line(), operationalMetadata: undefined }])).incompleteEquipmentLines[0].missingFields).toContain("operationalMetadata");
  });
  it("blocks missing operator, assignment, project and required shifts", () => {
    const base = input([line()]); base.operators = []; base.assignments = []; base.projects = [];
    expect(evaluateRentalReleaseReadiness(base).incompleteEquipmentLines[0].missingFields).toEqual(expect.arrayContaining(["operator", "assignment", "project"]));
    const noShift = rental({ deurExpectationPolicy: { frequency: "PER_SHIFT", effectiveFrom: "2026-08-02", expectedShiftCodes: [], capturedAt: now } });
    expect(evaluateRentalReleaseReadiness(input([line()], noShift)).incompleteEquipmentLines[0].missingFields).toContain("requiredShift");
  });
  it("requires all active lines, ignores cancelled lines, and rejects stale snapshots", () => {
    const two = configured([line("l1", "e1"), line("l2", "e2")]);
    expect(evaluateRentalReleaseReadiness(input(two)).eligible).toBe(true);
    expect(evaluateRentalReleaseReadiness(input([two[0], { ...two[1], deurExpectationSnapshot: undefined }])).eligible).toBe(false);
    expect(evaluateRentalReleaseReadiness(input([two[0], { ...line("l2", "e2"), status: "Cancelled" }])).eligible).toBe(true);
    expect(evaluateRentalReleaseReadiness(input([{ ...two[0], operatorId: "changed" }])).reasonCodes).toContain("STALE_SNAPSHOT");
    expect(evaluateRentalReleaseReadiness(input([two[0], { ...two[0] }])).reasonCodes).toContain("DUPLICATE_LINE_IDENTITY");
  });
  it("blocks invalid shift windows and permits a regenerated candidate after source changes", () => {
    const invalid = input([line()]); invalid.shiftWindows[0] = { ...invalid.shiftWindows[0], startTime: "bad" };
    expect(evaluateRentalReleaseReadiness(invalid).incompleteEquipmentLines[0].missingFields).toEqual(expect.arrayContaining(["deurPolicy", "shiftWindow"]));
    const original = configured([line()])[0]; const changed = { ...original, operatorId: "o2" }; const source = input([changed]); source.operators.push({ ...source.operators[0], id: "o2" }); source.assignments[0] = { ...source.assignments[0], operatorId: "o2" };
    expect(evaluateRentalReleaseReadiness(source).eligible).toBe(false);
    const regenerated = regenerateRentalLineDeurExpectation(source, changed.id);
    expect(regenerated.eligible).toBe(true); expect(regenerated.snapshot).toBeDefined();
  });
  it("does not falsely require a meter for non-meter billing and blocks incompatible required meters", () => {
    expect(evaluateRentalReleaseReadiness(input(configured([line()]))).eligible).toBe(true);
    const meteredLine = { ...line(), commercialSnapshot: { ...line().commercialSnapshot!, billingMethod: "Per Kilometer" as const } };
    const applicable = input([meteredLine]); applicable.contracts[0].billingMethod = "Per Kilometer";
    expect(evaluateRentalReleaseReadiness(applicable).incompleteEquipmentLines[0].missingFields).toContain("meterConfiguration");
  });
});
