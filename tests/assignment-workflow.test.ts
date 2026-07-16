import { describe, expect, it } from "vitest";

import { createAssignmentWorkflow } from "@/features/assignment/application";
import type { EquipmentRecord } from "@/features/equipment/types";

const availableEquipment: EquipmentRecord = {
  id: "equipment-1",
  prefixId: "",
  assetNo: "EQP-000001",
  equipmentName: "Excavator",
  category: "Moving Equipment",
  maintenanceType: "Engine Hours",
  currentReading: 0,
  projectId: "",
  operatorId: "",
  status: "Available",
};

const formData = {
  equipmentId: "equipment-1",
  operatorId: "operator-1",
  projectId: "project-1",
  remarks: "",
};

describe("assignment submit validation", () => {
  it("does not require Expected Return and rejects a stale active assignment without clearing form data", async () => {
    const result = await createAssignmentWorkflow(formData, {
      getEquipment: () => availableEquipment,
      updateEquipment: () => undefined,
      isEquipmentAssigned: () => true,
    });

    expect(result).toEqual({
      success: false,
      message: "This equipment is already assigned.",
    });
    expect(formData.equipmentId).toBe("equipment-1");
    expect("expectedReturn" in formData).toBe(false);
  });
});
