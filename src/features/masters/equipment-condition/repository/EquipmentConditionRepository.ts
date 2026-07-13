import type {
  EquipmentConditionRecord,
} from "../types";

const STORAGE_KEY =
  "equipment-condition-master";

export class EquipmentConditionRepository {

  getAll(): EquipmentConditionRecord[] {

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
    records: EquipmentConditionRecord[]
  ) {

    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(records)
    );

  }

  create(
    record: EquipmentConditionRecord
  ) {

    const records =
      this.getAll();

    records.push(record);

    this.saveAll(records);

  }

  update(
    record: EquipmentConditionRecord
  ) {

    const records =
      this.getAll().map(item =>
        item.id === record.id
          ? record
          : item
      );

    this.saveAll(records);

  }

  softDelete(
    id: string
  ) {

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

  restore(
    id: string
  ) {

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
  equipmentConditionRepository =
    new EquipmentConditionRepository();