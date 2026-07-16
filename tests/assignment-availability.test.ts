import { describe, expect, it } from "vitest";
import {
  hasActiveAssignmentConflict,
  selectAvailableEquipment,
} from "@/features/assignment/utils/selectAvailableEquipment";
import type { EquipmentRecord } from "@/features/equipment/types";
import type { AssignmentRecord } from "@/features/assignment/types";

const equipment = (id: string, status: EquipmentRecord["status"], deleted = false): EquipmentRecord => ({ id, prefixId: "", assetNo: id, equipmentName: id, category: "Moving Equipment", maintenanceType: "Engine Hours", currentReading: 0, projectId: "", operatorId: "", status, deleted });
const assignment = (equipmentId: string): AssignmentRecord => ({ id: "a", equipmentId, operatorId: "o", projectId: "p", assignedDate: "", expectedReturn: "", remarks: "", status: "Active" });

describe("assignment equipment availability", () => {
  it("excludes unavailable and actively assigned equipment while retaining the edit selection", () => {
    const records = [equipment("available", "Available"), equipment("assigned", "Assigned"), equipment("rented", "Rented"), equipment("maintenance", "Maintenance"), equipment("deleted", "Available", true), equipment("active", "Available")];
    expect(selectAvailableEquipment(records, [assignment("active")]).map(item => item.id)).toEqual(["available"]);
    expect(selectAvailableEquipment(records, [assignment("active")], "assigned").map(item => item.id)).toContain("assigned");
  });

  it("rejects stale equipment or operator selections while allowing an assignment to update itself", () => {
    const active = { ...assignment("equipment-1"), operatorId: "operator-1" };

    expect(hasActiveAssignmentConflict([active], { equipmentId: "equipment-1", operatorId: "operator-2" })).toBe(true);
    expect(hasActiveAssignmentConflict([active], { equipmentId: "equipment-2", operatorId: "operator-1" })).toBe(true);
    expect(hasActiveAssignmentConflict([active], { equipmentId: "equipment-1", operatorId: "operator-1" }, active.id)).toBe(false);
  });
});
