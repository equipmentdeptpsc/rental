import type { AssignmentRecord } from "../types";
import type { EquipmentRecord } from "@/features/equipment/types";
import type { Operator } from "@/features/operators/types";
import type { ProjectRecord } from "@/features/project/types";

export function displayAssignmentExpectedReturn(value: string | undefined): string {
  if (!value || value.startsWith("1970-01-01")) return "—";
  return value;
}

export function displayAssignmentDate(value: string | undefined): string {
  if (!value || value.startsWith("1970-01-01")) return "—";
  return value;
}

export function getAssignmentNumber(assignmentId: string, assignments: readonly AssignmentRecord[]): string {
  const index = assignments.findIndex((assignment) => assignment.id === assignmentId);
  return index < 0 ? "ASN-UNAVAILABLE" : `ASN-${String(index + 1).padStart(6, "0")}`;
}

export function getAssignmentDisplayName(input: { assignment: AssignmentRecord; equipment?: EquipmentRecord; operator?: Operator; project?: ProjectRecord; displayName?: string }): string {
  const explicit = input.displayName?.trim();
  if (explicit) return explicit;
  const project = input.project?.projectName?.trim();
  const equipment = input.equipment ? `${input.equipment.assetNo} - ${input.equipment.equipmentName}` : undefined;
  const operator = input.operator?.name?.trim();
  const parts = [project, equipment, operator].filter(Boolean);
  return parts.length >= 2 ? parts.join(" — ") : "Assignment details unavailable";
}
