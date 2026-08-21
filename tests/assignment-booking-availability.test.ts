import { describe, expect, it } from "vitest";

import type { AssignmentRecord } from "@/features/assignment/types";
import {
  assignmentRange,
  dateRangesOverlap,
  getActiveAssignmentConflictMessage,
  selectAvailableEquipment,
} from "@/features/assignment/utils/selectAvailableEquipment";

const booking = (overrides: Partial<AssignmentRecord> = {}): AssignmentRecord => ({
  id: "assignment-1",
  equipmentId: "equipment-1",
  operatorId: "operator-1",
  projectId: "project-1",
  activityCodeId: "activity-1",
  assignedDate: "2026-08-21",
  startDate: "2026-08-25",
  expectedReturn: "2026-08-27",
  remarks: "",
  status: "Active",
  ...overrides,
});

describe("Assignment booking availability", () => {
  it("treats both range boundaries as inclusive", () => {
    expect(dateRangesOverlap("2026-08-20", "2026-08-25", "2026-08-25", "2026-08-30")).toBe(true);
    expect(dateRangesOverlap("2026-08-20", "2026-08-24", "2026-08-25", "2026-08-30")).toBe(false);
  });

  it("blocks overlapping equipment and operator bookings with a clear period", () => {
    const existing = booking();
    expect(getActiveAssignmentConflictMessage([existing], booking({ id: "assignment-2", operatorId: "operator-2" })))
      .toBe("Equipment is already booked from 2026-08-25 to 2026-08-27.");
    expect(getActiveAssignmentConflictMessage([existing], booking({ id: "assignment-2", equipmentId: "equipment-2" })))
      .toBe("Operator is already booked from 2026-08-25 to 2026-08-27.");
  });

  it("allows non-overlap and ignores completed or cancelled records", () => {
    const candidate = booking({ id: "candidate", startDate: "2026-08-28", expectedReturn: "2026-08-30" });
    expect(getActiveAssignmentConflictMessage([booking()], candidate)).toBeUndefined();
    expect(getActiveAssignmentConflictMessage([booking({ status: "Completed" }), booking({ id: "cancelled", status: "Cancelled" })], booking({ id: "candidate-2" }))).toBeUndefined();
  });

  it("excludes the edited booking itself while detecting other records", () => {
    const existing = booking();
    expect(getActiveAssignmentConflictMessage([existing], existing, existing.id)).toBeUndefined();
  });

  it("allows currently Assigned equipment for a later free period but keeps maintenance unavailable", () => {
    const equipment = [
      { id: "equipment-1", status: "Assigned", active: true, deleted: false },
      { id: "equipment-2", status: "Maintenance", active: true, deleted: false },
    ] as never[];
    expect(selectAvailableEquipment(equipment, [booking()], undefined, "2026-08-28", "2026-08-30").map((item) => item.id)).toEqual(["equipment-1"]);
  });

  it("uses legacy assigned date when start or end dates are absent", () => {
    expect(assignmentRange(booking({ startDate: undefined, expectedReturn: "" }))).toEqual({ startDate: "2026-08-21", endDate: "2026-08-21" });
  });
});
