import { describe, expect, it } from "vitest";
import type { AssignmentRecord } from "@/features/assignment/types";
import type { RentalEquipmentLine } from "@/features/rental/equipment-line";
import type { RentalRecord } from "@/features/rental/types";
import type { DeurRecord } from "@/features/rental/deur/types";
import { resolveOperatorLandingState } from "@/features/rental/deur/operator/resolveOperatorLandingState";
import { getVisibleNavigation } from "@/app/navigation/navigationConfig";
import { authorizationService } from "@/features/auth/services/AuthorizationService";
import type { User } from "@/features/auth/domain/user";

const assignment: AssignmentRecord = {
  id: "assignment-1", equipmentId: "equipment-1", operatorId: "operator-1",
  projectId: "project-1", assignedDate: "2026-07-28", expectedReturn: "2026-08-01",
  remarks: "", status: "Active",
};
const rental: RentalRecord = {
  id: "rental-1", rentalNumber: "R-1", equipmentId: "equipment-1",
  customer: "Customer", project: "Project", rentedBy: "User", dateOut: "2026-07-28",
  statusId: "active", status: "Active",
};
const line: RentalEquipmentLine = {
  id: "line-1", rentalId: rental.id, equipmentId: assignment.equipmentId,
  assignmentId: assignment.id, operatorId: assignment.operatorId, status: "Active",
  createdAt: "", updatedAt: "",
};
const deur = (status: DeurRecord["status"]): DeurRecord => ({
  id: `deur-${status}`, rentalId: rental.id, rentalEquipmentLineId: line.id,
  assignmentId: assignment.id, equipmentId: assignment.equipmentId,
  operatorId: assignment.operatorId, workDate: "2026-07-28",
  creationSource: "OPERATOR_DIGITAL", events: [], logs: [],
  totalOperatingMinutes: 0, totalIdleMinutes: 0, totalMaintenanceMinutes: 0,
  totalMealBreakMinutes: 0, totalMobilizationMinutes: 0,
  totalDemobilizationMinutes: 0, status, createdAt: "", updatedAt: status,
});

const resolve = (overrides: {
  assignments?: AssignmentRecord[];
  rentals?: RentalRecord[];
  lines?: RentalEquipmentLine[];
  deurs?: DeurRecord[];
} = {}) => resolveOperatorLandingState({
  operatorId: "operator-1",
  assignments: overrides.assignments ?? [assignment],
  rentals: overrides.rentals ?? [rental],
  lines: overrides.lines ?? [line],
  deurs: overrides.deurs ?? [],
  evaluationTimestamp: "2026-07-28T12:00:00Z",
});

describe("operator landing state", () => {
  it("shows My Shift navigation only to an application user with an Operator link", () => {
    const user: User = {
      id: "user-1", username: "operator", displayName: "Operator",
      systemRoles: ["rental-operations"], status: "active",
      createdAt: "", updatedAt: "",
    };
    const labels = (candidate: User) => getVisibleNavigation(candidate, authorizationService)
      .flatMap((group) => group.items.map((item) => item.label));
    expect(labels(user)).not.toContain("My Shift");
    expect(labels({ ...user, operatorId: "operator-1" })).toContain("My Shift");
  });

  it("shows no assignment without exposing unrelated work", () => {
    expect(resolve({ assignments: [{ ...assignment, operatorId: "other" }] }))
      .toEqual({ status: "NO_ACTIVE_ASSIGNMENT", items: [] });
  });

  it("offers shift start for a valid assignment and operational rental", () => {
    expect(resolve()).toMatchObject({
      status: "READY",
      items: [{ action: "START_SHIFT", assignment: { id: "assignment-1" }, rental: { id: "rental-1" } }],
    });
  });

  it("does not offer shift start until the Rental is Active", () => {
    expect(resolve({
      rentals: [{ ...rental, statusId: "released", status: "Released" }],
      lines: [{ ...line, status: "Released" }],
    })).toEqual({ status: "NO_ACTIVE_ASSIGNMENT", items: [] });
  });

  it("offers continue for one active DEUR", () => {
    expect(resolve({ deurs: [deur("In Progress")] })).toMatchObject({
      items: [{ action: "CONTINUE_SHIFT", deur: { status: "In Progress" } }],
    });
  });

  it("offers read-only review for a submitted DEUR", () => {
    expect(resolve({ deurs: [deur("Submitted")] })).toMatchObject({
      items: [{ action: "REVIEW_SUBMITTED_DEUR", deur: { status: "Submitted" } }],
    });
  });

  it("keeps an acknowledged DEUR visible while the canonical Assignment remains Active", () => {
    expect(resolve({ deurs: [deur("Acknowledged")] })).toMatchObject({
      status: "READY",
      items: [{ action: "REVIEW_SUBMITTED_DEUR", assignment: { status: "Active" }, deur: { status: "Acknowledged" } }],
    });
  });

  it("does not let a prior-day submitted DEUR block a new shift", () => {
    expect(resolve({ deurs: [{ ...deur("Submitted"), workDate: "2026-07-27" }] }))
      .toMatchObject({ items: [{ action: "START_SHIFT", deur: undefined }] });
  });
});
