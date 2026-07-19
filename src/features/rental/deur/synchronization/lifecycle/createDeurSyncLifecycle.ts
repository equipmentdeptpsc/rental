import { deurRepository } from "../../repository/deurRepository";
import { deurSyncQueue } from "../../offline/deurSyncQueue";
import type { DeurRemoteSyncTransport } from "../types";
import { DeurAppliedOperationRepository } from "../inbound/DeurAppliedOperationRepository";
import { DeurConflictRepository } from "../inbound/DeurConflictRepository";
import { DeurSyncCursorRepository } from "../inbound/DeurSyncCursorRepository";
import { DeurSyncHealthRepository } from "../orchestration/DeurSyncHealthRepository";
import { DeurSyncLockRepository } from "../orchestration/DeurSyncLockRepository";
import { DeurSyncOrchestrator } from "../orchestration/DeurSyncOrchestrator";
import { DeurSyncLifecycleService } from "./DeurSyncLifecycleService";

export function createDeurSyncLifecycle(transport?: DeurRemoteSyncTransport): DeurSyncLifecycleService {
  return new DeurSyncLifecycleService(new DeurSyncOrchestrator({
    transport,
    deurs: deurRepository,
    queue: deurSyncQueue,
    cursors: new DeurSyncCursorRepository(),
    appliedOperations: new DeurAppliedOperationRepository(),
    conflicts: new DeurConflictRepository(),
    health: new DeurSyncHealthRepository(),
    locks: new DeurSyncLockRepository(),
  }));
}
