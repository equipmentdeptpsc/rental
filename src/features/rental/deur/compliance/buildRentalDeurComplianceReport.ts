import type { AssignmentRecord } from "@/features/assignment/types";
import type { DeurShiftWindowDefinition, RentalRecord } from "@/features/rental/types";
import type { DeurRecord } from "../types";
import { evaluateRentalDeurCompliance } from "./evaluateRentalDeurCompliance";
import type { RentalDeurExpectationResult } from "../expectation/matchDeursToExpectations";

export function buildRentalDeurComplianceReport({ rentals, assignments, deurs, evaluationTimestamp, liveShiftWindows }: { rentals: RentalRecord[]; assignments: AssignmentRecord[]; deurs: DeurRecord[]; evaluationTimestamp: string; liveShiftWindows?: DeurShiftWindowDefinition[] }) {
  const monitored = rentals.map((rental) => {
    const assignment = rental.assignmentId ? assignments.find((item) => item.id === rental.assignmentId) : undefined;
    const result = evaluateRentalDeurCompliance({ rental, assignment, deurs: deurs.filter((item) => item.rentalId === rental.id), evaluationTimestamp, liveShiftWindows });
    return { rental: structuredClone(rental), assignment: assignment ? structuredClone(assignment) : undefined, result };
  });
  type ReportRow = (typeof monitored)[number] & { expectation?: RentalDeurExpectationResult };
  const rows: ReportRow[] = [];
  monitored.filter(({ result }) => result.required && result.status !== "COMPLIANT").forEach((item) => {
    const expectations = item.result.expectations.filter((expectation) => ["MISSING", "INCOMPLETE", "PENDING_CORRECTION"].includes(expectation.status));
    if (expectations.length) expectations.forEach((expectation) => rows.push({ ...item, expectation }));
    else rows.push({ ...item });
  });
  return { monitored: structuredClone(monitored), rows: structuredClone(rows) };
}
