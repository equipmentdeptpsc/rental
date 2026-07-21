import { describe, expect, it } from "vitest";

import {
  getRentalAssignmentPrefill,
  getRentalEquipmentLabel,
  getRentalProjectOptions,
  selectAdminUsers,
} from "@/features/rental/utils/rentalFormOptions";
import type { AssignmentRecord } from "@/features/assignment/types";
import type { ProjectRecord } from "@/features/project/types";
import type { RentalFormData } from "@/features/rental/components/RentalForm";

const assignment: AssignmentRecord = {
  id: "assignment-1",
  equipmentId: "equipment-1",
  operatorId: "operator-1",
  projectId: "project-1",
  assignedDate: "2026-07-17",
  expectedReturn: "",
  remarks: "",
  status: "Active",
};

const project = (id: string, status: ProjectRecord["status"], deleted = false): ProjectRecord => ({
  id,
  projectCode: `PRJ-${id}`,
  projectName: `Project ${id}`,
  client: "",
  location: "",
  projectManager: "",
  startDate: "",
  targetCompletion: "",
  status,
  deleted,
});

describe("rental form options", () => {
  it("maps active projects to stable IDs and readable code-name labels", () => {
    expect(getRentalProjectOptions([
      project("active", "Active"),
      project("planning", "Planning"),
      project("deleted", "Active", true),
    ])).toEqual([{ value: "active", label: "PRJ-active - Project active" }]);
  });

  it("uses stable assignment relationships and readable equipment fallbacks", () => {
    expect(getRentalAssignmentPrefill(assignment)).toEqual({
      assignmentId: "assignment-1",
      equipmentId: "equipment-1",
      operatorId: "operator-1",
      projectId: "project-1",
    });
    expect(getRentalEquipmentLabel({ assetNo: "EQP-000001", equipmentName: "Excavator" })).toBe("EQP-000001 - Excavator");
    expect(getRentalEquipmentLabel(undefined)).toBe("Unknown equipment");
  });

  it("selects Admin users only for release", () => {
    expect(selectAdminUsers([
      { id: "admin", name: "Admin User", role: "Admin" },
      { id: "operator", name: "Operator User", role: "Operator" },
    ])).toEqual([{ id: "admin", name: "Admin User", role: "Admin" }]);
  });

  it("keeps lifecycle status out of editable rental form data", () => {
    const data: RentalFormData = {
      equipmentId: "equipment-1",
      customerId: "customer-1",
      customer: "Customer",
      operatorId: "operator-1",
      projectId: "project-1",
      dateOut: "2026-07-17",
      expectedReturn: "2026-07-18",
      rentalType: "Operated Rental",
          billingMethod: "Per Hour",
          deurExpectationFrequency: "PER_WORKDAY",
          expectedShiftCodes: ["DAY"],
          assignmentIds: [],
    };

    expect("status" in data).toBe(false);
    expect("statusId" in data).toBe(false);
  });
});
