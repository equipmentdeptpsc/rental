import type { DeurRecord } from "../types";
import { applyDeurAction } from "../services/deurEventStateMachine";
import type { DeurOperatorAction } from "./types";

const mapping: Record<Exclude<DeurOperatorAction, "END_SHIFT">, "operation" | "idle" | "mealBreak" | "breakdown"> = { START_OPERATION: "operation", RESUME_OPERATION: "operation", START_IDLE: "idle", START_MEAL_BREAK: "mealBreak", START_BREAKDOWN: "breakdown" };
export function applyDigitalDeurOperatorAction({ deur, action, actionTimestamp, actor, idFactory }: { deur: DeurRecord; action: DeurOperatorAction; actionTimestamp: string; actor: { id?: string; name: string; role?: string }; idFactory?: () => string }) {
  const input = structuredClone(deur), timestamp = Date.parse(actionTimestamp);
  if (!Number.isFinite(timestamp)) return { success: false as const, code: "DEUR_ACTION_TIMESTAMP_INVALID", message: "Action timestamp is invalid." };
  if (input.creationSource !== "OPERATOR_DIGITAL" || !["Draft", "In Progress"].includes(input.status)) return { success: false as const, code: "DEUR_NOT_EDITABLE", message: "Digital DEUR is not editable." };
  if (input.billingLocked || input.billId || input.billingStatementId || input.status === "Billed") return { success: false as const, code: "DEUR_CONSUMED", message: "Billed or locked DEUR records cannot be changed." };
  if (input.revision?.supersededByRevisionId) return { success: false as const, code: "DEUR_SUPERSEDED", message: "Superseded DEUR records cannot be changed." };
  const latestTimestamp = Math.max(...(input.events ?? []).map((event) => Date.parse(event.timestamp)).filter(Number.isFinite), -Infinity);
  if (timestamp < latestTimestamp) return { success: false as const, code: "DEUR_ACTION_TIMESTAMP_OUT_OF_ORDER", message: "Action timestamp cannot precede existing evidence." };
  let current = input; const createdStart = current.events?.length ?? 0;
  if (action !== "END_SHIFT" && !(current.events ?? []).some((event) => event.activityType === "shift" && event.action === "start")) {
    const started = applyDeurAction(current, { activityType: "shift", action: "start", timestamp: actionTimestamp, idFactory }); if (!started.success) return { ...started, code: "DEUR_ACTION_INVALID" }; current = started.record;
  }
  const applied = applyDeurAction(current, { activityType: action === "END_SHIFT" ? "shift" : mapping[action], action: action === "END_SHIFT" ? "end" : "start", timestamp: actionTimestamp, idFactory });
  if (!applied.success) return { ...applied, code: "DEUR_ACTION_INVALID" };
  const record = structuredClone(applied.record), totals = record.totals;
  record.events = record.events?.map((event, index) => index >= createdStart ? { ...event, actorId: actor.id, actorName: actor.name } : event);
  if (totals) { record.totalOperatingMinutes = totals.operationMinutes; record.totalIdleMinutes = totals.idleMinutes; record.totalMealBreakMinutes = totals.mealBreakMinutes; record.totalMaintenanceMinutes = totals.breakdownMinutes; }
  return { success: true as const, record, action, actionTimestamp, createdEvents: structuredClone(record.events?.slice(createdStart) ?? []) };
}
