import type { OperationalEvent } from "./contracts";
import { OperationalEventStream } from "./OperationalEventStream";
import {
  applyOperationalEvent,
  type OperationalLineState,
} from "./OperationalStateProjector";

export class WorkspaceSynchronization {
  private readonly states = new Map<string, OperationalLineState>();
  private readonly listeners = new Map<string, Set<(state: OperationalLineState) => void>>();

  constructor(private readonly stream: OperationalEventStream) {}

  subscribeRental(tenantId: string, rentalId: string, rentalLineId?: string): () => void {
    return this.stream.subscribe({ tenantId, rentalId, rentalLineId }, (event) => this.apply(event));
  }

  subscribeLine(rentalLineId: string, listener: (state: OperationalLineState) => void): () => void {
    const listeners = this.listeners.get(rentalLineId) ?? new Set();
    listeners.add(listener);
    this.listeners.set(rentalLineId, listeners);
    const state = this.states.get(rentalLineId);
    if (state) listener(state);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) this.listeners.delete(rentalLineId);
    };
  }

  getLineState(rentalLineId: string): OperationalLineState | undefined {
    const state = this.states.get(rentalLineId);
    return state ? structuredClone(state) : undefined;
  }

  private apply(event: OperationalEvent): void {
    const current = this.states.get(event.rentalLineId);
    const next = applyOperationalEvent(current, event);
    if (next === current) return;
    this.states.set(event.rentalLineId, next);
    this.listeners.get(event.rentalLineId)?.forEach((listener) => listener(structuredClone(next)));
  }
}
