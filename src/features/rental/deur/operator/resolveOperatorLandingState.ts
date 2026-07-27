import type { AssignmentRecord } from "@/features/assignment/types";
import type { RentalEquipmentLine } from "@/features/rental/equipment-line";
import type { RentalRecord } from "@/features/rental/types";
import type { DeurRecord } from "../types";
import { calendarDateAt } from "../expectation/dateRules";

export type OperatorLandingAction =
  | "START_SHIFT"
  | "CONTINUE_SHIFT"
  | "REVIEW_SUBMITTED_DEUR";

export interface OperatorLandingItem {
  assignment: AssignmentRecord;
  rental: RentalRecord;
  line: RentalEquipmentLine;
  deur?: DeurRecord;
  action: OperatorLandingAction;
}

export type OperatorLandingState =
  | { status: "NO_ACTIVE_ASSIGNMENT"; items: [] }
  | { status: "READY"; items: OperatorLandingItem[] };

const editable = (record: DeurRecord) =>
  record.creationSource === "OPERATOR_DIGITAL" &&
  ["Draft", "In Progress"].includes(record.status) &&
  !record.billingLocked &&
  !record.billId &&
  !record.billingStatementId &&
  !record.revision?.supersededByRevisionId;

export function resolveOperatorLandingState(input: {
  operatorId: string;
  assignments: readonly AssignmentRecord[];
  rentals: readonly RentalRecord[];
  lines: readonly RentalEquipmentLine[];
  deurs: readonly DeurRecord[];
  evaluationTimestamp: string;
}): OperatorLandingState {
  const activeAssignments = input.assignments.filter(
    (assignment) =>
      assignment.operatorId === input.operatorId &&
      assignment.status === "Active" &&
      !assignment.deleted,
  );

  const items = activeAssignments.flatMap((assignment) => {
    const lines = input.lines.filter(
      (line) =>
        line.assignmentId === assignment.id &&
        line.operatorId === input.operatorId &&
        line.equipmentId === assignment.equipmentId,
    );

    return lines.flatMap((line): OperatorLandingItem[] => {
      const rental = input.rentals.find(
        (candidate) =>
          candidate.id === line.rentalId &&
          ["Released", "Active"].includes(candidate.status),
      );
      if (!rental) return [];

      const related = input.deurs
        .filter(
          (record) =>
            record.rentalId === rental.id &&
            record.operatorId === input.operatorId &&
            (record.rentalEquipmentLineId
              ? record.rentalEquipmentLineId === line.id
              : record.equipmentId === line.equipmentId),
        )
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
      const active = related.find(editable);
      const workDate = calendarDateAt(input.evaluationTimestamp, rental.deurExpectationPolicy?.timezone);
      const submitted = related.find((record) =>
        record.workDate === workDate &&
        ["Submitted", "Pending Acknowledgement", "Acknowledged", "Rejected"].includes(
          record.status,
        ),
      );
      const deur = active ?? submitted;
      const action: OperatorLandingAction = active
        ? "CONTINUE_SHIFT"
        : submitted
          ? "REVIEW_SUBMITTED_DEUR"
          : "START_SHIFT";

      return [{ assignment, rental, line, deur, action }];
    });
  });

  return items.length
    ? { status: "READY", items: structuredClone(items) }
    : { status: "NO_ACTIVE_ASSIGNMENT", items: [] };
}
