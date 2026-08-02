import type { AssignmentRecord } from "@/features/assignment/types";
import type { EquipmentRecord } from "@/features/equipment/types";
import type { Operator } from "@/features/operators/types";
import type { ProjectRecord } from "@/features/project/types";
import type { RentalEquipmentLine } from "../../equipment-line";
import type { RentalRecord } from "../../types";

export type OperatorDeurRouteLineResolution =
  | { status: "NOT_SELECTED" }
  | { status: "LINE_NOT_FOUND"; message: "Rental equipment line not found." }
  | { status: "ASSIGNMENT_NOT_FOUND"; message: string }
  | { status: "OPERATOR_NOT_FOUND"; message: string }
  | { status: "EQUIPMENT_NOT_FOUND"; message: string }
  | { status: "PROJECT_NOT_FOUND"; message: string }
  | { status: "IDENTITY_MISMATCH"; message: string }
  | {
      status: "RESOLVED";
      line: RentalEquipmentLine;
      assignment: AssignmentRecord;
      operator: Operator;
      equipment: EquipmentRecord;
      project: ProjectRecord;
    };

export function buildOperatorDeurLineUrl(rentalId: string, lineId: string): string {
  return `/rentals/${encodeURIComponent(rentalId)}/operator-deur?lineId=${encodeURIComponent(lineId)}`;
}

export function resolveOperatorDeurSelectedLineId(
  requestedLineId: string,
  currentLineId: string,
  lines: readonly RentalEquipmentLine[],
): string {
  if (requestedLineId) return requestedLineId;
  if (currentLineId && lines.some((line) => line.id === currentLineId)) return currentLineId;
  return lines.length === 1 ? lines[0].id : "";
}

export function resolveOperatorDeurRouteLine(input: {
  rental?: RentalRecord;
  rentalId: string;
  lineId: string;
  lines: readonly RentalEquipmentLine[];
  assignments: readonly AssignmentRecord[];
  operators: readonly Operator[];
  equipment: readonly EquipmentRecord[];
  projects: readonly ProjectRecord[];
}): OperatorDeurRouteLineResolution {
  if (!input.lineId) return { status: "NOT_SELECTED" };
  const line = input.lines.find((item) => item.id === input.lineId && item.rentalId === input.rentalId);
  if (!line) return { status: "LINE_NOT_FOUND", message: "Rental equipment line not found." };
  const assignment = input.assignments.find((item) => item.id === line.assignmentId);
  if (!assignment) return { status: "ASSIGNMENT_NOT_FOUND", message: "The Rental equipment line's Assignment record no longer exists." };
  const operator = input.operators.find((item) => item.id === line.operatorId);
  if (!operator) return { status: "OPERATOR_NOT_FOUND", message: "The assigned operator record is missing. Return to the rental workspace and correct the assignment." };
  const equipment = input.equipment.find((item) => item.id === line.equipmentId);
  if (!equipment) return { status: "EQUIPMENT_NOT_FOUND", message: "The Rental equipment line's Equipment record no longer exists." };
  const project = input.projects.find((item) => item.id === input.rental?.projectId);
  if (!project) return { status: "PROJECT_NOT_FOUND", message: "The Rental Project record no longer exists." };
  if (
    assignment.status !== "Active" || assignment.operatorId !== line.operatorId ||
    assignment.equipmentId !== line.equipmentId || assignment.projectId !== input.rental?.projectId
  ) return { status: "IDENTITY_MISMATCH", message: "Rental equipment line relationships do not match the active Assignment." };
  const snapshot = line.deurExpectationSnapshot;
  if (snapshot && (
    snapshot.rentalEquipmentLineId !== line.id || snapshot.rentalId !== line.rentalId ||
    snapshot.assignmentId !== assignment.id || snapshot.operatorId !== operator.id ||
    snapshot.equipmentId !== equipment.id || snapshot.projectId !== project.id
  )) return { status: "IDENTITY_MISMATCH", message: "Rental equipment line identity does not match its frozen DEUR expectation snapshot." };
  return { status: "RESOLVED", line, assignment, operator, equipment, project };
}
