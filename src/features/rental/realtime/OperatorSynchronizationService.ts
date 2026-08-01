import type { OperationalEvent, OperationalEventFilter } from "./contracts";
import { OperationalEventStream } from "./OperationalEventStream";

export class OperatorSynchronizationService {
  private online = true;

  constructor(private readonly stream: OperationalEventStream) {}

  setOnline(online: boolean): void {
    this.online = online;
  }

  async publish(event: OperationalEvent): Promise<"PUBLISHED" | "DUPLICATE" | "QUEUED"> {
    if (!this.online) {
      throw new Error("OPERATIONAL_EVENT_OFFLINE: durable replay must occur through the authorized command queue.");
    }
    return this.stream.publish(event);
  }

  async reconnect(): Promise<{ published: number; duplicates: number; pending: number }> {
    this.online = true;
    return { published: 0, duplicates: 0, pending: 0 };
  }

  subscribe(filter: OperationalEventFilter, listener: (event: OperationalEvent) => void): () => void {
    return this.stream.subscribe(filter, listener);
  }

  pendingCount(): number {
    return 0;
  }
}
