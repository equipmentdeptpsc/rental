import type {
  EquipmentCategoryRecord,
} from "../types";

const STORAGE_KEY =
  "equipment-category-master";

export class EquipmentCategoryRepository {
  getAll(): EquipmentCategoryRecord[] {
    const raw =
      localStorage.getItem(
        STORAGE_KEY
      );

    if (!raw) return [];

    try {
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }

  saveAll(
    records: EquipmentCategoryRecord[]
  ) {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(records)
    );
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