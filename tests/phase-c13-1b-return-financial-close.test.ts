import { describe, expect, it } from "vitest";
import { buildRentalAggregate } from "@/features/rental/aggregate";
import { projectRentalCollectionStatus } from "@/features/rental/collections/collectionStatusProjection";
import type { DeurRecord } from "@/features/rental/deur/types";
import type { RentalEquipmentLine } from "@/features/rental/equipment-line";
import { returnRentalEquipmentLine } from "@/features/rental/services/returnRentalEquipmentLine";
import { resolveRentalStatusAfterLineReturn } from "@/features/rental/services/resolveRentalStatusAfterLineReturn";
import { detectClosedRentalIntegrityViolation } from "@/features/rental/services/detectClosedRentalIntegrityViolation";
import type { RentalRecord } from "@/features/rental/types";
import { buildCloseReadiness } from "@/features/rental/workspace/closing/CloseReadinessBuilder";

const rental: RentalRecord = { id: "rental", rentalNumber: "RENT-13", equipmentId: "", customer: "Customer", project: "Project", rentedBy: "Admin", dateOut: "2026-08-09", statusId: "returned", status: "Returned" };
const line = (id: string, equipmentId: string): RentalEquipmentLine => ({ id, rentalId: rental.id, equipmentId, assignmentId: `assignment-${id}`, operatorId: `operator-${id}`, status: "Returned", createdAt: "2026-08-09T00:00:00Z", updatedAt: "2026-08-09T08:00:00Z" });
const deur = (id: string, rentalEquipmentLineId: string, status: DeurRecord["status"]): DeurRecord => ({
  id, deurNumber: `DEUR-${id}`, rentalId: rental.id, rentalEquipmentLineId, assignmentId: `assignment-${rentalEquipmentLineId}`,
  equipmentId: rentalEquipmentLineId === "line-a" ? "equipment-a" : "equipment-b", operatorId: `operator-${rentalEquipmentLineId}`,
  workDate: "2026-08-09", logs: [], events: [], endOfDay: "2026-08-09T08:00:00Z", totalOperatingMinutes: 60,
  totalIdleMinutes: 0, totalMaintenanceMinutes: 0, totalMealBreakMinutes: 0, totalMobilizationMinutes: 0, totalDemobilizationMinutes: 0,
  status, createdAt: "2026-08-09T00:00:00Z", updatedAt: "2026-08-09T08:00:00Z",
});

const aggregate = (deurs: DeurRecord[], billing: Partial<ReturnType<typeof buildRentalAggregate>["billing"]>) => buildRentalAggregate({
  rental, rentalEquipmentLines: [line("line-a", "equipment-a"), line("line-b", "equipment-b")], deurs,
  billing: { hasStatement: true, invoicePreparationComplete: true, invoiceStatus: "Fully Collected", invoiced: 100_000, collected: 100_000, outstanding: 0, ...billing },
});

describe("Phase C13.1B physical return and financial close", () => {
  it("returns one line without mutating its historical identities", () => {
    const source = { ...line("line-a", "equipment-a"), status: "Active" as const };
    const result = returnRentalEquipmentLine({ rental: { ...rental, status: "Active" }, line: source, equipment: { id: "equipment-a", assetNo: "A", equipmentName: "A", prefixId: "", category: "Moving Equipment", maintenanceType: "Engine Hours", currentReading: 0, projectId: "project", operatorId: source.operatorId, status: "Rented" }, deurs: [deur("1", source.id, "Submitted")], returnedAt: "2026-08-09T09:00:00Z" });
    expect(result).toMatchObject({ success: true, line: { status: "Returned", id: source.id, assignmentId: source.assignmentId, operatorId: source.operatorId, equipmentId: source.equipmentId }, equipment: { status: "Available" } });
    expect(source.status).toBe("Active");
  });

  it("keeps a multi-line rental Active until every line is returned, then produces Returned and never Closed", () => {
    const returned = line("line-a", "equipment-a");
    const active = { ...line("line-b", "equipment-b"), status: "Active" as const };
    expect(resolveRentalStatusAfterLineReturn([returned, active])).toBe("Active");
    expect(resolveRentalStatusAfterLineReturn([returned, { ...active, status: "Returned" }])).toBe("Returned");
  });

  it("blocks an active DEUR before any return projection is produced", () => {
    const source = { ...line("line-a", "equipment-a"), status: "Active" as const };
    const active = { ...deur("5", source.id, "In Progress"), endOfDay: undefined, events: [{ id: "event", activityType: "operation" as const, action: "start" as const, timestamp: "2026-08-09T01:00:00Z", sequence: 1, source: "user" as const }] };
    expect(returnRentalEquipmentLine({ rental: { ...rental, status: "Active" }, line: source, equipment: { id: "equipment-a", assetNo: "A", equipmentName: "A", prefixId: "", category: "Moving Equipment", maintenanceType: "Engine Hours", currentReading: 0, projectId: "project", operatorId: source.operatorId, status: "Rented" }, deurs: [active], returnedAt: "2026-08-09T09:00:00Z" })).toMatchObject({ success: false, code: "ACTIVITY_STILL_RUNNING" });
    expect(source.status).toBe("Active");
  });

  it("requires every line's canonical DEUR and full collection before close", () => {
    const complete = [deur("A", "line-a", "Acknowledged"), deur("B", "line-b", "Acknowledged")];
    expect(buildCloseReadiness(aggregate(complete, {}), "2026-08-09T10:00:00Z").canClose).toBe(true);
    const oneIncomplete = buildCloseReadiness(aggregate([complete[0], deur("B", "line-b", "Pending Acknowledgement")], {}), "2026-08-09T10:00:00Z");
    expect(oneIncomplete).toMatchObject({ canClose: false, hasPendingOperations: true });
    expect(oneIncomplete.reasons.join(" ")).toContain("awaiting Customer acknowledgement");
    expect(buildCloseReadiness(aggregate(complete, { invoiceStatus: "Partially Collected", collected: 40_000, outstanding: 60_000 }), "2026-08-09T10:00:00Z")).toMatchObject({ canClose: false, hasOutstandingBalance: true });
  });

  it("projects collection independently from rental lifecycle status", () => {
    expect(projectRentalCollectionStatus({ hasStatement: false, totalInvoiced: 0, totalCollected: 0, outstandingBalance: 0 }).status).toBe("Not Billed");
    expect(projectRentalCollectionStatus({ hasStatement: true, totalInvoiced: 100, totalCollected: 40, outstandingBalance: 60 }).status).toBe("Partially Collected");
    expect(projectRentalCollectionStatus({ hasStatement: true, totalInvoiced: 100, totalCollected: 100, outstandingBalance: 0 }).status).toBe("Fully Collected");
    expect(projectRentalCollectionStatus({ hasStatement: true, totalInvoiced: 0, totalCollected: 0, outstandingBalance: 0 }).status).toBe("No Amount Due");
  });

  it("reports inconsistent historical Closed records without normalizing them", () => {
    const historical = aggregate([deur("A", "line-a", "Acknowledged")], { hasStatement: false, invoicePreparationComplete: false, invoiced: 0, collected: 0, outstanding: 0 });
    historical.rental = { ...historical.rental, status: "Closed" };
    expect(detectClosedRentalIntegrityViolation(historical, "DEUR_INCOMPLETE")).toEqual(expect.arrayContaining(["DEUR compliance is incomplete", "billing is incomplete", "collection is not settled"]));
    expect(historical.rental.status).toBe("Closed");
  });
});
