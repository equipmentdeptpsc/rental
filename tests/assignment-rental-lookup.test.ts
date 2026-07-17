import { describe, expect, it } from "vitest";
import { assignmentRentalUrl, resolveAssignmentRentalLookup } from "@/features/rental/utils/assignmentRentalLookup";
import type { AssignmentRecord } from "@/features/assignment/types";

const assignment = (id = "assignment-1", status: AssignmentRecord["status"] = "Active"): AssignmentRecord => ({ id, equipmentId: "equipment-1", operatorId: "operator-1", projectId: "project-1", assignedDate: "", expectedReturn: "", remarks: "", status });

describe("assignment rental lookup", () => {
  it("uses the exact persisted assignment ID, including encoded and trimmed values", () => {
    const record = assignment("id /? one");
    expect(resolveAssignmentRentalLookup("id%20%2F%3F%20one", [record])).toEqual({ state: "found", assignment: record });
    expect(resolveAssignmentRentalLookup(" assignment-1 ", [assignment()]).state).toBe("found");
  });

  it("reports malformed, loading, missing, and ineligible states distinctly", () => {
    expect(resolveAssignmentRentalLookup("", [assignment()]).state).toBe("malformed");
    expect(resolveAssignmentRentalLookup("%", [assignment()]).state).toBe("malformed");
    expect(resolveAssignmentRentalLookup("assignment-1", []).state).toBe("loading");
    expect(resolveAssignmentRentalLookup("equipment-1", [assignment()]).state).toBe("missing");
    expect(resolveAssignmentRentalLookup("assignment-1", [assignment("assignment-1", "Completed")]).state).toBe("ineligible");
    expect(resolveAssignmentRentalLookup("assignment-1", [{ ...assignment(), deleted: true }]).state).toBe("missing");
  });

  it("builds an encoded assignment ID link without substituting equipment ID", () => {
    expect(assignmentRentalUrl("id /? one")).toBe("/rentals/new?assignment=id%20%2F%3F%20one");
  });
});
