import { beforeEach, describe, expect, it, vi } from "vitest";
import { storage } from "@/core/storage";
import type { DeurRecord } from "@/features/rental/deur/types";
import { applyDigitalDeurOperatorAction } from "@/features/rental/deur/operator/applyDigitalDeurOperatorAction";
import { acknowledgeDeur, submitDeur } from "@/features/rental/deur/services/reviewLifecycle";
import { evaluateDeurOperationalReturnCompletion } from "@/features/rental/deur/services/evaluateDeurOperationalReturnCompletion";
import { evaluateRentalEquipmentLineReturnReadiness } from "@/features/rental/services/evaluateRentalEquipmentLineReturnReadiness";
import type { RentalEquipmentLine } from "@/features/rental/equipment-line";
import type { RentalRecord } from "@/features/rental/types";

const rental: RentalRecord = { id: "rental-7", rentalNumber: "RENT-7", equipmentId: "equipment-7", customer: "Customer", project: "Project", rentedBy: "Admin", dateOut: "2026-08-10", statusId: "active", status: "Active", releasedAt: "2026-08-10T00:00:00Z", deurExpectationPolicyRequired: true, deurExpectationPolicy: { frequency: "PER_WORKDAY", effectiveFrom: "2026-08-10", timezone: "Asia/Manila", capturedAt: "2026-08-10T00:00:00Z" } };
const line: RentalEquipmentLine = { id: "line-7", rentalId: rental.id, equipmentId: rental.equipmentId, assignmentId: "assignment-7", operatorId: "operator-2", status: "Active", createdAt: "", updatedAt: "" };
const draft = (overrides: Partial<DeurRecord> = {}): DeurRecord => ({ id: "deur-7", deurNumber: "DEUR-000007", rentalId: rental.id, rentalEquipmentLineId: line.id, equipmentId: line.equipmentId, assignmentId: line.assignmentId, operatorId: line.operatorId, creationSource: "OPERATOR_DIGITAL", evidenceMode: "TIME_TIMELINE", workDate: "2026-08-10", logs: [], events: [], totalOperatingMinutes: 0, totalIdleMinutes: 0, totalMaintenanceMinutes: 0, totalMealBreakMinutes: 0, totalMobilizationMinutes: 0, totalDemobilizationMinutes: 0, status: "Draft", createdAt: "2026-08-10T00:00:00Z", updatedAt: "2026-08-10T00:00:00Z", ...overrides });
const evaluate = (deurs: DeurRecord[], targetLine = line) => evaluateRentalEquipmentLineReturnReadiness({ rental, line: targetLine, deurs, evaluationTimestamp: "2026-08-10T10:30:00Z" });

function completeSequence() {
  const started = applyDigitalDeurOperatorAction({ deur: draft(), action: "START_OPERATION", actionTimestamp: "2026-08-10T08:00:00Z", actor: { id: "user-2", name: "Operator 2" } });
  if (!started.success) throw new Error(started.message);
  const endedActivity = applyDigitalDeurOperatorAction({ deur: started.record, action: "END_ACTIVITY", actionTimestamp: "2026-08-10T09:00:00Z", actor: { id: "user-2", name: "Operator 2" } });
  if (!endedActivity.success) throw new Error(endedActivity.message);
  const endedShift = applyDigitalDeurOperatorAction({ deur: endedActivity.record, action: "END_SHIFT", actionTimestamp: "2026-08-10T10:00:00Z", actor: { id: "user-2", name: "Operator 2" } });
  if (!endedShift.success) throw new Error(endedShift.message);
  const submitted = submitDeur(endedShift.record, { id: "user-2", name: "Operator 2" }, "2026-08-10T10:05:00Z");
  if (!submitted.success) throw new Error(submitted.message);
  const acknowledged = acknowledgeDeur(submitted.record, { id: "customer", name: "Customer" }, "2026-08-10T10:10:00Z");
  if (!acknowledged.success) throw new Error(acknowledged.message);
  return { endedShift: endedShift.record, submitted: submitted.record, acknowledged: acknowledged.record };
}

describe("Phase C13.1D acknowledged DEUR return readiness", () => {
  beforeEach(() => storage.remove("equipment-rental-deur"));

  it("reproduces END_SHIFT -> Submit -> Acknowledge and remains return eligible without legacy endOfDay", () => {
    const sequence = completeSequence();
    expect(sequence.endedShift.endOfDay).toBeUndefined();
    expect(evaluateDeurOperationalReturnCompletion(sequence.submitted)).toMatchObject({ complete: true, issues: [] });
    expect(evaluate(sequence.submitted ? [sequence.submitted] : [])).toMatchObject({ eligible: true, deurId: "deur-7" });
    expect(evaluate(sequence.acknowledged ? [sequence.acknowledged] : [])).toMatchObject({ eligible: true, deurId: "deur-7" });
  });

  it("keeps precise missing, draft, open-activity, and incomplete-shift blockers", () => {
    expect(evaluate([])).toMatchObject({ eligible: false, reasonCodes: ["DEUR_REQUIRED", "DEUR_NOT_STARTED"] });
    expect(evaluate([draft()])).toMatchObject({ eligible: false, reasonCodes: expect.arrayContaining(["DEUR_NOT_SUBMITTED"]) });
    const open = applyDigitalDeurOperatorAction({ deur: draft(), action: "START_IDLE", actionTimestamp: "2026-08-10T08:00:00Z", actor: { name: "Operator 2" }, idleReason: { id: "waiting", labelSnapshot: "Waiting for materials" } });
    if (!open.success) throw new Error(open.message);
    expect(evaluate([open.record])).toMatchObject({ eligible: false, reasonCodes: expect.arrayContaining(["ACTIVITY_STILL_RUNNING"]) });
    const activityEnded = applyDigitalDeurOperatorAction({ deur: open.record, action: "END_ACTIVITY", actionTimestamp: "2026-08-10T09:00:00Z", actor: { name: "Operator 2" } });
    if (!activityEnded.success) throw new Error(activityEnded.message);
    const fakeSubmitted = { ...activityEnded.record, status: "Submitted" as const };
    expect(evaluate([fakeSubmitted])).toMatchObject({ eligible: false, reasonCodes: expect.arrayContaining(["SHIFT_NOT_COMPLETED"]), operatorMessage: expect.stringContaining("shift has not been completed") });
  });

  it("does not let acknowledgement conceal incomplete canonical operational evidence", () => {
    const incompleteAcknowledged = draft({ status: "Acknowledged", acknowledgedAt: "2026-08-10T10:00:00Z", events: [{ id: "shift", activityType: "shift", action: "start", timestamp: "2026-08-10T08:00:00Z", sequence: 1, source: "user" }] });
    expect(evaluate(incompleteAcknowledged ? [incompleteAcknowledged] : [])).toMatchObject({ eligible: false, reasonCodes: expect.arrayContaining(["SHIFT_NOT_COMPLETED"]) });
  });

  it("selects the current effective revision and remains line isolated", () => {
    const { acknowledged } = completeSequence();
    const revision1 = { ...acknowledged, id: "revision-1", revision: { chainId: "chain-7", revisionNumber: 1, originalDeurId: "revision-1", supersededByRevisionId: "revision-2" } };
    const revision2 = { ...acknowledged, id: "revision-2", deurNumber: "DEUR-000007", updatedAt: "2026-08-10T10:20:00Z", revision: { chainId: "chain-7", revisionNumber: 2, originalDeurId: "revision-1", previousRevisionId: "revision-1", supersedesRevisionId: "revision-1" } };
    expect(evaluate([revision1, revision2])).toMatchObject({ eligible: true, deurId: "revision-2" });
    const otherLine = { ...line, id: "line-8", equipmentId: "equipment-8", assignmentId: "assignment-8" };
    expect(evaluate([revision2], otherLine)).toMatchObject({ eligible: false, reasonCodes: ["DEUR_REQUIRED", "DEUR_NOT_STARTED"] });
  });

  it("preserves canonical shift completion through repository persistence and module re-instantiation", async () => {
    const { acknowledged } = completeSequence();
    const first = await import("@/features/rental/deur/repository/deurRepository");
    first.deurRepository.create(acknowledged);
    vi.resetModules();
    const restoredRepository = (await import("@/features/rental/deur/repository/deurRepository")).deurRepository;
    const restored = restoredRepository.getById(acknowledged.id)!;
    expect(restored.events?.at(-1)).toMatchObject({ activityType: "shift", action: "end" });
    expect(restored.endOfDay).toBeUndefined();
    expect(evaluate([restored])).toMatchObject({ eligible: true });
  });
});
