import type { CanonicalDeurEvent, DeurRecord } from "../types";
const primary = new Set(["operation", "idle", "standby", "mealBreak", "breakdown"]);
export function deriveDeurEventState(record: Pick<DeurRecord, "events" | "status" | "legacy">) {
  const events = [...(record.events ?? [])].sort((a, b) => a.sequence - b.sequence || a.timestamp.localeCompare(b.timestamp));
  const open = new Map<string, CanonicalDeurEvent>(); const structuralIssues: string[] = [];
  let shiftStarted = false; let shiftCompleted = false;
  for (const event of events) {
    if (!Number.isFinite(Date.parse(event.timestamp))) structuralIssues.push("Invalid event timestamp.");
    if (event.activityType === "shift" && event.action === "start") { if (shiftStarted) structuralIssues.push("Duplicate shift start."); shiftStarted = true; }
    if (event.activityType !== "shift" && !shiftStarted) structuralIssues.push("Primary activity started before shift.");
    if (shiftCompleted) structuralIssues.push("Event recorded after shift end.");
    if (event.action === "start") { if (open.has(event.activityType)) structuralIssues.push(`Duplicate ${event.activityType} start.`); open.set(event.activityType, event); }
    else { if (!open.has(event.activityType)) structuralIssues.push(`End ${event.activityType} has no matching start.`); else open.delete(event.activityType); if (event.activityType === "shift") shiftCompleted = true; }
  }
  const openPrimaryActivity = [...open.keys()].find((x) => primary.has(x)) as "operation" | "idle" | "standby" | "mealBreak" | "breakdown" | undefined;
  if ([...open.keys()].filter((x) => primary.has(x)).length > 1) structuralIssues.push("More than one primary activity is open.");
  const immutable = record.legacy || ["Submitted", "Acknowledged", "Rejected"].includes(record.status);
  return { shiftNotStarted: !shiftStarted, shiftOpen: open.has("shift"), shiftCompleted, openPrimaryActivity, latestSequence: events.at(-1)?.sequence ?? 0, latestLogicalActionId: events.at(-1)?.logicalActionId ?? events.at(-1)?.actionGroupId, hasOpenInterval: open.size > 0, canUndo: events.length > 0 && !immutable, canSubmit: shiftCompleted && !openPrimaryActivity && structuralIssues.length === 0 && !immutable, structuralIssues };
}
