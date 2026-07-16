import { storage } from "@/core/storage";

import type { EquipmentHistoryRecord } from "./types";

const STORAGE_KEY = "equipment-history-records";

class EquipmentHistoryRepository {
  getAll(): EquipmentHistoryRecord[] {
    return storage.get<EquipmentHistoryRecord[]>(STORAGE_KEY) ?? [];
  }

  create(item: EquipmentHistoryRecord): void {
    storage.set(STORAGE_KEY, [
      item,
      ...this.getAll(),
    ]);
  }
}

export const equipmentHistoryRepository =
  new EquipmentHistoryRepository();
