import type { AssignmentRecord } from "../types";
import type { EquipmentRecord } from "@/features/equipment/types";

export function selectAvailableEquipment(
  equipment: EquipmentRecord[],
  assignments: AssignmentRecord[],
  currentEquipmentId?: string
): EquipmentRecord[] {
  return equipment.filter(item =>
    item.id === currentEquipmentId || (
      item.status === "Available" &&
      !item.deleted &&
      item.active !== false &&
      !hasActiveAssignmentConflict(assignments, { equipmentId: item.id }, currentEquipmentId)
    )
  );
}

export function hasActiveAssignmentConflict(
  assignments: AssignmentRecord[],
  candidate: Pick<AssignmentRecord, "equipmentId"> & Partial<Pick<AssignmentRecord, "operatorId">>,
  currentAssignmentId?: string
): boolean {
  return assignments.some((assignment) =>
    assignment.status === "Active" &&
    assignment.id !== currentAssignmentId &&
    (assignment.equipmentId === candidate.equipmentId ||
      (candidate.operatorId !== undefined && assignment.operatorId === candidate.operatorId))
  );
}
