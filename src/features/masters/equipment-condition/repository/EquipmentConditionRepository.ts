import type {
  EquipmentConditionRecord,
} from "../types";
import { createLegacyLocalRepositoryStorage } from "@/core/persistence";

const persistence = createLegacyLocalRepositoryStorage("EquipmentCondition");

export class EquipmentConditionRepository {

  seedDefaults(): EquipmentConditionRecord[] {
    const existing = this.getAll();
    if (existing.length > 0) return existing;
    const seeded = [{ id: "equipment-condition-serviceable", condition: "Serviceable", description: "Available for normal operation", active: true, deleted: false }];
    this.saveAll(seeded);
    return seeded;
  }

  getAll(): EquipmentConditionRecord[] {

    try {
      return persistence.load<EquipmentConditionRecord[]>() ?? [];

    } catch {

      return [];

    }

  }

  saveAll(
    records: EquipmentConditionRecord[]
  ) {

    persistence.save(records);

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
