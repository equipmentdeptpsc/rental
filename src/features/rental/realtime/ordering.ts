import type { OperationalEvent, OperationalEventCursor } from "./contracts";

export function compareOperationalEvents(left: OperationalEvent, right: OperationalEvent): number {
  return Date.parse(left.occurredAt) - Date.parse(right.occurredAt)
    || left.sequence - right.sequence
    || left.eventId.localeCompare(right.eventId);
}

export function cursorForOperationalEvent(event: OperationalEvent): OperationalEventCursor {
  return { occurredAt: event.occurredAt, sequence: event.sequence, eventId: event.eventId };
}

export function isAfterOperationalCursor(
  event: OperationalEvent,
  cursor?: OperationalEventCursor,
): boolean {
  if (!cursor) return true;
  return compareOperationalEvents(event, {
    ...event,
    eventId: cursor.eventId,
    occurredAt: cursor.occurredAt,
    sequence: cursor.sequence,
  }) > 0;
}

function stablePayload(payload: OperationalEvent["payload"]): string {
  return JSON.stringify(Object.keys(payload).sort().map((key) => [key, payload[key]]));
}

export function operationalSemanticKey(event: OperationalEvent): string {
  return [
    event.tenantId,
    event.rentalLineId,
    event.type,
    event.aggregateVersion,
    event.occurredAt,
    stablePayload(event.payload),
  ].join("|");
}

export function validateOperationalEvent(event: OperationalEvent): void {
  if (!event.eventId || !event.tenantId || !event.rentalId || !event.rentalLineId || !event.equipmentId) {
    throw new Error("Operational events require event, tenant, rental, line, and equipment identities.");
  }
  if (!Number.isInteger(event.sequence) || event.sequence < 0
    || !Number.isInteger(event.aggregateVersion) || event.aggregateVersion < 0
    || !Number.isFinite(Date.parse(event.occurredAt))) {
    throw new Error("Operational event ordering metadata is invalid.");
  }
}

