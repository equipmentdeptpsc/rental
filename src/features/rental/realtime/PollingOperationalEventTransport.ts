import type {
  OperationalEvent,
  OperationalEventCursor,
  OperationalEventFilter,
  OperationalEventRepository,
  OperationalEventTransport,
} from "./contracts";

interface PollingTimers {
  setInterval(callback: () => void, milliseconds: number): unknown;
  clearInterval(handle: unknown): void;
}

export class PollingOperationalEventTransport implements OperationalEventTransport {
  private readonly timers: PollingTimers;

  constructor(
    private readonly repository: OperationalEventRepository,
    timers?: PollingTimers,
  ) {
    this.timers = timers ?? {
      setInterval: (callback, milliseconds) => globalThis.setInterval(callback, milliseconds),
      clearInterval: (handle) => globalThis.clearInterval(handle as ReturnType<typeof setInterval>),
    };
  }

  async publish(event: OperationalEvent): Promise<"PUBLISHED" | "DUPLICATE"> {
    return await this.repository.append(event) === "APPENDED" ? "PUBLISHED" : "DUPLICATE";
  }

  subscribe(
    filter: OperationalEventFilter,
    listener: (events: readonly OperationalEvent[]) => void,
    options: { cursor?: OperationalEventCursor; pollIntervalMs?: number } = {},
  ): () => void {
    let active = true;
    let polling = false;
    let cursor = options.cursor;
    const poll = async () => {
      if (!active || polling) return;
      polling = true;
      try {
        const page = await this.repository.listAfter(filter, cursor);
        if (!active || page.events.length === 0) return;
        cursor = page.nextCursor ?? cursor;
        listener(page.events);
      } finally {
        polling = false;
      }
    };
    void poll();
    const handle = this.timers.setInterval(() => void poll(), options.pollIntervalMs ?? 1_000);
    return () => {
      active = false;
      this.timers.clearInterval(handle);
    };
  }
}

