import { describe, expect, it } from "vitest";
import { getAssignmentProjectError, getRentalAssignmentPrefill, getRentalProjectOptions } from "@/features/rental/utils/rentalFormOptions";
import type { AssignmentRecord } from "@/features/assignment/types";
import type { ProjectRecord } from "@/features/project/types";

const assignment: AssignmentRecord = { id: "assignment-1", equipmentId: "equipment-1", operatorId: "operator-1", projectId: "project-1", assignedDate: "", expectedReturn: "", remarks: "", status: "Active" };
const project = (id: string, status: ProjectRecord["status"]): ProjectRecord => ({ id, projectCode: `PRJ-${id}`, projectName: id, location: "", projectManager: "", status });

describe("rental assignment initialization", () => {
  it("preloads all stable assignment relationships", () => {
    expect(getRentalAssignmentPrefill(assignment)).toEqual({ assignmentId: "assignment-1", equipmentId: "equipment-1", operatorId: "operator-1", projectId: "project-1" });
  });

  it("keeps active project options selectable and reports invalid inherited projects", () => {
    expect(getRentalProjectOptions([project("project-1", "Active"), project("project-2", "Active"), project("old", "Planning")]).map((item) => item.value)).toEqual(["project-1", "project-2"]);
    expect(getAssignmentProjectError(assignment, [project("project-1", "Active")])).toBeUndefined();
    expect(getAssignmentProjectError(assignment, [project("project-1", "Planning")])).toBe("The assignment's project is inactive.");
    expect(getAssignmentProjectError(assignment, [])).toBe("The assignment's project could not be found.");
  });
});
