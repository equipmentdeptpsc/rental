import type { DeurRecord } from "../types";
import { calculateDeurTotals } from "./calculateDeurTotals";
import { deriveDeurEventState } from "./deriveDeurEventState";

export type DeurSubmissionIssueCode =
  | "DEUR_NOT_EDITABLE"
  | "DEUR_RELATIONSHIP_REQUIRED"
  | "ODOMETER_TRIP_REQUIRED"
  | "QUANTITY_EVIDENCE_REQUIRED"
  | "COMPLETION_EVIDENCE_REQUIRED"
  | "SHIFT_COMPLETION_REQUIRED"
  | "ACTIVE_ACTIVITY_MUST_END"
  | "EVENT_EVIDENCE_INVALID"
  | "ACTIVITY_INTERVAL_REQUIRED";

export interface DeurSubmissionIssue {
  code: DeurSubmissionIssueCode;
  message: string;
  action: string;
}

export type DeurSubmissionValidation =
  | { eligible: true; totals?: ReturnType<typeof calculateDeurTotals>["totals"] }
  | { eligible: false; issues: readonly DeurSubmissionIssue[] };

export function validateDeurSubmission(record: DeurRecord): DeurSubmissionValidation {
  const issues: DeurSubmissionIssue[] = [];
  if (record.legacy || !["Draft", "In Progress"].includes(record.status)) {
    issues.push({ code: "DEUR_NOT_EDITABLE", message: "This DEUR is not editable.", action: "Refresh the page and open the current editable DEUR." });
  }
  if (!record.rentalId || !record.equipmentId || !record.operatorId) {
    issues.push({ code: "DEUR_RELATIONSHIP_REQUIRED", message: "Required Rental, Equipment, or Operator information is unavailable.", action: "Contact Rental Operations before submitting." });
  }
  if (issues.length) return { eligible: false, issues };

  if (record.evidenceMode === "ODOMETER_TRIP") {
    if (!record.odometerTripEvidence || record.odometerTripEvidence.checkpoints.length < 2 || record.odometerTripEvidence.tripCount < 1) {
      return { eligible: false, issues: [{ code: "ODOMETER_TRIP_REQUIRED", message: "A completed odometer trip is required.", action: "Enter the ending location and odometer reading, then end the shift." }] };
    }
    return { eligible: true };
  }
  if (record.evidenceMode === "QUANTITY") {
    return record.quantityEvidence
      ? { eligible: true }
      : { eligible: false, issues: [{ code: "QUANTITY_EVIDENCE_REQUIRED", message: "Completed quantity evidence is required.", action: "Enter the completed cubic-meter quantity before submitting." }] };
  }
  if (record.evidenceMode === "COMPLETION") {
    return record.completionEvidence?.status === "COMPLETED"
      ? { eligible: true }
      : { eligible: false, issues: [{ code: "COMPLETION_EVIDENCE_REQUIRED", message: "The One Lot work is not marked completed.", action: "End the shift to mark the work completed before submitting." }] };
  }

  const state = deriveDeurEventState(record);
  const calculation = calculateDeurTotals(record.events ?? []);
  if (state.hasOpenInterval) issues.push({ code: "ACTIVE_ACTIVITY_MUST_END", message: "An activity is still running.", action: "End the current activity or end the shift before submitting." });
  if (!state.shiftCompleted) issues.push({ code: "SHIFT_COMPLETION_REQUIRED", message: "The shift is not completed.", action: "Select End Shift before submitting." });
  if (state.structuralIssues.length || calculation.calculationIssues.length) issues.push({ code: "EVENT_EVIDENCE_INVALID", message: "The recorded activity timeline contains incomplete or invalid evidence.", action: "Review the activity timeline and close every interval before submitting." });
  if (!calculation.totals.operationMinutes && !calculation.totals.idleMinutes) issues.push({ code: "ACTIVITY_INTERVAL_REQUIRED", message: "No completed Operation or Idle interval is recorded.", action: "Record and complete an Operation or Idle interval before submitting." });
  return issues.length ? { eligible: false, issues: deduplicate(issues) } : { eligible: true, totals: calculation.totals };
}

function deduplicate(issues: readonly DeurSubmissionIssue[]): readonly DeurSubmissionIssue[] {
  return [...new Map(issues.map((issue) => [issue.code, issue])).values()];
}

export function formatDeurSubmissionIssues(issues: readonly DeurSubmissionIssue[]): string {
  return `Cannot submit Digital DEUR.\n\nComplete the following before submission:\n${issues.map((issue) => `• ${issue.message} ${issue.action}`).join("\n")}`;
}
