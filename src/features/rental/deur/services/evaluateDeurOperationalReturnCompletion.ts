import type { DeurRecord } from "../types";
import { deriveDeurEventState } from "./deriveDeurEventState";

export type DeurOperationalReturnIssueCode =
  | "ACTIVITY_STILL_RUNNING"
  | "SHIFT_NOT_COMPLETED"
  | "DEUR_NOT_SUBMITTED"
  | "COMPLETION_EVIDENCE_INCOMPLETE"
  | "DEUR_OPERATIONALLY_INCOMPLETE";

export interface DeurOperationalReturnIssue {
  code: DeurOperationalReturnIssueCode;
  requirement: string;
}

const submittedOrLater = new Set<DeurRecord["status"]>([
  "Submitted", "Pending Acknowledgement", "Acknowledged", "Rejected", "Billed",
]);

/** Canonical operational completion only. Customer review and financial state are intentionally excluded. */
export function evaluateDeurOperationalReturnCompletion(record: DeurRecord): { complete: boolean; issues: DeurOperationalReturnIssue[] } {
  const issues: DeurOperationalReturnIssue[] = [];
  const eventState = deriveDeurEventState(record);
  const openLegacyActivity = record.logs.some((log) => !log.endTime);
  if (eventState.openPrimaryActivity || openLegacyActivity) issues.push({ code: "ACTIVITY_STILL_RUNNING", requirement: "End the current activity before returning the equipment." });

  const timelineEvidence = record.evidenceMode === "TIME_TIMELINE" || (!record.evidenceMode && Boolean(record.events?.length));
  if (timelineEvidence) {
    if (!eventState.shiftCompleted && !record.endOfDay) issues.push({ code: "SHIFT_NOT_COMPLETED", requirement: "Select End Shift before returning the equipment." });
    if (eventState.structuralIssues.length) issues.push({ code: "DEUR_OPERATIONALLY_INCOMPLETE", requirement: "Correct the invalid operational event timeline before returning the equipment." });
  } else if ((record.logs.length > 0 || !record.evidenceMode) && !record.endOfDay) {
    issues.push({ code: "SHIFT_NOT_COMPLETED", requirement: "Complete the legacy shift before returning the equipment." });
  }

  if (record.evidenceMode === "ODOMETER_TRIP" && (!record.odometerTripEvidence || record.odometerTripEvidence.checkpoints.length < 2 || record.odometerTripEvidence.tripCount < 1)) issues.push({ code: "DEUR_OPERATIONALLY_INCOMPLETE", requirement: "Complete the required odometer-trip evidence before returning the equipment." });
  if (record.evidenceMode === "QUANTITY" && !record.quantityEvidence) issues.push({ code: "DEUR_OPERATIONALLY_INCOMPLETE", requirement: "Complete the required quantity evidence before returning the equipment." });
  if (record.evidenceMode === "COMPLETION" && record.completionEvidence?.status !== "COMPLETED") issues.push({ code: "COMPLETION_EVIDENCE_INCOMPLETE", requirement: "Complete the required completion evidence before returning the equipment." });
  if (!submittedOrLater.has(record.status)) issues.push({ code: "DEUR_NOT_SUBMITTED", requirement: "Submit the completed Digital DEUR before returning the equipment." });

  return { complete: issues.length === 0, issues: [...new Map(issues.map((issue) => [issue.code, issue])).values()] };
}
