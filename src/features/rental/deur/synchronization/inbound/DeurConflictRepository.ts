import { storage } from "@/core/storage";
import type { DeurConflictReason, DeurSyncChangeEnvelope } from "../types";

const KEY = "equipment-rental-deur-conflicts";

export interface StoredDeurConflict {
  id: string;
  entityId: string;
  local: DeurSyncChangeEnvelope;
  remote: DeurSyncChangeEnvelope;
  classification: DeurConflictReason;
  detectedAt: string;
  status: "unresolved" | "resolved";
}

export class DeurConflictRepository {
  getAll(): StoredDeurConflict[] {
    try {
      const value = storage.get<unknown>(KEY);
      return Array.isArray(value) ? structuredClone(value) as StoredDeurConflict[] : [];
    } catch {
      return [];
    }
  }

  add(conflict: StoredDeurConflict): StoredDeurConflict {
    const conflicts = this.getAll();
    const existing = conflicts.find((item) => item.id === conflict.id);
    if (existing) return existing;
    const snapshot = structuredClone(conflict);
    storage.set(KEY, [...conflicts, snapshot]);
    return structuredClone(snapshot);
  }
}
