import type { DeurRecord } from "../types";
import { applyDeurAction } from "../services/deurEventStateMachine";
import type { DeurOperatorAction } from "./types";
import { deriveDeurEventState } from "../services/deriveDeurEventState";
import type { DeurMeterRequirementKind } from "../services/getDeurMeterRequirement";

const mapping: Record<Exclude<DeurOperatorAction, "END_SHIFT"|"END_ACTIVITY">, "operation" | "idle" | "standby" | "mealBreak" | "breakdown"> = { START_OPERATION: "operation", RESUME_OPERATION: "operation", START_IDLE: "idle", START_STANDBY: "standby", START_MEAL_BREAK: "mealBreak", START_BREAKDOWN: "breakdown" };
export function applyDigitalDeurOperatorAction({ deur, action, actionTimestamp, actor, idFactory, meterRequirement, idleReason }: { deur: DeurRecord; action: DeurOperatorAction; actionTimestamp: string; actor: { id?: string; name: string; role?: string }; idFactory?: () => string; meterRequirement?: DeurMeterRequirementKind; idleReason?: { id: string; labelSnapshot: string; remarks?: string } }) {
  const input = structuredClone(deur), timestamp = Date.parse(actionTimestamp);
  if (!Number.isFinite(timestamp)) return { success: false as const, code: "DEUR_ACTION_TIMESTAMP_INVALID", message: "Action timestamp is invalid." };
  if (input.creationSource !== "OPERATOR_DIGITAL" || !["Draft", "In Progress"].includes(input.status)) return { success: false as const, code: "DEUR_NOT_EDITABLE", message: "Digital DEUR is not editable." };
  if (input.billingLocked || input.billId || input.billingStatementId || input.status === "Billed") return { success: false as const, code: "DEUR_CONSUMED", message: "Billed or locked DEUR records cannot be changed." };
  if (input.revision?.supersededByRevisionId) return { success: false as const, code: "DEUR_SUPERSEDED", message: "Superseded DEUR records cannot be changed." };
  const meterRequired = meterRequirement === undefined
    ? Boolean(input.meterReadingType)
    : meterRequirement !== "none";
  if (action === "END_SHIFT" && meterRequired && input.closingMeter === undefined) {
    return { success: false as const, code: "DEUR_CLOSING_METER_REQUIRED", message: "Ending meter reading is required before ending the shift." };
  }
  const latestTimestamp = Math.max(...(input.events ?? []).map((event) => Date.parse(event.timestamp)).filter(Number.isFinite), -Infinity);
  if (timestamp < latestTimestamp) return { success: false as const, code: "DEUR_ACTION_TIMESTAMP_OUT_OF_ORDER", message: "Action timestamp cannot precede existing evidence." };
  if (action === "START_IDLE" && (!idleReason?.id || !idleReason.labelSnapshot.trim())) return { success: false as const, code: "DEUR_IDLE_REASON_REQUIRED", message: "Select an active Idle Reason." };
  let current = input; const createdStart = current.events?.length ?? 0;
  if (action !== "END_SHIFT" && action !== "END_ACTIVITY" && !(current.events ?? []).some((event) => event.activityType === "shift" && event.action === "start")) {
    const started = applyDeurAction(current, { activityType: "shift", action: "start", timestamp: actionTimestamp, idFactory }); if (!started.success) return { ...started, code: "DEUR_ACTION_INVALID" }; current = started.record;
  }
  const state=deriveDeurEventState(current);
  if(action==="END_ACTIVITY"&&!state.openPrimaryActivity)return{success:false as const,code:"DEUR_NO_ACTIVITY",message:"No activity in progress."};
  const applied = applyDeurAction(current, { activityType: action === "END_SHIFT" ? "shift" : action==="END_ACTIVITY"?state.openPrimaryActivity!:mapping[action], action: action === "END_SHIFT"||action==="END_ACTIVITY" ? "end" : "start", timestamp: actionTimestamp, idFactory, idleReason });
  if (!applied.success) return { ...applied, code: "DEUR_ACTION_INVALID" };
  const record = structuredClone(applied.record), totals = record.totals;
  if (action === "END_SHIFT" && record.evidenceMode === "COMPLETION") {
    record.completionEvidence = {
      ...record.completionEvidence,
      status: "COMPLETED",
      completedAt: actionTimestamp,
    };
  }
  record.events = record.events?.map((event, index) => index >= createdStart ? {
    ...event,
    actorId: actor.id,
    actorName: actor.name,
    deurId: record.id,
    operatorId: record.operatorId,
    equipmentId: record.equipmentId,
    assignmentId: record.assignmentId,
  } : event);
  if (totals) { record.totalOperatingMinutes = totals.operationMinutes; record.totalIdleMinutes = totals.idleMinutes; record.totalStandbyMinutes = totals.standbyMinutes ?? 0; record.totalMealBreakMinutes = totals.mealBreakMinutes; record.totalMaintenanceMinutes = totals.breakdownMinutes; }
  return { success: true as const, record, action, actionTimestamp, createdEvents: structuredClone(record.events?.slice(createdStart) ?? []) };
}
