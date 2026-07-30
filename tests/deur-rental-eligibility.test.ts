import { describe, expect, it } from "vitest";
import { getDeurRentalEligibility } from "@/features/rental/deur/services/deurRentalEligibility";

const rental = (status: any) => ({ id: status, rentalNumber: `R-${status}`, equipmentId: "eq", operatorId: "op", projectId: "pr", customer: "", project: "", rentedBy: "", dateOut: "", expectedReturn: "", status, statusId: "" });
const equipment: any[] = [{ id: "eq", assetNo: "EQP-1", equipmentName: "Excavator" }];
const operators: any[] = [{ id: "op", name: "Operator" }];
const projects: any[] = [{ id: "pr", projectCode: "PRJ-1", projectName: "Project" }];
describe("DEUR rental eligibility", () => {
  it("includes only active rentals with readable relationships", () => {
    const result = getDeurRentalEligibility([rental("Released"), rental("Active"), rental("Draft"), rental("Returned")], equipment, operators, projects, []);
    expect(result.eligible.map((item) => item.rentalId)).toEqual(["Active"]);
    expect(result.eligible[0].label).toContain("EQP-1 - Excavator");
    expect(result.excluded).toHaveLength(3);
  });
  it("returns explicit relationship exclusions", () => {
    expect(getDeurRentalEligibility([rental("Active")], [], operators, projects, []).excluded[0].reason).toBe("Equipment is missing.");
  });
});
