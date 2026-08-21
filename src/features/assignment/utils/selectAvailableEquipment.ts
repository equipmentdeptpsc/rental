import type { AssignmentRecord } from "../types";
import type { EquipmentRecord } from "@/features/equipment/types";

export function selectAvailableEquipment(
  equipment: EquipmentRecord[],
  assignments: AssignmentRecord[],
  currentEquipmentId?: string,
  startDate?: string,
  endDate?: string,
): EquipmentRecord[] {
  return equipment.filter(item => {
    const scheduleAware = Boolean(startDate && endDate);
    if (item.deleted || item.active === false) return false;
    if (item.id === currentEquipmentId) return true;
    if (scheduleAware ? !["Available", "Assigned"].includes(item.status) : item.status !== "Available") return false;
    return !hasActiveAssignmentConflict(
      assignments,
      { equipmentId: item.id, startDate, expectedReturn: endDate },
      currentEquipmentId,
    );
  });
}

export function assignmentRange(assignment: Partial<AssignmentRecord>): { startDate: string; endDate: string } {
  const startDate = assignment.startDate || assignment.assignedDate || "";
  return { startDate, endDate: assignment.expectedReturn || startDate };
}

export function dateRangesOverlap(startA: string, endA: string, startB: string, endB: string): boolean {
  return Boolean(startA && endA && startB && endB) && startA <= endB && startB <= endA;
}

export function getActiveAssignmentConflictMessage(
  assignments: AssignmentRecord[],
  candidate: Pick<AssignmentRecord, "equipmentId" | "operatorId"> & Partial<AssignmentRecord>,
  currentAssignmentId?: string,
): string | undefined {
  const candidateRange = assignmentRange(candidate);
  const conflict = assignments.find((assignment) => {
    if (assignment.status !== "Active" || assignment.id === currentAssignmentId) return false;
    const range = assignmentRange(assignment);
    const sameResource = assignment.equipmentId === candidate.equipmentId || assignment.operatorId === candidate.operatorId;
    if (!sameResource) return false;
    if (!candidate.startDate && !candidate.assignedDate && !candidate.expectedReturn) return true;
    return dateRangesOverlap(candidateRange.startDate, candidateRange.endDate, range.startDate, range.endDate);
  });
  if (!conflict) return undefined;
  const range = assignmentRange(conflict);
  const resource = conflict.equipmentId === candidate.equipmentId ? "Equipment" : "Operator";
  return `${resource} is already booked from ${range.startDate} to ${range.endDate}.`;
}

export function hasActiveAssignmentConflict(
  assignments: AssignmentRecord[],
  candidate: Pick<AssignmentRecord, "equipmentId"> & Partial<AssignmentRecord>,
  currentAssignmentId?: string
): boolean {
  return Boolean(getActiveAssignmentConflictMessage(assignments, candidate as Pick<AssignmentRecord, "equipmentId" | "operatorId"> & Partial<AssignmentRecord>, currentAssignmentId));
}
