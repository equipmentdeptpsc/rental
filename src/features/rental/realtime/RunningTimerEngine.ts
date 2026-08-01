import type { OperationalLineState } from "./OperationalStateProjector";

export interface RunningTimerSnapshot {
  readonly serverNow: string;
  readonly elapsedOperationMs: number;
  readonly running: boolean;
  readonly driftMs: number;
}

export class RunningTimerEngine {
  private serverOffsetMs = 0;

  synchronizeClock(serverNow: string, clientNow = Date.now()): void {
    const server = Date.parse(serverNow);
    if (!Number.isFinite(server)) throw new Error("Server clock timestamp is invalid.");
    this.serverOffsetMs = server - clientNow;
  }

  project(state: OperationalLineState, clientNow = Date.now()): RunningTimerSnapshot {
    const serverNowMs = clientNow + this.serverOffsetMs;
    const runningMs = state.phase === "running" && state.activeSince
      ? Math.max(0, serverNowMs - Date.parse(state.activeSince))
      : 0;
    return {
      serverNow: new Date(serverNowMs).toISOString(),
      elapsedOperationMs: state.accumulatedOperationMs + runningMs,
      running: state.phase === "running",
      driftMs: this.serverOffsetMs,
    };
  }
}

