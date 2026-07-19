import { storage } from "@/core/storage";
import type { DeurSyncHealth } from "./types";

const KEY = "equipment-rental-deur-sync-health";
const initial = (): DeurSyncHealth => ({ status: "idle", running: false, pendingOutboundCount: 0, unresolvedConflictCount: 0, consecutiveFailureCount: 0 });

export class DeurSyncHealthRepository {
  get(): DeurSyncHealth {
    try {
      const value = storage.get<unknown>(KEY);
      return value && typeof value === "object" ? structuredClone(value) as DeurSyncHealth : initial();
    } catch { return initial(); }
  }
  save(health: DeurSyncHealth): void { storage.set(KEY, structuredClone(health)); }
}
