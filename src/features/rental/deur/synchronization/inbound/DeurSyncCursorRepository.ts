import { storage } from "@/core/storage";
import type { DeurSyncCursor } from "../types";

const KEY = "equipment-rental-deur-inbound-cursor";

export class DeurSyncCursorRepository {
  get(): DeurSyncCursor | undefined {
    try {
      const value = storage.get<unknown>(KEY);
      return typeof value === "string" ? value : undefined;
    } catch {
      return undefined;
    }
  }

  save(cursor: DeurSyncCursor): void {
    storage.set(KEY, cursor);
  }
}
