import type { DeurAcceptedChange, DeurConflictResult, DeurRejectedChange, DeurSyncChangeEnvelope } from "../../../src/features/rental/deur/synchronization/types";

export interface ServerPushCommand { clientId: string; changes: DeurSyncChangeEnvelope[]; cursor?: string }
export interface ServerPushResult { accepted: DeurAcceptedChange[]; rejected: DeurRejectedChange[]; conflicts: DeurConflictResult[]; cursor: string; serverTimestamp: string }
export interface ServerPullQuery { clientId: string; cursor?: string; limit?: number }
export interface ServerPullResult { changes: DeurSyncChangeEnvelope[]; cursor: string; hasMore: boolean; serverTimestamp: string }
export interface DeurSyncServerApplication { push(command: ServerPushCommand): Promise<ServerPushResult>; pull(query: ServerPullQuery): Promise<ServerPullResult> }
