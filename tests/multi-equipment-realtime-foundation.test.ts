import { describe, expect, it } from "vitest";
import { buildRentalLineOperations } from "@/features/rental/workspace/deur/buildRentalLineOperations";
import { returnRentalEquipmentLine } from "@/features/rental/services/returnRentalEquipmentLine";
import { resolveOperatorLandingState } from "@/features/rental/deur/operator/resolveOperatorLandingState";
import { applyDigitalDeurOperatorAction } from "@/features/rental/deur/operator/applyDigitalDeurOperatorAction";
import { LocalVersionedDeurRepository } from "@/features/rental/deur/synchronization/LocalVersionedDeurRepository";
import type { DeurRecord } from "@/features/rental/deur/types";

const line = (id: string, equipmentId: string, operatorId: string) => ({
  id, rentalId: "rental-multi-001", equipmentId, assignmentId: `assignment-${id}`,
  operatorId, status: "Active" as const, createdAt: "", updatedAt: "",
});
const lines = [line("line-a", "excavator", "operator-a"), line("line-b", "truck", "operator-b"), line("line-c", "loader", "operator-c")];
const deur = (id: string, rentalEquipmentLineId: string, equipmentId: string, operatorId: string, activityType: "operation" | "idle"): DeurRecord => ({
  id, rentalId: "rental-multi-001", rentalEquipmentLineId, assignmentId: `assignment-${rentalEquipmentLineId}`,
  equipmentId, operatorId, workDate: "2026-07-29", creationSource: "OPERATOR_DIGITAL",
  events: [{ id: `${id}-shift`, activityType: "shift", action: "start", timestamp: "2026-07-29T00:00:00Z", sequence: 1, source: "user" },
    { id: `${id}-activity`, activityType, action: "start", timestamp: "2026-07-29T00:05:00Z", sequence: 2, source: "user" }],
  logs: [], totalOperatingMinutes: 0, totalIdleMinutes: 0, totalMaintenanceMinutes: 0,
  totalMealBreakMinutes: 0, totalMobilizationMinutes: 0, totalDemobilizationMinutes: 0,
  status: "In Progress", createdAt: "", updatedAt: "2026-07-29T00:05:00Z",
});

describe("RENT-MULTI-001 foundation", () => {
  it("projects three stable lines and simultaneous independent activities", () => {
    const records = [deur("deur-a", "line-a", "excavator", "operator-a", "operation"), deur("deur-b", "line-b", "truck", "operator-b", "idle")];
    const states = buildRentalLineOperations({ lines, deurs: records, evaluatedAt: "2026-07-29T01:05:00Z" });
    expect(states.map((item) => [item.line.id, item.currentActivity])).toEqual([["line-a", "operation"], ["line-b", "idle"], ["line-c", undefined]]);
    const changed = applyDigitalDeurOperatorAction({ deur: records[0], action: "START_IDLE", actionTimestamp: "2026-07-29T01:05:00Z", actor: { id: "operator-a", name: "A" } });
    expect(changed.success).toBe(true);
    expect(records[1].events).toHaveLength(2);
    expect(records[1].events?.at(-1)?.activityType).toBe("idle");
  });

  it("resolves only the matching Operator line and permits a ready second line", () => {
    const assignments = lines.map((item) => ({ id: item.assignmentId!, equipmentId: item.equipmentId, operatorId: item.operatorId, projectId: "project", assignedDate: "", expectedReturn: "", remarks: "", status: "Active" as const }));
    const rental = { id: "rental-multi-001", rentalNumber: "RENT-MULTI-001", equipmentId: "", customer: "Customer", project: "Project", rentedBy: "", dateOut: "", statusId: "active", status: "Active" as const };
    const resolved = resolveOperatorLandingState({ operatorId: "operator-a", assignments, rentals: [rental], lines, deurs: [], evaluationTimestamp: "2026-07-29T00:00:00Z" });
    expect(resolved).toMatchObject({ status: "READY", items: [{ line: { id: "line-a" }, action: "START_SHIFT" }] });
  });

  it("returns one line without changing the other lines", () => {
    const source = structuredClone(lines);
    const result = returnRentalEquipmentLine({ line: source[0], equipment: { id: "excavator", assetNo: "EXC-001", equipmentName: "Excavator", prefixId: "", category: "Moving Equipment", maintenanceType: "Engine Hours", currentReading: 0, projectId: "project", operatorId: "operator-a", status: "Rented" }, deurs: [], returnedAt: "2026-07-29T12:00:00Z" });
    expect(result).toMatchObject({ success: true, line: { status: "Returned" }, equipment: { status: "Available" } });
    expect(source.slice(1).map((item) => item.status)).toEqual(["Active", "Active"]);
  });

  it("rejects stale optimistic versions without overwriting the current DEUR", async () => {
    const record = deur("deur-a", "line-a", "excavator", "operator-a", "operation");
    const repository = new LocalVersionedDeurRepository([{ record, version: 2 }]);
    expect(await repository.save({ ...record, status: "Submitted" }, { expectedVersion: 1 })).toMatchObject({ success: false, code: "CONFLICT", currentVersion: 2 });
    expect(await repository.getById(record.id)).toMatchObject({ version: 2, record: { status: "In Progress" } });
  });
});
