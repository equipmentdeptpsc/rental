import { describe, expect, it } from "vitest";
import { evaluateRentalDeurCompliance } from "@/features/rental/deur/compliance/evaluateRentalDeurCompliance";
import type { AssignmentRecord } from "@/features/assignment/types";
import type { DeurEvidenceMode, DeurRecord } from "@/features/rental/deur/types";
import type { RentalRecord } from "@/features/rental/types";
import { normalizeDeur } from "@/features/rental/deur/services/canonicalDeur";

const rental = (status: RentalRecord["status"] = "Active"): RentalRecord => ({
  id: "rental-1", rentalNumber: "R-1", equipmentId: "equipment-1", operatorId: "operator-1",
  customer: "Customer", project: "Project", rentedBy: "Admin", dateOut: "2026-07-01",
  billingMethod: "Per Hour", statusId: status, status,
});
const assignment: AssignmentRecord = { id: "assignment-1", equipmentId: "equipment-1", operatorId: "operator-1", projectId: "project-1", assignedDate: "2026-07-01", expectedReturn: "2026-07-31", remarks: "", status: "Active" };
const deur = (overrides: Partial<DeurRecord> = {}): DeurRecord => ({
  id: "deur-1", rentalId: "rental-1", equipmentId: "equipment-1", operatorId: "operator-1", workDate: "2026-07-01",
  status: "Acknowledged", legacy: false, creationSource: "OPERATOR_DIGITAL", evidenceMode: "TIME_TIMELINE",
  events: [], logs: [], totalOperatingMinutes: 0, totalIdleMinutes: 0, totalMaintenanceMinutes: 0,
  totalMealBreakMinutes: 0, totalMobilizationMinutes: 0, totalDemobilizationMinutes: 0,
  createdAt: "2026-07-01T08:00:00.000Z", updatedAt: "2026-07-01T12:00:00.000Z", ...overrides,
});
const evaluate = (deurs: DeurRecord[], status: RentalRecord["status"] = "Active") => evaluateRentalDeurCompliance({ rental: rental(status), assignment, deurs });

describe("rental DEUR compliance", () => {
  it("is missing only after the rental lifecycle expects a DEUR", () => {
    expect(evaluate([])).toMatchObject({ status: "MISSING_DEUR", required: true, counts: { effective: 0 } });
    expect(evaluate([], "Reserved")).toMatchObject({ status: "COMPLIANT", required: false });
    expect(evaluate([], "Cancelled")).toMatchObject({ status: "COMPLIANT", required: false });
  });

  it.each(["Draft", "In Progress", "Submitted"] as const)("reports %s-only evidence as incomplete", (status) => {
    expect(evaluate([deur({ status })])).toMatchObject({ status: "DEUR_INCOMPLETE", counts: { incomplete: 1 } });
  });

  it("recognizes effective acknowledged manual and digital DEURs", () => {
    expect(evaluate([deur()]).status).toBe("COMPLIANT");
    expect(evaluate([deur({ creationSource: "RENTAL_COMPANY_MANUAL" })]).status).toBe("COMPLIANT");
  });

  it.each(["TIME_TIMELINE", "ODOMETER_TRIP", "QUANTITY", "COMPLETION"] as DeurEvidenceMode[])("does not couple compliance to %s billing evidence", (evidenceMode) => {
    expect(evaluate([deur({ evidenceMode })])).toMatchObject({ status: "COMPLIANT", counts: { effective: 1 } });
  });

  it("ignores superseded revisions and uses the acknowledged effective replacement", () => {
    const original = deur({ revision: { chainId: "deur-1", revisionNumber: 1, originalDeurId: "deur-1", supersededByRevisionId: "deur-2" } });
    expect(evaluate([original])).toMatchObject({ status: "MISSING_DEUR", counts: { superseded: 1, effective: 0 } });
    const replacement = deur({ id: "deur-2", revision: { chainId: "deur-1", revisionNumber: 2, originalDeurId: "deur-1", previousRevisionId: "deur-1", supersedesRevisionId: "deur-1" } });
    expect(evaluate([original, replacement])).toMatchObject({ status: "COMPLIANT", counts: { superseded: 1, effective: 1 } });
  });

  it("reports a pending correction even while the previous acknowledged revision remains effective", () => {
    const original = deur({ revision: { chainId: "deur-1", revisionNumber: 1, originalDeurId: "deur-1" } });
    const correction = deur({ id: "deur-2", status: "Draft", revision: { chainId: "deur-1", revisionNumber: 2, originalDeurId: "deur-1", previousRevisionId: "deur-1", correctionReasonCode: "DATA_ENCODING_ERROR" } });
    expect(evaluate([original, correction])).toMatchObject({ status: "PENDING_CORRECTION", counts: { effective: 1, pendingCorrections: 1 } });
  });

  it("restores compliance when a correction is rejected", () => {
    const original = deur({ revision: { chainId: "deur-1", revisionNumber: 1, originalDeurId: "deur-1" } });
    const rejected = deur({ id: "deur-2", status: "Rejected", revision: { chainId: "deur-1", revisionNumber: 2, originalDeurId: "deur-1", previousRevisionId: "deur-1" } });
    expect(evaluate([original, rejected]).status).toBe("COMPLIANT");
  });

  it("is pure, serializable, and leaves billing and correction records unchanged", () => {
    const records = [deur({ billingLocked: true })], before = structuredClone(records);
    const result = evaluate(records);
    expect(records).toEqual(before);
    expect(result.status).toBe("COMPLIANT");
    expect(() => JSON.stringify(result)).not.toThrow();
  });

  it("accepts backward-compatible repository and synchronization payloads", () => {
    const persisted = JSON.parse(JSON.stringify(deur({ revision: undefined }))) as DeurRecord;
    expect(evaluate([normalizeDeur(persisted)])).toMatchObject({ status: "COMPLIANT", counts: { effective: 1 } });
  });
});
