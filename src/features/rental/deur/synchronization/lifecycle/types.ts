import type { DeurSyncCycleResult } from "../orchestration/DeurSyncOrchestrator";

export type DeurSyncTriggerSource = "startup" | "manual" | "online";

export interface DeurSyncLifecycleState {
  started: boolean;
  lastTriggerSource?: DeurSyncTriggerSource;
  lastRequestTimestamp?: string;
  requestActive: boolean;
  startupRequestCompleted: boolean;
  listenersRegistered: boolean;
}

export interface DeurSyncCycleRunner {
  isConfigured(): boolean;
  runCycle(): Promise<DeurSyncCycleResult>;
}
