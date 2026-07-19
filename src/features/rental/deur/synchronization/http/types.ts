import type {
  DeurAcceptedChange,
  DeurConflictResult,
  DeurRejectedChange,
  DeurSyncChangeEnvelope,
  DeurSyncCursor,
} from "../types";

export const DEUR_SYNC_PROTOCOL_VERSION = 1 as const;

export interface DeurHttpPushRequest {
  protocolVersion: typeof DEUR_SYNC_PROTOCOL_VERSION;
  clientId: string;
  changes: DeurSyncChangeEnvelope[];
  cursor?: DeurSyncCursor;
}

export interface DeurHttpPushResponse {
  protocolVersion: typeof DEUR_SYNC_PROTOCOL_VERSION;
  accepted: DeurAcceptedChange[];
  rejected: DeurRejectedChange[];
  conflicts: DeurConflictResult[];
  cursor?: DeurSyncCursor;
  serverTimestamp: string;
}

export interface DeurHttpPullRequest {
  protocolVersion: typeof DEUR_SYNC_PROTOCOL_VERSION;
  clientId: string;
  cursor?: DeurSyncCursor;
  limit?: number;
}

export interface DeurHttpPullResponse {
  protocolVersion: typeof DEUR_SYNC_PROTOCOL_VERSION;
  changes: DeurSyncChangeEnvelope[];
  cursor: DeurSyncCursor;
  hasMore: boolean;
  serverTimestamp: string;
}
