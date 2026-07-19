import { storage } from "@/core/storage";
import type { DeurSyncLock } from "./types";

const KEY = "equipment-rental-deur-sync-lock";

export class DeurSyncLockRepository {
  get(): DeurSyncLock | undefined {
    try {
      const value = storage.get<unknown>(KEY);
      if (!value || typeof value !== "object") return undefined;
      const lock = value as Partial<DeurSyncLock>;
      return typeof lock.ownerId === "string" && typeof lock.acquiredAt === "string" && typeof lock.expiresAt === "string"
        ? lock as DeurSyncLock : undefined;
    } catch { return undefined; }
  }
  acquire(ownerId: string, now: Date, ttlMilliseconds = 30_000): boolean {
    const current = this.get();
    if (current && Date.parse(current.expiresAt) > now.getTime() && current.ownerId !== ownerId) return false;
    const lock: DeurSyncLock = { ownerId, acquiredAt: now.toISOString(), expiresAt: new Date(now.getTime() + ttlMilliseconds).toISOString() };
    storage.set(KEY, lock);
    return this.get()?.ownerId === ownerId;
  }
  release(ownerId: string): void { if (this.get()?.ownerId === ownerId) storage.remove(KEY); }
}
