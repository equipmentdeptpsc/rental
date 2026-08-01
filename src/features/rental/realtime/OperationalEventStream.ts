import type {
  OperationalEvent,
  OperationalEventCursor,
  OperationalEventFilter,
  OperationalEventTransport,
} from "./contracts";
import {
  compareOperationalEvents,
  cursorForOperationalEvent,
  operationalSemanticKey,
  validateOperationalEvent,
} from "./ordering";

export class OperationalEventStream {
  constructor(private readonly transport: OperationalEventTransport) {}

  publish(event: OperationalEvent): Promise<"PUBLISHED" | "DUPLICATE"> {
    validateOperationalEvent(event);
    return this.transport.publish(structuredClone(event));
  }

  subscribe(
    filter: OperationalEventFilter,
    listener: (event: OperationalEvent) => void,
    cursor?: OperationalEventCursor,
  ): () => void {
    let deliveredCursor = cursor;
    const seenIds = new Set<string>();
    const seenSemanticKeys = new Set<string>();
    return this.transport.subscribe(filter, (batch) => {
      [...batch].sort(compareOperationalEvents).forEach((event) => {
        validateOperationalEvent(event);
        const semanticKey = operationalSemanticKey(event);
        if (seenIds.has(event.eventId) || seenSemanticKeys.has(semanticKey)) return;
        if (deliveredCursor && compareOperationalEvents(event, {
          ...event,
          eventId: deliveredCursor.eventId,
          occurredAt: deliveredCursor.occurredAt,
          sequence: deliveredCursor.sequence,
        }) <= 0) return;
        seenIds.add(event.eventId);
        seenSemanticKeys.add(semanticKey);
        deliveredCursor = cursorForOperationalEvent(event);
        listener(structuredClone(event));
      });
    }, { cursor });
  }
}
