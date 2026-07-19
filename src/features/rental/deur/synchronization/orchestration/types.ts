import type { DeurSyncCursor, DeurTransportErrorClassification } from "../types";

export type DeurSyncHealthStatus =
  | "idle"
  | "running-outbound"
  | "running-inbound"
  | "completed"
  | "partially-completed"
  | "failed-retryable"
  | "failed-non-retryable"
  | "blocked-by-conflict"
  | "disabled-unconfigured";

export interface DeurSyncHealth {
  status: DeurSyncHealthStatus;
  running: boolean;
  lastCycleStart?: string;
  lastSuccessfulCompletion?: string;
  lastFailure?: string;
  lastFailureClassification?: DeurTransportErrorClassification | "validation" | "conflict";
  pendingOutboundCount: number;
  unresolvedConflictCount: number;
  lastInboundCursor?: DeurSyncCursor;
  consecutiveFailureCount: number;
  nextRetryEligibleAt?: string;
}

export interface DeurSyncLock {
  ownerId: string;
  acquiredAt: string;
  expiresAt: string;
}
