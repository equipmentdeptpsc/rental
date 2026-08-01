import type { OperationalEvent } from "./contracts";
import { compareOperationalEvents, operationalSemanticKey } from "./ordering";

export type OperationPhase = "stopped" | "running" | "paused";
export interface OperationalLineState {
  readonly tenantId: string;
  readonly rentalId: string;
  readonly rentalLineId: string;
  readonly equipmentId: string;
  readonly operatorId?: string;
  readonly phase: OperationPhase;
  readonly activeActivity?: "operation" | "idle" | "standby" | "mealBreak" | "breakdown";
  readonly activeSince?: string;
  readonly accumulatedOperationMs: number;
  readonly meter?: number;
  readonly fuel?: number;
  readonly remarks?: string;
  readonly lastEvent?: OperationalEvent;
  readonly appliedEventIds: ReadonlySet<string>;
  readonly appliedSemanticKeys: ReadonlySet<string>;
}

export function createOperationalLineState(event: OperationalEvent): OperationalLineState {
  return {
    tenantId: event.tenantId,
    rentalId: event.rentalId,
    rentalLineId: event.rentalLineId,
    equipmentId: event.equipmentId,
    operatorId: event.operatorId,
    phase: "stopped",
    accumulatedOperationMs: 0,
    appliedEventIds: new Set(),
    appliedSemanticKeys: new Set(),
  };
}

export function applyOperationalEvent(
  current: OperationalLineState | undefined,
  event: OperationalEvent,
): OperationalLineState {
  const state = current ?? createOperationalLineState(event);
  if (state.tenantId !== event.tenantId || state.rentalLineId !== event.rentalLineId) return state;
  const semanticKey = operationalSemanticKey(event);
  if (state.appliedEventIds.has(event.eventId) || state.appliedSemanticKeys.has(semanticKey)) return state;
  if (state.lastEvent && compareOperationalEvents(event, state.lastEvent) < 0) return state;

  let next: OperationalLineState = { ...state };
  const elapsed = state.activeSince
    ? Math.max(0, Date.parse(event.occurredAt) - Date.parse(state.activeSince))
    : 0;
  switch (event.type) {
    case "OperationStarted":
      if (state.phase === "stopped") next = { ...next, phase: "running", activeActivity: "operation", activeSince: event.occurredAt };
      break;
    case "OperationPaused":
      if (state.phase === "running") next = {
        ...next, phase: "paused", activeActivity: undefined, activeSince: undefined,
        accumulatedOperationMs: state.accumulatedOperationMs + elapsed,
      };
      break;
    case "OperationResumed":
      if (state.phase === "paused") next = { ...next, phase: "running", activeActivity: "operation", activeSince: event.occurredAt };
      break;
    case "OperationStopped":
      if (state.phase !== "stopped") next = {
        ...next, phase: "stopped", activeActivity: undefined, activeSince: undefined,
        accumulatedOperationMs: state.accumulatedOperationMs
          + (state.phase === "running" ? elapsed : 0),
      };
      break;
    case "IdleStarted":
      next = {
        ...next,
        phase: state.phase === "running" ? "paused" : state.phase,
        accumulatedOperationMs: state.accumulatedOperationMs
          + (state.phase === "running" ? elapsed : 0),
        activeActivity: "idle",
        activeSince: event.occurredAt,
      };
      break;
    case "IdleEnded":
      if (state.activeActivity === "idle") next = { ...next, activeActivity: undefined, activeSince: undefined };
      break;
    case "StandbyStarted":
      next = {
        ...next,
        phase: state.phase === "running" ? "paused" : state.phase,
        accumulatedOperationMs: state.accumulatedOperationMs
          + (state.phase === "running" ? elapsed : 0),
        activeActivity: "standby",
        activeSince: event.occurredAt,
      };
      break;
    case "StandbyEnded":
      if (state.activeActivity === "standby") next = { ...next, activeActivity: undefined, activeSince: undefined };
      break;
    case "MealBreakStarted":
      next = {
        ...next,
        phase: state.phase === "running" ? "paused" : state.phase,
        accumulatedOperationMs: state.accumulatedOperationMs
          + (state.phase === "running" ? elapsed : 0),
        activeActivity: "mealBreak",
        activeSince: event.occurredAt,
      };
      break;
    case "MealBreakEnded":
      if (state.activeActivity === "mealBreak") next = { ...next, activeActivity: undefined, activeSince: undefined };
      break;
    case "BreakdownStarted":
      next = {
        ...next,
        phase: state.phase === "running" ? "paused" : state.phase,
        accumulatedOperationMs: state.accumulatedOperationMs
          + (state.phase === "running" ? elapsed : 0),
        activeActivity: "breakdown",
        activeSince: event.occurredAt,
      };
      break;
    case "BreakdownEnded":
      if (state.activeActivity === "breakdown") next = { ...next, activeActivity: undefined, activeSince: undefined };
      break;
    case "MeterUpdated":
      if (typeof event.payload.value === "number") next = { ...next, meter: event.payload.value };
      break;
    case "FuelUpdated":
      if (typeof event.payload.value === "number") next = { ...next, fuel: event.payload.value };
      break;
    case "RemarksUpdated":
      if (typeof event.payload.value === "string") next = { ...next, remarks: event.payload.value };
      break;
    case "OperatorChanged":
      if (typeof event.payload.operatorId === "string") next = { ...next, operatorId: event.payload.operatorId };
      break;
    default:
      break;
  }
  return {
    ...next,
    lastEvent: structuredClone(event),
    appliedEventIds: new Set([...state.appliedEventIds, event.eventId]),
    appliedSemanticKeys: new Set([...state.appliedSemanticKeys, semanticKey]),
  };
}
