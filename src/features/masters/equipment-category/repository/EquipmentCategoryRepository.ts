import type {
  EquipmentCategoryRecord,
} from "../types";
import { storage } from "@/core/storage";

const STORAGE_KEY =
  "equipment-category-master";

const DEFAULT_CATEGORIES = ["Moving", "Non-moving", "Aerial", "Light Equipment"];

export class EquipmentCategoryRepository {
  getAll(): EquipmentCategoryRecord[] {
    return storage.get<EquipmentCategoryRecord[]>(STORAGE_KEY) ?? [];
  }

  saveAll(
    records: EquipmentCategoryRecord[]
  ) {
    storage.set(STORAGE_KEY, records);
  }

  seedDefaults(): EquipmentCategoryRecord[] {
    const existing = this.getAll();
    if (existing.length > 0) return existing;
    const seeded = DEFAULT_CATEGORIES.map((category) => ({
      id: crypto.randomUUID(), category, description: "", active: true, deleted: false,
    }));
    this.saveAll(seeded);
    return seeded;
  }

  create(
    record: EquipmentCategoryRecord
  ) {
    const records =
      this.getAll();

    records.push(record);

    this.saveAll(records);
  }

  update(
    record: EquipmentCategoryRecord
  ) {
    const records =
      this.getAll().map(item =>
        item.id === record.id
          ? record
          : item
      );

    this.saveAll(records);
  }

  softDelete(id: string) {
    const records =
      this.getAll().map(item =>
        item.id === id
          ? {
              ...item,
              deleted: true,
              deletedAt: Date.now(),
            }
          : item
      );

    this.saveAll(records);
  }

  restore(id: string) {
    const records =
      this.getAll().map(item =>
        item.id === id
          ? {
              ...item,
              deleted: false,
              deletedAt: undefined,
            }
          : item
      );

    this.saveAll(records);
  }
}

export const
  equipmentCategoryRepository =
    new EquipmentCategoryRepository();
