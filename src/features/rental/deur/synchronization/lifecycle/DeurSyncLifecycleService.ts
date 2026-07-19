import type { DeurSyncCycleResult } from "../orchestration/DeurSyncOrchestrator";
import type { DeurSyncCycleRunner, DeurSyncLifecycleState, DeurSyncTriggerSource } from "./types";

export interface DeurSyncLifecycleDependencies {
  events?: Pick<Window, "addEventListener" | "removeEventListener">;
  now?: () => Date;
}

export class DeurSyncLifecycleService {
  private readonly events: Pick<Window, "addEventListener" | "removeEventListener">;
  private readonly now: () => Date;
  private state: DeurSyncLifecycleState = {
    started: false, requestActive: false, startupRequestCompleted: false, listenersRegistered: false,
  };
  private activeRequest?: Promise<DeurSyncCycleResult>;
  private startupRequest?: Promise<void>;

  constructor(private readonly orchestrator: DeurSyncCycleRunner, dependencies: DeurSyncLifecycleDependencies = {}) {
    this.events = dependencies.events ?? window;
    this.now = dependencies.now ?? (() => new Date());
  }

  getState(): DeurSyncLifecycleState { return structuredClone(this.state); }

  start(): Promise<void> {
    if (this.state.started) return this.startupRequest ?? Promise.resolve();
    this.state = { ...this.state, started: true, listenersRegistered: true };
    this.events.addEventListener("online", this.handleOnline);
    if (!this.orchestrator.isConfigured()) {
      this.state = { ...this.state, startupRequestCompleted: true };
      this.startupRequest = Promise.resolve();
      return this.startupRequest;
    }
    this.startupRequest = this.request("startup").then(() => {
      this.state = { ...this.state, startupRequestCompleted: true };
    });
    return this.startupRequest;
  }

  stop(): void {
    if (!this.state.started) return;
    this.events.removeEventListener("online", this.handleOnline);
    this.state = { ...this.state, started: false, listenersRegistered: false };
  }

  requestSynchronization(): Promise<DeurSyncCycleResult> { return this.request("manual"); }

  private readonly handleOnline = () => {
    if (!this.state.started || !this.orchestrator.isConfigured()) return;
    void this.request("online");
  };

  private request(source: DeurSyncTriggerSource): Promise<DeurSyncCycleResult> {
    if (this.activeRequest) return this.activeRequest;
    this.state = {
      ...this.state, lastTriggerSource: source, lastRequestTimestamp: this.now().toISOString(), requestActive: true,
    };
    this.activeRequest = this.orchestrator.runCycle();
    void this.activeRequest.finally(() => {
      this.activeRequest = undefined;
      this.state = { ...this.state, requestActive: false };
    });
    return this.activeRequest;
  }
}
