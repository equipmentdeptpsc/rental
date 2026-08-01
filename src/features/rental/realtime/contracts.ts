export const OPERATIONAL_EVENT_TYPES = [
  "OperationStarted",
  "OperationPaused",
  "OperationResumed",
  "OperationStopped",
  "IdleStarted",
  "IdleEnded",
  "StandbyStarted",
  "StandbyEnded",
  "MealBreakStarted",
  "MealBreakEnded",
  "BreakdownStarted",
  "BreakdownEnded",
  "FuelUpdated",
  "MeterUpdated",
  "RemarksUpdated",
  "OperatorChanged",
  "DEURSubmitted",
  "CustomerReviewed",
  "ManagerApproved",
] as const;

export type OperationalEventType = typeof OPERATIONAL_EVENT_TYPES[number];
export type OperationalEventPayload = Readonly<Record<string, string | number | boolean | null>>;

export interface OperationalEvent {
  readonly eventId: string;
  readonly tenantId: string;
  readonly rentalId: string;
  readonly rentalLineId: string;
  readonly equipmentId: string;
  readonly operatorId?: string;
  readonly type: OperationalEventType;
  readonly occurredAt: string;
  readonly sequence: number;
  readonly aggregateVersion: number;
  readonly payload: OperationalEventPayload;
}

export interface OperationalEventCursor {
  readonly occurredAt: string;
  readonly sequence: number;
  readonly eventId: string;
}

export interface OperationalEventFilter {
  readonly tenantId: string;
  readonly rentalId?: string;
  readonly rentalLineId?: string;
}

export interface OperationalEventPage {
  readonly events: readonly OperationalEvent[];
  readonly nextCursor?: OperationalEventCursor;
}

export interface OperationalEventRepository {
  append(event: OperationalEvent): Promise<"APPENDED" | "DUPLICATE">;
  listAfter(
    filter: OperationalEventFilter,
    cursor?: OperationalEventCursor,
    limit?: number,
  ): Promise<OperationalEventPage>;
}

export interface OperationalEventTransport {
  publish(event: OperationalEvent): Promise<"PUBLISHED" | "DUPLICATE">;
  subscribe(
    filter: OperationalEventFilter,
    listener: (events: readonly OperationalEvent[]) => void,
    options?: { cursor?: OperationalEventCursor; pollIntervalMs?: number },
  ): () => void;
}

export interface OperationalEventClock {
  now(): string;
}
