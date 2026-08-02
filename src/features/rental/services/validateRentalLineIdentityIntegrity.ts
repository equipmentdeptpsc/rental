import type { AssignmentRecord } from "@/features/assignment/types";
import type { EquipmentRecord } from "@/features/equipment/types";
import type { Operator } from "@/features/operators/types";
import type { ProjectRecord } from "@/features/project/types";
import type { RentalEquipmentLine } from "../equipment-line";
import type { RentalRecord } from "../types";

export interface RentalLineIdentityIntegrityIssue {
  rentalEquipmentLineId: string;
  code: "DUPLICATE_EQUIPMENT" | "ASSIGNMENT_MISSING" | "ASSIGNMENT_MISMATCH" | "OPERATOR_MISSING" | "EQUIPMENT_MISSING" | "PROJECT_MISMATCH";
  message: string;
}

export function validateRentalLineIdentityIntegrity(input: {
  rental: RentalRecord;
  lines: readonly RentalEquipmentLine[];
  assignments: readonly AssignmentRecord[];
  operators: readonly Operator[];
  equipment: readonly EquipmentRecord[];
  projects: readonly ProjectRecord[];
}): RentalLineIdentityIntegrityIssue[] {
  const lines = input.lines.filter((line) => line.rentalId === input.rental.id && line.status !== "Cancelled");
  const issues: RentalLineIdentityIntegrityIssue[] = [];
  const equipmentIds = new Set<string>();
  const project = input.projects.find((item) => item.id === input.rental.projectId && item.status === "Active" && !item.deleted);
  for (const line of lines) {
    if (equipmentIds.has(line.equipmentId)) issues.push({ rentalEquipmentLineId: line.id, code: "DUPLICATE_EQUIPMENT", message: `Equipment '${line.equipmentId}' appears more than once in this Rental.` });
    equipmentIds.add(line.equipmentId);
    const machine = input.equipment.find((item) => item.id === line.equipmentId && item.active !== false && !item.deleted);
    if (!machine) issues.push({ rentalEquipmentLineId: line.id, code: "EQUIPMENT_MISSING", message: `Equipment '${line.equipmentId}' was not found or is inactive.` });
    const assignment = input.assignments.find((item) => item.id === line.assignmentId);
    if (!assignment) issues.push({ rentalEquipmentLineId: line.id, code: "ASSIGNMENT_MISSING", message: `Assignment '${line.assignmentId ?? "not captured"}' was not found.` });
    else if (assignment.status !== "Active" || assignment.equipmentId !== line.equipmentId || assignment.operatorId !== line.operatorId || assignment.projectId !== input.rental.projectId) {
      issues.push({ rentalEquipmentLineId: line.id, code: "ASSIGNMENT_MISMATCH", message: `Assignment '${assignment.id}' no longer matches the Rental equipment line.` });
    }
    const operator = input.operators.find((item) => item.id === line.operatorId && item.status === "Active");
    if (!operator) issues.push({ rentalEquipmentLineId: line.id, code: "OPERATOR_MISSING", message: "The assigned operator record is missing. Return to the rental workspace and correct the assignment before continuing." });
    if (!project) issues.push({ rentalEquipmentLineId: line.id, code: "PROJECT_MISMATCH", message: "The Rental project is missing, inactive, or does not match the Assignment." });
  }
  return issues;
}
