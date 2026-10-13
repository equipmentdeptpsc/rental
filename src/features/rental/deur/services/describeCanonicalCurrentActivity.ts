import type { DeurRecord } from "../types";
import { deriveDeurEventState } from "./deriveDeurEventState";

const activeLabels: Record<string, string> = {
  operation: "Operating", idle: "Idle / Waiting", standby: "Standby",
  mealBreak: "Meal Break", breakdown: "Breakdown",
};

/** A display projection only. Event sequence and persisted lifecycle state remain authoritative. */
export function describeCanonicalCurrentActivity(deur: DeurRecord): { label: string; occurredAt?: string } {
  const events = [...(deur.events ?? [])].sort((left, right) => left.sequence - right.sequence || left.timestamp.localeCompare(right.timestamp));
  const latest = events.at(-1);
  if (deur.status === "Rejected") return { label: "Correction Requested", occurredAt: deur.rejectedAt ?? latest?.timestamp };
  if (deur.status === "Acknowledged" || deur.status === "Billed") return { label: "Acknowledged", occurredAt: deur.acknowledgedAt ?? latest?.timestamp };
  if (deur.status === "Submitted" || deur.status === "Pending Acknowledgement") return { label: "Under Customer Review", occurredAt: deur.submittedAt ?? latest?.timestamp };
  const state = deriveDeurEventState(deur);
  if (state.structuralIssues.length) return { label: "Timeline needs review", occurredAt: latest?.timestamp };
  if (state.openPrimaryActivity) return { label: activeLabels[state.openPrimaryActivity], occurredAt: latest?.timestamp };
  if (state.shiftCompleted || deur.endOfDay) return { label: "Shift Completed", occurredAt: latest?.timestamp ?? deur.endOfDay };
  if (state.shiftOpen) return { label: "Shift Active — no activity recorded", occurredAt: latest?.timestamp };
  return { label: "Activity not yet synchronized" };
}
