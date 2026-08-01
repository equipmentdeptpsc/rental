import type {
  OperationalEvent,
  OperationalEventCursor,
  OperationalEventFilter,
  OperationalEventPage,
  OperationalEventRepository,
} from "./contracts";
import {
  compareOperationalEvents,
  cursorForOperationalEvent,
  isAfterOperationalCursor,
  operationalSemanticKey,
  validateOperationalEvent,
} from "./ordering";

export class InMemoryOperationalEventRepository implements OperationalEventRepository {
  private readonly events: OperationalEvent[] = [];
  private readonly eventIds = new Set<string>();
  private readonly semanticKeys = new Set<string>();

  async append(event: OperationalEvent): Promise<"APPENDED" | "DUPLICATE"> {
    validateOperationalEvent(event);
    const semanticKey = operationalSemanticKey(event);
    if (this.eventIds.has(event.eventId) || this.semanticKeys.has(semanticKey)) return "DUPLICATE";
    this.events.push(structuredClone(event));
    this.events.sort(compareOperationalEvents);
    this.eventIds.add(event.eventId);
    this.semanticKeys.add(semanticKey);
    return "APPENDED";
  }

  async listAfter(
    filter: OperationalEventFilter,
    cursor?: OperationalEventCursor,
    limit = 100,
  ): Promise<OperationalEventPage> {
    const events = this.events
      .filter((event) =>
        event.tenantId === filter.tenantId
        && (!filter.rentalId || event.rentalId === filter.rentalId)
        && (!filter.rentalLineId || event.rentalLineId === filter.rentalLineId)
        && isAfterOperationalCursor(event, cursor))
      .slice(0, Math.max(1, limit))
      .map((event) => structuredClone(event));
    return {
      events,
      ...(events.length ? { nextCursor: cursorForOperationalEvent(events.at(-1)!) } : {}),
    };
  }
}

