import { describe, expect, it } from "vitest";

import { createRentalOperationalMetadataSnapshot } from "@/features/rental/services/createRentalOperationalMetadataSnapshot";
import type { EquipmentRecord } from "@/features/equipment/types";
import type { AssignmentRecord } from "@/features/assignment/types";
import type { CostCodeRecord } from "@/features/masters/cost-code";
import type { ActivityCodeRecord } from "@/features/masters/activity-code";

const equipment: EquipmentRecord = { id: "equipment", prefixId: "", assetNo: "EQ-1", equipmentName: "Excavator", category: "Moving Equipment", maintenanceType: "Engine Hours", currentReading: 0, projectId: "", operatorId: "", status: "Assigned", costCodeId: "cost" };
const assignment: AssignmentRecord = { id: "assignment", equipmentId: "equipment", operatorId: "operator", projectId: "project", assignedDate: "", expectedReturn: "", remarks: "", status: "Active", activityCodeId: "activity" };
const cost: CostCodeRecord = { id: "cost", code: " 5031HEAVYEQPT ", description: " Heavy Equipment ", defaultRate: 0, unit: "Hour", active: false, deleted: true };
const activity: ActivityCodeRecord = { id: "activity", activityCode: " LDC ", description: " LAUCHANCO DEVELOPMENT CORPORATION ", active: false, deleted: true };

describe("Rental operational metadata snapshot", () => {
  it("captures trimmed Cost Code and Activity Code IDs, codes, and names", () => {
    expect(createRentalOperationalMetadataSnapshot({ equipment, assignment, costCodes: [cost], activityCodes: [activity] })).toEqual({
      snapshot: {
        costCode: { id: "cost", code: "5031HEAVYEQPT", name: "Heavy Equipment" },
        activityCode: { id: "activity", code: "LDC", name: "LAUCHANCO DEVELOPMENT CORPORATION" },
      },
      issues: [],
      complete: true,
    });
  });

  it("snapshots resolvable inactive and deleted masters", () => {
    const result = createRentalOperationalMetadataSnapshot({ equipment, assignment, costCodes: [cost], activityCodes: [activity] });
    expect(result.complete).toBe(true);
    expect(result.snapshot.costCode?.code).toBe("5031HEAVYEQPT");
    expect(result.snapshot.activityCode?.code).toBe("LDC");
  });

  it("returns deterministic structured issues without fabricating values", () => {
    const missing = createRentalOperationalMetadataSnapshot({ equipment: { ...equipment, costCodeId: undefined }, costCodes: [], activityCodes: [] });
    expect(missing).toEqual({
      snapshot: {},
      issues: [
        { code: "COST_CODE_NOT_CONFIGURED" },
        { code: "ASSIGNMENT_NOT_AVAILABLE" },
      ],
      complete: false,
    });
    expect(JSON.stringify(missing)).not.toMatch(/UNKNOWN|N\/A|DEFAULT/);
  });

  it("reports unknown and invalid referenced masters in stable source order", () => {
    const notFound = createRentalOperationalMetadataSnapshot({ equipment, assignment, costCodes: [], activityCodes: [] });
    expect(notFound.issues.map((issue) => issue.code)).toEqual(["COST_CODE_NOT_FOUND", "ACTIVITY_CODE_NOT_FOUND"]);
    const invalid = createRentalOperationalMetadataSnapshot({ equipment, assignment, costCodes: [{ ...cost, code: "" }], activityCodes: [{ ...activity, description: "" }] });
    expect(invalid.issues.map((issue) => issue.code)).toEqual(["COST_CODE_INVALID", "ACTIVITY_CODE_INVALID"]);
  });

  it("reports missing Assignment Activity Code separately", () => {
    const result = createRentalOperationalMetadataSnapshot({ equipment, assignment: { ...assignment, activityCodeId: undefined }, costCodes: [cost], activityCodes: [activity] });
    expect(result.snapshot.costCode).toBeDefined();
    expect(result.snapshot.activityCode).toBeUndefined();
    expect(result.issues).toEqual([{ code: "ACTIVITY_CODE_NOT_CONFIGURED" }]);
  });

  it("returns detached serializable output without mutating inputs", () => {
    const inputs = { equipment: structuredClone(equipment), assignment: structuredClone(assignment), costCodes: [structuredClone(cost)], activityCodes: [structuredClone(activity)] };
    const before = structuredClone(inputs);
    const result = createRentalOperationalMetadataSnapshot(inputs);
    result.snapshot.costCode!.name = "Mutated";
    expect(inputs).toEqual(before);
    expect(cost.description).toBe(" Heavy Equipment ");
    expect(() => JSON.stringify(result)).not.toThrow();
  });

  it("never includes Work Description", () => {
    const result = createRentalOperationalMetadataSnapshot({ equipment, assignment, costCodes: [cost], activityCodes: [activity] });
    expect("workDescription" in result.snapshot).toBe(false);
  });
});
