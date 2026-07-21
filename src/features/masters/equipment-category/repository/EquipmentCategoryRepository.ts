import type {
  EquipmentCategoryRecord,
} from "../types";
import { createLegacyLocalRepositoryStorage } from "@/core/persistence";

const persistence = createLegacyLocalRepositoryStorage("EquipmentCategory");

const DEFAULT_CATEGORIES = ["Moving", "Non-moving", "Aerial", "Light Equipment"];

export class EquipmentCategoryRepository {
  getAll(): EquipmentCategoryRecord[] {
    return persistence.load<EquipmentCategoryRecord[]>() ?? [];
  }

  saveAll(
    records: EquipmentCategoryRecord[]
  ) {
    persistence.save(records);
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
