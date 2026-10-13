import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import type { DeurRecord } from "@/features/rental/deur/types";
import { describeCanonicalCurrentActivity } from "@/features/rental/deur/services/describeCanonicalCurrentActivity";
import CurrentActivityCard from "@/features/rental/deur/components/CurrentActivityCard";
import { buildRentalLineOperations, selectDailyOperationsDeur } from "@/features/rental/workspace/deur/buildRentalLineOperations";
import type { RentalEquipmentLine } from "@/features/rental/equipment-line";

const base = (status: DeurRecord["status"], events: NonNullable<DeurRecord["events"]>): DeurRecord => ({
  id: "deur-1", rentalId: "rental-1", rentalEquipmentLineId: "line-1", equipmentId: "equipment-1", operatorId: "operator-1",
  workDate: "2026-10-13", status, logs: [], events, totalOperatingMinutes: 0, totalIdleMinutes: 0,
  totalMaintenanceMinutes: 0, totalMealBreakMinutes: 0, totalMobilizationMinutes: 0, totalDemobilizationMinutes: 0,
  createdAt: "2026-10-13T00:00:00Z", updatedAt: "2026-10-13T04:00:00Z",
});
const shiftStart = { id: "start", activityType: "shift" as const, action: "start" as const, timestamp: "2026-10-13T00:00:00Z", sequence: 1, source: "user" as const };
const operationStart = { id: "operation", activityType: "operation" as const, action: "start" as const, timestamp: "2026-10-13T01:00:00Z", sequence: 2, source: "user" as const };
const shiftEnd = { id: "end", activityType: "shift" as const, action: "end" as const, timestamp: "2026-10-13T04:00:00Z", sequence: 3, source: "user" as const };

describe("Rental Workspace Current Activity", () => {
  it("shows submitted review state when canonical events exist but legacy logs are empty", () => {
    expect(describeCanonicalCurrentActivity(base("Submitted", [shiftStart, operationStart, shiftEnd])).label).toBe("Under Customer Review");
  });
  it("uses sequence authority rather than a delayed event's client timestamp", () => {
    const delayed = { ...operationStart, timestamp: "2026-10-13T05:00:00Z" };
    const operationEnd = { ...operationStart, id: "operation-end", action: "end" as const, timestamp: "2026-10-13T02:00:00Z", sequence: 3 };
    expect(describeCanonicalCurrentActivity(base("In Progress", [operationEnd, delayed, shiftStart])).label).toBe("Shift Active — no activity recorded");
  });
  it("distinguishes completed, acknowledged and correction-requested milestones", () => {
    expect(describeCanonicalCurrentActivity(base("In Progress", [shiftStart, shiftEnd])).label).toBe("Shift Completed");
    expect(describeCanonicalCurrentActivity(base("Acknowledged", [shiftStart, shiftEnd])).label).toBe("Acknowledged");
    expect(describeCanonicalCurrentActivity(base("Rejected", [shiftStart, shiftEnd])).label).toBe("Correction Requested");
  });
  it("does not invent an operator activity when canonical events have not synchronized", () => {
    expect(describeCanonicalCurrentActivity(base("In Progress", [])).label).toBe("Activity not yet synchronized");
  });
  it("renders a submitted DEUR without the stale waiting message", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    await act(async () => root.render(createElement(CurrentActivityCard, { deur: base("Submitted", [shiftStart, shiftEnd]), equipment: "Crane 1" })));
    expect(container.textContent).toContain("Under Customer Review");
    expect(container.textContent).toContain("2026-10-13 · Crane 1");
    expect(container.textContent).not.toContain("Waiting for operator");
    await act(async () => root.unmount());
  });
  it("keeps each equipment line's milestone separate on a multi-line Rental", () => {
    const lines: RentalEquipmentLine[] = ["line-1", "line-2"].map((id) => ({ id, rentalId: "rental-1", equipmentId: `equipment-${id}`, operatorId: `operator-${id}`, status: "Active", createdAt: "2026-10-13T00:00:00Z", updatedAt: "2026-10-13T00:00:00Z" }));
    const states = buildRentalLineOperations({
      lines,
      deurs: [base("Submitted", [shiftStart, shiftEnd]), { ...base("In Progress", [shiftStart, operationStart]), id: "deur-2", rentalEquipmentLineId: "line-2" }],
      evaluatedAt: "2026-10-13T02:00:00Z",
    });
    expect(states.map((item) => item.currentActivity)).toEqual(["Under Customer Review", "Operating"]);
  });
  it("shows the return-day DEUR rather than a later-synchronized previous workday", () => {
    const previous = { ...base("Submitted", [shiftStart, shiftEnd]), id: "previous", updatedAt: "2026-10-15T05:00:00Z" };
    const returnDay = { ...base("Submitted", [shiftStart, shiftEnd]), id: "return", workDate: "2026-10-14", updatedAt: "2026-10-14T04:00:00Z" };
    expect(selectDailyOperationsDeur([returnDay, previous])?.id).toBe("return");
  });
});
