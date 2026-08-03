import { beforeEach, describe, expect, it, vi } from "vitest";
import { storage } from "@/core/storage";
import { resolveOperatorDeurSeededFormState } from "@/features/rental/deur/operator/resolveOperatorDeurSeededFormState";
import { frozenDeurLine } from "./helpers/deurReleaseFixture";
import type { RentalRecord } from "@/features/rental/types";
import type { DeurRecord } from "@/features/rental/deur/types";
import { deurRepository } from "@/features/rental/deur/repository/deurRepository";
import { DevelopmentOutboxPublicCustomerReviewRepository } from "@/features/rental/customer-review/DevelopmentOutboxPublicCustomerReviewRepository";
import { DEVELOPMENT_CUSTOMER_REVIEW_OUTBOX_KEY, developmentCustomerReviewOutbox } from "@/features/rental/customer-review/developmentCustomerReviewOutbox";
import { aggregateRentalEquipmentLineDeurCompliance, evaluateRentalEquipmentLineDeurCompliance } from "@/features/rental/deur/compliance/evaluateRentalDeurCompliance";
import { resolveRentalWorkflowStatus } from "@/features/rental/workflow/resolveRentalWorkflowStatus";
import { subscribeRentalWorkspaceChange } from "@/features/rental/workspace/workspaceRefresh";

const rental: RentalRecord = { id: "rental-c112", rentalNumber: "R-C112", equipmentId: "", customer: "Customer", project: "Project", rentedBy: "", dateOut: "2026-08-03", statusId: "active", status: "Active", deurExpectationPolicy: { frequency: "ON_DEMAND", effectiveFrom: "2026-08-03", capturedAt: "2026-08-03T00:00:00.000Z" } };
const workA = { id: "work-a", code: "HAUL", name: "MATERIAL HAULING", active: true, operatorSelectable: true, requiresRemarks: false };
const workB = { id: "work-b", code: "EXC", name: "EXCAVATION", active: true, operatorSelectable: true, requiresRemarks: false };
const lineA = frozenDeurLine({ rental, id: "line-a", equipmentId: "equipment-a", assignmentId: "assignment-a", operatorId: "operator-a", work: workA, unitRate: 100 });
const lineB = frozenDeurLine({ rental, id: "line-b", equipmentId: "equipment-b", assignmentId: "assignment-b", operatorId: "operator-b", work: workB, unitRate: 100 });
lineA.deurExpectationSnapshot!.policy = { frequency: "PER_SHIFT", effectiveFrom: rental.dateOut, expectedShiftCodes: ["DAY"], capturedAt: "2026-08-03T00:00:00.000Z" };
lineA.deurExpectationSnapshot!.shiftWindows = [{ code: "DAY", label: "Day", startTime: "08:00", endTime: "17:00", timezone: "Asia/Manila", capturedAt: "2026-08-03T00:00:00.000Z" }];
lineB.deurExpectationSnapshot!.policy = { frequency: "PER_SHIFT", effectiveFrom: rental.dateOut, expectedShiftCodes: ["NIGHT"], capturedAt: "2026-08-03T00:00:00.000Z" };
lineB.deurExpectationSnapshot!.shiftWindows = [{ code: "NIGHT", label: "Night", startTime: "20:00", endTime: "05:00", timezone: "Asia/Manila", capturedAt: "2026-08-03T00:00:00.000Z" }];

const submitted = (id: string, lineId: string, equipmentId: string, operatorId: string): DeurRecord => ({ id, deurNumber: `DEUR-${id}`, rentalId: rental.id, rentalEquipmentLineId: lineId, equipmentId, operatorId, creationSource: "OPERATOR_DIGITAL", evidenceMode: "TIME_TIMELINE", workDate: rental.dateOut, shift: lineId === "line-a" ? "Day" : "Night", events: [], logs: [], totals: { shiftMinutes: 60, operationMinutes: 60, idleMinutes: 0, mealBreakMinutes: 0, breakdownMinutes: 0 }, totalOperatingMinutes: 60, totalIdleMinutes: 0, totalMaintenanceMinutes: 0, totalMealBreakMinutes: 0, totalMobilizationMinutes: 0, totalDemobilizationMinutes: 0, status: "Submitted", legacy: false, billingLocked: false, createdAt: "2026-08-03T00:00:00.000Z", updatedAt: "2026-08-03T01:00:00.000Z" });
const reviewInput = (deurId: string) => ({ deurId, deurNumber: `DEUR-${deurId}`, revisionNumber: 1, rentalNumber: rental.rentalNumber!, customerName: "Customer", representativeName: "Rep", representativeEmail: "rep@test.dev", snapshot: { project: "Project", equipment: deurId, operator: "Operator", workDate: rental.dateOut, operationMinutes: 60, idleMinutes: 0, breakdownMinutes: 0, origin: "OPERATOR_DIGITAL" } });

describe("Phase C11.2 seeded Operator form state", () => {
  it("hydrates the exact frozen canonical option and shift without label fallback", () => {
    expect(resolveOperatorDeurSeededFormState({ snapshot: lineA.deurExpectationSnapshot, workDescriptions: [] })).toMatchObject({ workDescriptionId: "", shift: "Day", valid: false });
    expect(resolveOperatorDeurSeededFormState({ snapshot: lineA.deurExpectationSnapshot, workDescriptions: [workA, workB] })).toMatchObject({ workDescriptionId: "work-a", shift: "Day", valid: true });
  });
  it("resets independently when switching lines and rejects missing or invalid frozen identities", () => {
    expect(resolveOperatorDeurSeededFormState({ snapshot: lineB.deurExpectationSnapshot, workDescriptions: [workA, workB] })).toMatchObject({ workDescriptionId: "work-b", shift: "Night", valid: true });
    expect(resolveOperatorDeurSeededFormState({ snapshot: { ...lineA.deurExpectationSnapshot!, workDescription: { ...lineA.deurExpectationSnapshot!.workDescription, id: "missing" } }, workDescriptions: [workA, workB] })).toMatchObject({ workDescriptionId: "", valid: false });
    expect(resolveOperatorDeurSeededFormState({ snapshot: undefined, workDescriptions: [workA, workB] })).toMatchObject({ workDescriptionId: "", shift: undefined, valid: false });
  });
});

describe("Phase C11.2 persisted multi-line Customer review projection", () => {
  const repository = new DevelopmentOutboxPublicCustomerReviewRepository();
  beforeEach(() => storage.clear());

  it("keeps one acknowledged and one pending line awaiting, then clears it after both acknowledgements", async () => {
    deurRepository.create(submitted("a", lineA.id, lineA.equipmentId, lineA.operatorId));
    deurRepository.create(submitted("b", lineB.id, lineB.equipmentId, lineB.operatorId));
    const reviewA = developmentCustomerReviewOutbox.create(reviewInput("a"));
    const reviewB = developmentCustomerReviewOutbox.create(reviewInput("b"));
    const refresh = vi.fn(); const unsubscribe = subscribeRentalWorkspaceChange(rental.id, refresh);

    await expect(repository.acknowledge(reviewA.token, { commandId: "a", idempotencyKey: "a" })).resolves.toMatchObject({ success: true });
    expect(deurRepository.getById("a")?.status).toBe("Acknowledged");
    expect(deurRepository.getById("b")?.status).toBe("Submitted");
    expect(resolveRentalWorkflowStatus({ rental, effectiveDeurs: deurRepository.getByRentalId(rental.id), commercialTermsAvailable: true, billableEvidence: true }).stage).toBe("AwaitingCustomerAcknowledgement");

    await expect(repository.acknowledge(reviewB.token, { commandId: "b", idempotencyKey: "b" })).resolves.toMatchObject({ success: true });
    const persisted = deurRepository.getByRentalId(rental.id);
    const perLine = evaluateRentalEquipmentLineDeurCompliance({ rental, lines: [lineA, lineB], deurs: persisted });
    const aggregate = aggregateRentalEquipmentLineDeurCompliance(rental.id, perLine);
    expect(aggregate).toMatchObject({ status: "COMPLIANT", compliantCount: 2, incompleteCount: 0, counts: { effective: 2, incomplete: 0 } });
    expect(resolveRentalWorkflowStatus({ rental, effectiveDeurs: persisted, commercialTermsAvailable: true, billableEvidence: true }).stage).toBe("BillingEligible");
    expect(refresh).toHaveBeenCalledTimes(2);
    unsubscribe();
  });

  it("survives repository re-instantiation and preserves single-use independent tokens", async () => {
    deurRepository.create(submitted("a", lineA.id, lineA.equipmentId, lineA.operatorId));
    deurRepository.create(submitted("b", lineB.id, lineB.equipmentId, lineB.operatorId));
    const first = developmentCustomerReviewOutbox.create(reviewInput("a"));
    const second = developmentCustomerReviewOutbox.create(reviewInput("b"));
    await repository.acknowledge(first.token, { commandId: "a", idempotencyKey: "a" });
    const restored = new DevelopmentOutboxPublicCustomerReviewRepository();
    await expect(restored.getSnapshot(first.token)).resolves.toEqual({ success: false, code: "ALREADY_COMPLETED" });
    await expect(restored.getSnapshot(second.token)).resolves.toMatchObject({ success: true, disposition: "AVAILABLE" });
    await expect(restored.acknowledge(first.token, { commandId: "replay", idempotencyKey: "replay" })).resolves.toEqual({ success: false, code: "ALREADY_COMPLETED" });
    expect(deurRepository.getById("a")?.reviewHistory?.filter((item) => item.action === "acknowledged")).toHaveLength(1);
    expect(storage.get(DEVELOPMENT_CUSTOMER_REVIEW_OUTBOX_KEY)).not.toBeNull();
  });
});
