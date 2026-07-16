import { describe, expect, it } from "vitest";
import { generateAssetNumber } from "@/features/equipment/utils/generateAssetNumber";
import type { EquipmentRecord } from "@/features/equipment/types";

function item(assetNo: string): EquipmentRecord {
  return { id: assetNo, prefixId: "", assetNo, equipmentName: "Test", category: "Moving Equipment", maintenanceType: "Engine Hours", currentReading: 0, projectId: "", operatorId: "", status: "Available" };
}

describe("generateAssetNumber", () => {
  it("creates sequential numbers without reusing deleted records", () => {
    expect(generateAssetNumber([])).toBe("EQP-000001");
    expect(generateAssetNumber([item("EQP-000001"), { ...item("EQP-000003"), deleted: true }])).toBe("EQP-000004");
  });
});
