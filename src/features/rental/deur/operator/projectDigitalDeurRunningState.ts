import type { DeurActivityTypeCanonical, DeurRecord } from "../types";
import { calculateDeurTotals } from "../services/calculateDeurTotals";
import type { DigitalDeurRunningState } from "./types";

export function projectDigitalDeurRunningState({ deur, evaluationTimestamp }: { deur: DeurRecord; evaluationTimestamp: string }): { valid: true; value: DigitalDeurRunningState } | { valid: false; code: string; message: string } {
  const evaluation = Date.parse(evaluationTimestamp); if (!Number.isFinite(evaluation)) return { valid: false, code: "DEUR_PROJECTION_TIMESTAMP_INVALID", message: "Evaluation timestamp is invalid." };
  const events = structuredClone(deur.events ?? []).sort((a, b) => a.sequence - b.sequence); const open = new Map<DeurActivityTypeCanonical, typeof events[number]>();
  events.forEach((event) => event.action === "start" ? open.set(event.activityType, event) : open.delete(event.activityType));
  const active = (["operation", "idle", "standby", "mealBreak", "breakdown"] as const).flatMap((type) => open.get(type) ? [open.get(type)!] : [])[0];
  if (active && evaluation < Date.parse(active.timestamp)) return { valid: false, code: "DEUR_PROJECTION_BEFORE_EVENT", message: "Evaluation timestamp precedes the active event." };
  const completed = calculateDeurTotals(events).totals, elapsedSeconds = active ? Math.floor((evaluation - Date.parse(active.timestamp)) / 1000) : 0, elapsedMinutes = elapsedSeconds / 60;
  const add = (type: DeurActivityTypeCanonical, minutes: number) => active?.activityType === type ? minutes + elapsedMinutes : minutes;
  return { valid: true, value: { ...(active ? { activeEventType: active.activityType, activeEventStartedAt: active.timestamp } : {}), activeEventElapsedSeconds: elapsedSeconds, completedOperationMinutes: completed.operationMinutes, projectedOperationMinutes: add("operation", completed.operationMinutes), completedIdleMinutes: completed.idleMinutes, projectedIdleMinutes: add("idle", completed.idleMinutes), completedStandbyMinutes: completed.standbyMinutes ?? 0, projectedStandbyMinutes: add("standby", completed.standbyMinutes ?? 0), completedMealBreakMinutes: completed.mealBreakMinutes, projectedMealBreakMinutes: add("mealBreak", completed.mealBreakMinutes), completedBreakdownMinutes: completed.breakdownMinutes, projectedBreakdownMinutes: add("breakdown", completed.breakdownMinutes), isRunning: Boolean(active) } };
}
