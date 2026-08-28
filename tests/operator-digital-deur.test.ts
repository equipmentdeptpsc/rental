import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AssignmentRecord } from "@/features/assignment/types";
import type { Operator } from "@/features/operators/types";
import type { RentalRecord } from "@/features/rental/types";
import type { DeurRecord } from "@/features/rental/deur/types";
import { evaluateOperatorDigitalDeurAccess } from "@/features/rental/deur/operator/evaluateOperatorDigitalDeurAccess";
import { resolveActiveOperatorDeur } from "@/features/rental/deur/operator/resolveActiveOperatorDeur";
import { applyDigitalDeurOperatorAction } from "@/features/rental/deur/operator/applyDigitalDeurOperatorAction";
import { projectDigitalDeurRunningState } from "@/features/rental/deur/operator/projectDigitalDeurRunningState";
import { storage } from "@/core/storage";
import { frozenDeurLine } from "./helpers/deurReleaseFixture";
import { prepareDeur } from "@/features/rental/deur/services/CreateDeurService";

const operator: Operator = { id: "operator-1", name: "Juan Operator", email: "j@site.test", licenseNumber: "L1", certificationType: "Heavy Machinery", status: "Active", joinedDate: "2026-01-01" };
const assignment: AssignmentRecord = { id: "assignment-1", equipmentId: "equipment-1", operatorId: operator.id, projectId: "project-1", assignedDate: "2026-07-20", expectedReturn: "2026-07-30", remarks: "", status: "Active" };
const rental = (overrides: Partial<RentalRecord> = {}): RentalRecord => ({ id: "rental-1", rentalNumber: "R-1", assignmentId: assignment.id, equipmentId: assignment.equipmentId, operatorId: operator.id, projectId: assignment.projectId, customer: "Customer", project: "Project", rentedBy: "Admin", dateOut: "2026-07-20", statusId: "active", status: "Active", operationalMetadata: { costCode: { code: "5031HEAVYEQPT", name: "Heavy Equipment" }, activityCode: { code: "ACT", name: "Activity" } }, commercialSnapshotRequired: true, commercialSnapshot: { billingMethod: "Per Hour", unitRate: 100, operatorIncluded: true, currency: "PHP", capturedAt: "2026-07-20T00:00:00.000Z" }, deurExpectationPolicyRequired: true, deurExpectationPolicy: { frequency: "PER_SHIFT", effectiveFrom: "2026-07-20", expectedShiftCodes: ["DAY"], timezone: "Asia/Manila", capturedAt: "2026-07-20T00:00:00.000Z" }, deurShiftWindowSnapshots: [{ code: "DAY", label: "Day Shift", startTime: "08:00", endTime: "17:00", timezone: "Asia/Manila", capturedAt: "2026-07-20T00:00:00.000Z" }], ...overrides });
const deur = (overrides: Partial<DeurRecord> = {}): DeurRecord => ({ id: "deur-1", rentalId: "rental-1", assignmentId: assignment.id, equipmentId: assignment.equipmentId, operatorId: operator.id, projectId: assignment.projectId, creationSource: "OPERATOR_DIGITAL", evidenceMode: "TIME_TIMELINE", billingMethodSnapshot: "Per Hour", commercialSnapshot: rental().commercialSnapshot, commercialSnapshotRequired: true, operationalMetadata: { costCode: { code: "5031HEAVYEQPT", name: "Heavy Equipment" }, activityCode: { code: "ACT", name: "Activity" }, workDescription: { name: "Material Hauling", requiresRemarks: false } }, workDate: "2026-07-20", shift: "Day", events: [], legacy: false, logs: [], totalOperatingMinutes: 0, totalIdleMinutes: 0, totalMaintenanceMinutes: 0, totalMealBreakMinutes: 0, totalMobilizationMinutes: 0, totalDemobilizationMinutes: 0, status: "Draft", createdAt: "2026-07-20T00:00:00.000Z", updatedAt: "2026-07-20T00:00:00.000Z", ...overrides });
const actor = { id: operator.id, name: operator.name, role: "Operator" };

describe("operator Digital DEUR access", () => {
  it("allows the assigned Operator only for Active Rentals", () => {
    expect(evaluateOperatorDigitalDeurAccess({ actor, operator, assignment, rental: rental(), deurs: [], evaluationTimestamp: "2026-07-20T01:00:00.000Z", shift: "Day" })).toMatchObject({ allowed: true, rentalId: "rental-1", assignmentId: "assignment-1", operatorId: "operator-1" });
    expect(evaluateOperatorDigitalDeurAccess({ actor, operator, assignment, rental: rental({ status: "Released" }), deurs: [], evaluationTimestamp: "2026-07-20T01:00:00.000Z", shift: "Day" })).toMatchObject({ allowed: false, issues: [{ code: "RENTAL_NOT_OPERATIONAL" }] });
  });
  it("uses the selected line's immutable release metadata for multi-equipment Rentals", () => {
    const multiRental = rental({
      equipmentId: "",
      assignmentId: undefined,
      operatorId: undefined,
      operationalMetadata: undefined,
    });
    const lineA = frozenDeurLine({ rental: multiRental, id: "line-a", equipmentId: "equipment-1", assignmentId: assignment.id, operatorId: operator.id, unitRate: 100 });
    const lineB = frozenDeurLine({ rental: multiRental, id: "line-b", equipmentId: "equipment-2", assignmentId: "assignment-2", operatorId: "operator-2", unitRate: 200 });
    const operatorB = { ...operator, id: "operator-2", name: "Second Operator" };
    const assignmentB = { ...assignment, id: "assignment-2", equipmentId: "equipment-2", operatorId: operatorB.id };
    lineA.deurExpectationSnapshot!.operationalMetadata = { costCode: { code: "C-A", name: "Cost A" }, activityCode: { code: "A-A", name: "Activity A" } };
    lineB.deurExpectationSnapshot!.operationalMetadata = { costCode: { code: "C-B", name: "Cost B" }, activityCode: { code: "A-B", name: "Activity B" } };

    expect(evaluateOperatorDigitalDeurAccess({ actor, operator, assignment, rental: multiRental, rentalEquipmentLine: lineA, deurs: [], evaluationTimestamp: "2026-07-20T01:00:00.000Z", shift: "Day" })).toMatchObject({ allowed: true, rentalEquipmentLineId: "line-a" });
    expect(evaluateOperatorDigitalDeurAccess({ actor: { id: operatorB.id, name: operatorB.name, role: "Operator" }, operator: operatorB, assignment: assignmentB, rental: multiRental, rentalEquipmentLine: lineB, deurs: [], evaluationTimestamp: "2026-07-20T01:00:00.000Z", shift: "Day" })).toMatchObject({ allowed: true, rentalEquipmentLineId: "line-b" });
    expect(evaluateOperatorDigitalDeurAccess({ actor, operator, assignment, rental: multiRental, rentalEquipmentLine: { ...lineA, deurExpectationSnapshot: undefined }, deurs: [], evaluationTimestamp: "2026-07-20T01:00:00.000Z", shift: "Day" })).toMatchObject({ allowed: false, issues: [{ code: "OPERATIONAL_SNAPSHOT_REQUIRED" }] });
  });
  it("allows remote Operator preparation without exposing immutable financial evidence", () => {
    const current = rental({ equipmentId: "", assignmentId: undefined, operatorId: undefined, operationalMetadata: undefined });
    const line = frozenDeurLine({ rental: current, id: "line-a", equipmentId: assignment.equipmentId, assignmentId: assignment.id, operatorId: operator.id, unitRate: 100 });
    line.commercialSnapshot = undefined;
    expect(evaluateOperatorDigitalDeurAccess({ actor, operator, assignment, rental: current, rentalEquipmentLine: line, deurs: [], evaluationTimestamp: "2026-07-20T01:00:00.000Z", shift: "Day" })).toMatchObject({ allowed: false, issues: [{ code: "COMMERCIAL_SNAPSHOT_REQUIRED" }] });
    expect(evaluateOperatorDigitalDeurAccess({ actor, operator, assignment, rental: current, rentalEquipmentLine: line, deurs: [], evaluationTimestamp: "2026-07-20T01:00:00.000Z", shift: "Day", serverAuthoritativeCommercialEvidence: true })).toMatchObject({ allowed: true, rentalEquipmentLineId: "line-a" });
    const prepared = prepareDeur({
      authenticatedUser: { id: "user-1", username: "operator", displayName: operator.name, systemRoles: ["operator"], status: "active", operatorId: operator.id, createdAt: "2026-07-01T00:00:00.000Z", updatedAt: "2026-07-01T00:00:00.000Z" },
      enforceOperatorOwnership: true, serverAuthoritativeCommercialEvidence: true,
      rentalId: current.id, rentalEquipmentLineId: line.id, rentalEquipmentLine: line, rentalStatus: current.status, rental: current,
      equipmentId: line.equipmentId, assignmentId: line.assignmentId, operatorId: line.operatorId, projectId: current.projectId,
      shift: "Day", selectedWorkDescription: { id: "wd", code: "WD", name: "Work", active: true, operatorSelectable: true, requiresRemarks: false }, existingDeurs: [],
    });
    expect(prepared).toMatchObject({ success: true, record: { billingMethodSnapshot: "Per Hour", commercialSnapshot: undefined, commercialSnapshotRequired: true } });
  });
  it.each([
    [{ actor: { ...actor, id: "other", name: "Other" } }, "DEUR_ACCESS_NOT_AUTHORIZED"], [{ operator: undefined }, "OPERATOR_NOT_FOUND"], [{ assignment: undefined }, "ASSIGNMENT_NOT_FOUND"],
    [{ rental: rental({ status: "Draft" }) }, "RENTAL_NOT_OPERATIONAL"], [{ rental: rental({ status: "Returned" }) }, "RENTAL_NOT_OPERATIONAL"],
    [{ rental: rental({ operationalMetadata: undefined }) }, "OPERATIONAL_SNAPSHOT_REQUIRED"], [{ rental: rental({ commercialSnapshot: undefined }) }, "COMMERCIAL_SNAPSHOT_REQUIRED"],
    [{ actor: { ...actor, role: "Viewer" } }, "DEUR_ACCESS_NOT_AUTHORIZED"],
  ])("defaults denied with a structured issue", (overrides, code) => expect(evaluateOperatorDigitalDeurAccess({ actor, operator, assignment, rental: rental(), deurs: [], evaluationTimestamp: "2026-07-20T01:00:00.000Z", shift: "Day", ...overrides } as never)).toMatchObject({ allowed: false, issues: [expect.objectContaining({ code })] }));
  it("treats a structurally valid shift label as descriptive metadata", () => {
    expect(evaluateOperatorDigitalDeurAccess({ actor, operator, assignment, rental: rental(), deurs: [], evaluationTimestamp: "2026-07-20T01:00:00.000Z", shift: "Crew A / Late Entry" })).toMatchObject({ allowed: true, issues: [] });
  });
  it.each([{ billingLocked: true }, { billId: "bill" }, { revision: { chainId: "c", revisionNumber: 1, originalDeurId: "deur-1", supersededByRevisionId: "d2" } }])("denies locked, consumed, or superseded records", (overrides) => expect(evaluateOperatorDigitalDeurAccess({ actor, operator, assignment, rental: rental(), deurs: [deur(overrides)], evaluationTimestamp: "2026-07-20T01:00:00.000Z", shift: "Day" }).allowed).toBe(false));
});

describe("active Digital DEUR resolution", () => {
  it("returns none, resolves one editable Digital record, and ignores Manual/submitted records", () => {
    expect(resolveActiveOperatorDeur({ rentalId: "rental-1", operatorId: operator.id, deurs: [] })).toMatchObject({ status: "NONE" });
    expect(resolveActiveOperatorDeur({ rentalId: "rental-1", operatorId: operator.id, deurs: [deur()] })).toMatchObject({ status: "RESOLVED", record: { id: "deur-1" } });
    expect(resolveActiveOperatorDeur({ rentalId: "rental-1", operatorId: operator.id, deurs: [deur({ creationSource: "RENTAL_COMPANY_MANUAL" }), deur({ id: "submitted", status: "Submitted" })] })).toMatchObject({ status: "NONE" });
  });
  it("returns ambiguity without silently selecting newest and does not mutate input", () => {
    const input = [deur(), deur({ id: "deur-2", updatedAt: "2026-07-20T02:00:00.000Z" })], before = structuredClone(input);
    expect(resolveActiveOperatorDeur({ rentalId: "rental-1", operatorId: operator.id, deurs: input })).toMatchObject({ status: "AMBIGUOUS" }); expect(input).toEqual(before);
  });
});

describe("atomic operator timeline actions", () => {
  const apply = (record: DeurRecord, action: Parameters<typeof applyDigitalDeurOperatorAction>[0]["action"], timestamp: string) => applyDigitalDeurOperatorAction({ deur: record, action, actionTimestamp: timestamp, actor, idFactory: (() => { let value = 0; return () => `id-${++value}`; })() });
  it("starts shift and Operation explicitly, then atomically transitions through Meal Break, Breakdown, and resume", () => {
    const started = apply(deur(), "START_OPERATION", "2026-07-20T00:00:00.000Z"); expect(started).toMatchObject({ success: true, record: { status: "In Progress" } }); if (!started.success) return;
    expect(started.record.events?.map((event) => [event.activityType, event.action])).toEqual([["shift", "start"], ["operation", "start"]]);
    const meal = apply(started.record, "START_MEAL_BREAK", "2026-07-20T04:00:00.000Z"); if (!meal.success) throw Error(meal.message);
    const resumed = apply(meal.record, "RESUME_OPERATION", "2026-07-20T05:00:00.000Z"); if (!resumed.success) throw Error(resumed.message);
    const broken = apply(resumed.record, "START_BREAKDOWN", "2026-07-20T06:00:00.000Z"); if (!broken.success) throw Error(broken.message);
    const final = apply(broken.record, "RESUME_OPERATION", "2026-07-20T07:00:00.000Z"); if (!final.success) throw Error(final.message);
    expect(final.record.events?.filter((event) => event.action === "start").map((event) => event.activityType)).toEqual(["shift", "operation", "mealBreak", "operation", "breakdown", "operation"]);
    expect(final.record.totals).toMatchObject({ operationMinutes: 300, mealBreakMinutes: 60, breakdownMinutes: 60 });
  });
  it("rejects duplicates, earlier timestamps, submitted/locked/consumed/superseded records, and preserves input", () => {
    const started = apply(deur(), "START_OPERATION", "2026-07-20T01:00:00.000Z"); if (!started.success) throw Error(); const before = structuredClone(started.record);
    expect(apply(started.record, "START_OPERATION", "2026-07-20T02:00:00.000Z")).toMatchObject({ success: false });
    expect(apply(started.record, "START_MEAL_BREAK", "2026-07-20T00:30:00.000Z")).toMatchObject({ success: false }); expect(started.record).toEqual(before);
    for (const blocked of [deur({ status: "Submitted" }), deur({ billingLocked: true }), deur({ billId: "bill" }), deur({ revision: { chainId: "c", revisionNumber: 1, originalDeurId: "deur-1", supersededByRevisionId: "next" } })]) expect(apply(blocked, "START_OPERATION", "2026-07-20T01:00:00.000Z")).toMatchObject({ success: false });
  });
  it("ends the shift with no open interval using one timestamp", () => {
    const started = apply(deur(), "START_OPERATION", "2026-07-20T00:00:00.000Z"); if (!started.success) throw Error();
    const ended = apply(started.record, "END_SHIFT", "2026-07-20T08:00:00.000Z"); expect(ended).toMatchObject({ success: true }); if (ended.success) expect(ended.record.events?.slice(-2).map((event) => [event.activityType, event.action, event.timestamp])).toEqual([["operation", "end", "2026-07-20T08:00:00.000Z"], ["shift", "end", "2026-07-20T08:00:00.000Z"]]);
  });
});

describe("running projection and repository compare-and-set", () => {
  beforeEach(() => { storage.remove("equipment-rental-deur"); storage.remove("equipment-rental-deur-sync-queue"); vi.resetModules(); });
  it("reconstructs deterministic projected totals without mutating persisted evidence", () => {
    const action = applyDigitalDeurOperatorAction({ deur: deur(), action: "START_OPERATION", actionTimestamp: "2026-07-20T00:00:00.000Z", actor, idFactory: () => crypto.randomUUID() }); if (!action.success) throw Error(); const before = structuredClone(action.record);
    expect(projectDigitalDeurRunningState({ deur: action.record, evaluationTimestamp: "2026-07-20T01:30:00.000Z" })).toMatchObject({ valid: true, value: { activeEventType: "operation", activeEventElapsedSeconds: 5400, completedOperationMinutes: 0, projectedOperationMinutes: 90, isRunning: true } });
    expect(action.record).toEqual(before);
  });
  it("rejects an evaluation before the open event and keeps Meal Break/Breakdown separate from Operation", () => {
    const open = deur({ status: "In Progress", events: [{ id: "s", activityType: "shift", action: "start", timestamp: "2026-07-20T00:00:00.000Z", sequence: 1, source: "user" }, { id: "m", activityType: "mealBreak", action: "start", timestamp: "2026-07-20T04:00:00.000Z", sequence: 2, source: "user" }] });
    expect(projectDigitalDeurRunningState({ deur: open, evaluationTimestamp: "2026-07-20T03:00:00.000Z" })).toMatchObject({ valid: false });
    expect(projectDigitalDeurRunningState({ deur: open, evaluationTimestamp: "2026-07-20T05:00:00.000Z" })).toMatchObject({ valid: true, value: { projectedOperationMinutes: 0, projectedMealBreakMinutes: 60 } });
  });
  it("persists one transition, emits once, and rejects a stale reader without overwrite", async () => {
    const { deurRepository } = await import("@/features/rental/deur/repository/deurRepository"); const { subscribeDeurChanges } = await import("@/features/rental/deur/synchronization/deurChangeNotifications");
    deurRepository.create(deur()); const listener = vi.fn(); const stop = subscribeDeurChanges(listener); listener.mockClear();
    const first = deurRepository.applyOperatorAction({ deurId: "deur-1", expectedUpdatedAt: "2026-07-20T00:00:00.000Z", action: "START_OPERATION", actionTimestamp: "2026-07-20T01:00:00.000Z", actor });
    if (!first.success) throw new Error(JSON.stringify(first));
    expect(first).toMatchObject({ success: true }); expect(listener).toHaveBeenCalledOnce(); listener.mockClear();
    const stale = deurRepository.applyOperatorAction({ deurId: "deur-1", expectedUpdatedAt: "2026-07-20T00:00:00.000Z", action: "START_MEAL_BREAK", actionTimestamp: "2026-07-20T02:00:00.000Z", actor });
    expect(stale).toMatchObject({ success: false, code: "DEUR_STALE_VERSION", latest: { updatedAt: "2026-07-20T01:00:00.000Z" } }); expect(listener).not.toHaveBeenCalled(); stop();
  });
});
