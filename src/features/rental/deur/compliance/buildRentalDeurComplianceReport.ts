import type { AssignmentRecord } from "@/features/assignment/types";
import type { DeurShiftWindowDefinition, RentalRecord } from "@/features/rental/types";
import type { DeurRecord } from "../types";
import { evaluateRentalDeurCompliance } from "./evaluateRentalDeurCompliance";
import type { RentalDeurExpectationResult } from "../expectation/matchDeursToExpectations";
import type { RentalEquipmentLine } from "../../equipment-line";
import { aggregateRentalEquipmentLineDeurCompliance, evaluateRentalEquipmentLineDeurCompliance } from "./evaluateRentalDeurCompliance";

export function buildRentalDeurComplianceReport({ rentals, assignments, rentalEquipmentLines = [], deurs, evaluationTimestamp, liveShiftWindows }: { rentals: RentalRecord[]; assignments: AssignmentRecord[]; rentalEquipmentLines?: RentalEquipmentLine[]; deurs: DeurRecord[]; evaluationTimestamp: string; liveShiftWindows?: DeurShiftWindowDefinition[] }) {
  const monitored = rentals.map((rental) => {
    const assignment = rental.assignmentId ? assignments.find((item) => item.id === rental.assignmentId) : undefined;
    const lines = rentalEquipmentLines.filter((line) => line.rentalId === rental.id);
    const rentalDeurs = deurs.filter((item) => item.rentalId === rental.id);
    const lineResults = lines.length ? evaluateRentalEquipmentLineDeurCompliance({ rental, lines, deurs: rentalDeurs, evaluationTimestamp, liveShiftWindows }) : [];
    const result = lineResults.length ? aggregateRentalEquipmentLineDeurCompliance(rental.id, lineResults) : evaluateRentalDeurCompliance({ rental, assignment, deurs: rentalDeurs, evaluationTimestamp, liveShiftWindows });
    return { rental: structuredClone(rental), assignment: assignment ? structuredClone(assignment) : undefined, lines: structuredClone(lines), result };
  });
  type ReportRow = (typeof monitored)[number] & { expectation?: RentalDeurExpectationResult };
  const rows: ReportRow[] = [];
  monitored.filter(({ result }) => result.required && result.status !== "COMPLIANT").forEach((item) => {
    const expectations = item.result.expectations.filter((expectation) => ["MISSING", "INCOMPLETE", "PENDING_CORRECTION"].includes(expectation.status));
    if (expectations.length) expectations.forEach((expectation) => rows.push({ ...item, assignment: expectation.rentalEquipmentLineId ? assignments.find((candidate) => candidate.id === item.lines.find((line) => line.id === expectation.rentalEquipmentLineId)?.assignmentId) : item.assignment, expectation }));
    else rows.push({ ...item });
  });
  return { monitored: structuredClone(monitored), rows: structuredClone(rows) };
}
