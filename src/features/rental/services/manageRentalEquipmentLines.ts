import type { AssignmentRecord } from "@/features/assignment/types";
import type { EquipmentRecord } from "@/features/equipment/types";
import type { RentalRecord } from "../types";
import type { NewRentalEquipmentLineInput, RentalEquipmentLine, RentalEquipmentLineIssue } from "../equipment-line";

const editableStatuses = new Set(["Draft", "Assigned", "Reserved"]);

export function validateRentalEquipmentLineInputs(input: {
  rental: Pick<RentalRecord, "id" | "projectId" | "status">;
  requested: NewRentalEquipmentLineInput[];
  existingLines: RentalEquipmentLine[];
  assignments: AssignmentRecord[];
  equipment: EquipmentRecord[];
  blockingEquipmentIds: Set<string>;
  blockingOperatorIds?: Set<string>;
  requireAtLeastOne?: boolean;
}): RentalEquipmentLineIssue[] {
  const issues: RentalEquipmentLineIssue[] = [];
  if (!editableStatuses.has(input.rental.status)) return [{ code: "RENTAL_NOT_EDITABLE", message: `Equipment lines cannot be changed while the Rental is ${input.rental.status}.` }];
  if (input.requireAtLeastOne && input.requested.length === 0) return [{ code: "ZERO_EQUIPMENT_LINES", message: "A Rental must contain at least one equipment line." }];
  const seen = new Set(input.existingLines.map((line) => line.equipmentId));
  const seenOperators = new Set(input.existingLines.map((line) => line.operatorId));
  for (const requested of input.requested) {
    if (seen.has(requested.equipmentId)) {
      issues.push({ code: "DUPLICATE_EQUIPMENT", equipmentId: requested.equipmentId, assignmentId: requested.assignmentId, message: `Equipment '${requested.equipmentId}' is duplicated in this Rental.` });
      continue;
    }
    seen.add(requested.equipmentId);
    if (seenOperators.has(requested.operatorId) || input.blockingOperatorIds?.has(requested.operatorId)) {
      issues.push({ code: "OPERATOR_WORK_CONFLICT", equipmentId: requested.equipmentId, assignmentId: requested.assignmentId, message: `Operator '${requested.operatorId}' already has conflicting active work.` });
    }
    seenOperators.add(requested.operatorId);
    const machine = input.equipment.find((item) => item.id === requested.equipmentId);
    if (!machine || machine.deleted || machine.active === false || !["Available", "Assigned"].includes(machine.status)) {
      issues.push({ code: "EQUIPMENT_UNAVAILABLE", equipmentId: requested.equipmentId, message: `Equipment '${requested.equipmentId}' is unavailable.` });
    }
    if (input.blockingEquipmentIds.has(requested.equipmentId)) {
      issues.push({ code: "EQUIPMENT_RENTAL_CONFLICT", equipmentId: requested.equipmentId, message: `Equipment '${requested.equipmentId}' already has a non-final Rental.` });
    }
    if (!requested.operatorId.trim()) issues.push({ code: "ASSIGNMENT_INVALID", equipmentId: requested.equipmentId, message: `Equipment '${requested.equipmentId}' requires an operator.` });
    if (requested.assignmentId) {
      const assignment = input.assignments.find((item) => item.id === requested.assignmentId);
      if (!assignment || assignment.status !== "Active" || assignment.equipmentId !== requested.equipmentId || assignment.operatorId !== requested.operatorId) {
        issues.push({ code: "ASSIGNMENT_INVALID", equipmentId: requested.equipmentId, assignmentId: requested.assignmentId, message: `Assignment '${requested.assignmentId}' is not active or does not match its equipment and operator.` });
      } else if (assignment.projectId !== input.rental.projectId) {
        issues.push({ code: "PROJECT_MISMATCH", equipmentId: requested.equipmentId, assignmentId: requested.assignmentId, message: `Equipment '${requested.equipmentId}' belongs to an Assignment for another Project.` });
      }
    }
  }
  return issues;
}

export function canRemoveRentalEquipmentLine(rental: Pick<RentalRecord, "status">, line: RentalEquipmentLine): RentalEquipmentLineIssue | undefined {
  if (!editableStatuses.has(rental.status)) return { code: "RENTAL_NOT_EDITABLE", rentalEquipmentLineId: line.id, equipmentId: line.equipmentId, message: `Equipment lines cannot be removed while the Rental is ${rental.status}.` };
  if (line.commercialSnapshot) return { code: "LINE_SNAPSHOT_LOCKED", rentalEquipmentLineId: line.id, equipmentId: line.equipmentId, message: "An equipment line with an immutable commercial snapshot cannot be removed." };
  return undefined;
}
