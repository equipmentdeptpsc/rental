import type { CanonicalDeurEvent, DeurTotals } from "../types";

export function calculateDeurTotals(events: CanonicalDeurEvent[]) {
  const totals: DeurTotals = { shiftMinutes: 0, operationMinutes: 0, idleMinutes: 0, mealBreakMinutes: 0 };
  const open = new Map<string, CanonicalDeurEvent>(); const issues: string[] = [];
  [...events].sort((a,b) => a.sequence - b.sequence).forEach((event) => {
    if (event.action === "start") open.set(event.activityType, event);
    else { const start = open.get(event.activityType); if (!start) { issues.push(`Unmatched ${event.activityType} end.`); return; } const minutes = (Date.parse(event.timestamp) - Date.parse(start.timestamp)) / 60000; if (!Number.isFinite(minutes) || minutes < 0) issues.push(`Invalid ${event.activityType} duration.`); else totals[`${event.activityType}Minutes` as keyof DeurTotals] += Math.round(minutes); open.delete(event.activityType); }
  });
  return { totals, calculationIssues: issues };
}
export const minutesToDecimalHours = (minutes: number) => Math.round((minutes / 60) * 100) / 100;
