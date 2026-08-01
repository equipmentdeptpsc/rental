import type { DeurOperatorAction } from "@/features/rental/deur/operator/types";
import type { DeurActivityTypeCanonical, DeurRecord } from "@/features/rental/deur/types";
import type { OperationalEvent, OperationalEventType } from "./contracts";

const startTypes: Partial<Record<DeurOperatorAction, OperationalEventType>> = {
  START_OPERATION: "OperationStarted",
  RESUME_OPERATION: "OperationResumed",
  START_IDLE: "IdleStarted",
  START_STANDBY: "StandbyStarted",
  START_MEAL_BREAK: "MealBreakStarted",
  START_BREAKDOWN: "BreakdownStarted",
  END_SHIFT: "OperationStopped",
};
const endTypes: Partial<Record<DeurActivityTypeCanonical, OperationalEventType>> = {
  operation: "OperationPaused",
  idle: "IdleEnded",
  standby: "StandbyEnded",
  mealBreak: "MealBreakEnded",
  breakdown: "BreakdownEnded",
};

export function createDeurOperationalEvents(input: {
  tenantId: string;
  deur: DeurRecord;
  action: DeurOperatorAction | "SUBMIT";
  serverOccurredAt: string;
  aggregateVersion: number;
  previousActivity?: DeurActivityTypeCanonical;
  eventIdFactory?: () => string;
}): OperationalEvent[] {
  const type = input.action === "SUBMIT"
    ? "DEURSubmitted"
    : input.action === "END_ACTIVITY"
      ? input.previousActivity && endTypes[input.previousActivity]
      : startTypes[input.action];
  if (!type || !input.deur.rentalEquipmentLineId) return [];
  const idFactory = input.eventIdFactory ?? (() => crypto.randomUUID());
  const base: Omit<OperationalEvent, "eventId" | "type" | "sequence" | "payload"> = {
    tenantId: input.tenantId,
    rentalId: input.deur.rentalId,
    rentalLineId: input.deur.rentalEquipmentLineId,
    equipmentId: input.deur.equipmentId,
    operatorId: input.deur.operatorId,
    occurredAt: input.serverOccurredAt,
    aggregateVersion: input.aggregateVersion,
  };
  const events: OperationalEvent[] = [{
    ...base,
    eventId: idFactory(),
    type,
    sequence: input.deur.events?.length ?? 0,
    payload: { deurId: input.deur.id },
  }];
  if (input.action === "END_SHIFT" && input.deur.closingMeter !== undefined) {
    events.push({
      ...base,
      eventId: idFactory(),
      type: "MeterUpdated",
      sequence: (input.deur.events?.length ?? 0) + 1,
      payload: { deurId: input.deur.id, value: input.deur.closingMeter },
    });
  }
  return events;
}

