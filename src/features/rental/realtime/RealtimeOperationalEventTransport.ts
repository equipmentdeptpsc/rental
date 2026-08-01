import type {
  OperationalEvent,
  OperationalEventCursor,
  OperationalEventFilter,
  OperationalEventRepository,
  OperationalEventTransport,
} from "./contracts";
import { compareOperationalEvents, cursorForOperationalEvent, operationalSemanticKey, validateOperationalEvent } from "./ordering";

export type RealtimeConnectionState = "CONNECTING" | "LIVE" | "POLLING_FALLBACK" | "RECONCILING" | "CLOSED";
export interface RealtimeTransportDiagnostics {
  readonly state: RealtimeConnectionState;
  readonly lastSuccessfulEventAt?: string;
  readonly lastReconciliationAt?: string;
  readonly reconnectCount: number;
  readonly sequenceGapCount: number;
  readonly duplicateSuppressionCount: number;
  readonly fallbackMode: "NONE" | "POLLING";
}
export interface OperationalRealtimeSource {
  subscribe(
    filter: OperationalEventFilter,
    handlers: {
      event(event: OperationalEvent): void;
      connected(): void;
      disconnected(): void;
      error(error: unknown): void;
    },
  ): () => void;
}
interface RealtimeTimers {
  setInterval(callback: () => void, milliseconds: number): unknown;
  clearInterval(handle: unknown): void;
}

export class RealtimeOperationalEventTransport implements OperationalEventTransport {
  private diagnostics: RealtimeTransportDiagnostics = {
    state: "CLOSED", reconnectCount: 0, sequenceGapCount: 0, duplicateSuppressionCount: 0, fallbackMode: "NONE",
  };
  private readonly timers: RealtimeTimers;

  constructor(
    private readonly source: OperationalRealtimeSource,
    private readonly recoveryRepository: OperationalEventRepository,
    timers?: RealtimeTimers,
  ) {
    this.timers = timers ?? {
      setInterval: (callback, milliseconds) => globalThis.setInterval(callback, milliseconds),
      clearInterval: (handle) => globalThis.clearInterval(handle as ReturnType<typeof setInterval>),
    };
  }

  publish(_event: OperationalEvent): Promise<"PUBLISHED" | "DUPLICATE"> {
    return Promise.reject(new Error("REMOTE_OPERATIONAL_EVENT_PUBLISH_DISABLED"));
  }

  getDiagnostics(): RealtimeTransportDiagnostics { return { ...this.diagnostics }; }

  subscribe(
    filter: OperationalEventFilter,
    listener: (events: readonly OperationalEvent[]) => void,
    options: { cursor?: OperationalEventCursor; pollIntervalMs?: number } = {},
  ): () => void {
    let active = true;
    let cursor = options.cursor;
    let connectedOnce = false;
    let reconciling = false;
    const seenIds = new Set<string>();
    const seenSemantic = new Set<string>();
    let lastSequence = cursor?.sequence;

    const deliver = (events: readonly OperationalEvent[]) => {
      const accepted: OperationalEvent[] = [];
      [...events].sort(compareOperationalEvents).forEach((event) => {
        try { validateOperationalEvent(event); } catch { return; }
        if (event.tenantId !== filter.tenantId || (filter.rentalId && event.rentalId !== filter.rentalId) ||
            (filter.rentalLineId && event.rentalLineId !== filter.rentalLineId)) return;
        const semantic = operationalSemanticKey(event);
        if (seenIds.has(event.eventId) || seenSemantic.has(semantic)) {
          this.diagnostics = { ...this.diagnostics, duplicateSuppressionCount: this.diagnostics.duplicateSuppressionCount + 1 }; return;
        }
        if (lastSequence !== undefined && event.sequence > lastSequence + 1) {
          this.diagnostics = { ...this.diagnostics, sequenceGapCount: this.diagnostics.sequenceGapCount + 1 };
          void reconcile();
        }
        seenIds.add(event.eventId); seenSemantic.add(semantic);
        lastSequence = Math.max(lastSequence ?? event.sequence, event.sequence);
        cursor = cursorForOperationalEvent(event);
        accepted.push(structuredClone(event));
      });
      if (accepted.length) {
        this.diagnostics = { ...this.diagnostics, lastSuccessfulEventAt: accepted.at(-1)!.occurredAt };
        listener(accepted);
      }
    };

    const reconcile = async () => {
      if (!active || reconciling) return;
      reconciling = true;
      this.diagnostics = { ...this.diagnostics, state: "RECONCILING" };
      try {
        const page = await this.recoveryRepository.listAfter(filter, cursor);
        if (active) deliver(page.events);
        cursor = page.nextCursor ?? cursor;
        this.diagnostics = { ...this.diagnostics, lastReconciliationAt: new Date().toISOString(), state: this.diagnostics.fallbackMode === "POLLING" ? "POLLING_FALLBACK" : "LIVE" };
      } catch {
        this.diagnostics = { ...this.diagnostics, state: "POLLING_FALLBACK", fallbackMode: "POLLING" };
      } finally { reconciling = false; }
    };

    this.diagnostics = { ...this.diagnostics, state: "CONNECTING" };
    const unsubscribe = this.source.subscribe(filter, {
      event: (event) => deliver([event]),
      connected: () => {
        if (connectedOnce) this.diagnostics = { ...this.diagnostics, reconnectCount: this.diagnostics.reconnectCount + 1 };
        connectedOnce = true;
        this.diagnostics = { ...this.diagnostics, state: "LIVE", fallbackMode: "NONE" };
        void reconcile();
      },
      disconnected: () => { this.diagnostics = { ...this.diagnostics, state: "POLLING_FALLBACK", fallbackMode: "POLLING" }; void reconcile(); },
      error: () => { this.diagnostics = { ...this.diagnostics, state: "POLLING_FALLBACK", fallbackMode: "POLLING" }; void reconcile(); },
    });
    void reconcile();
    const handle = this.timers.setInterval(() => {
      if (this.diagnostics.fallbackMode === "POLLING") void reconcile();
    }, options.pollIntervalMs ?? 1_000);
    return () => {
      active = false; unsubscribe(); this.timers.clearInterval(handle);
      this.diagnostics = { ...this.diagnostics, state: "CLOSED" };
    };
  }
}
