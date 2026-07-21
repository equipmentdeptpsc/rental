import type {
  EquipmentLocationRecord,
} from "../types";
import { createLegacyLocalRepositoryStorage } from "@/core/persistence";

const persistence = createLegacyLocalRepositoryStorage("EquipmentLocation");

export class EquipmentLocationRepository {

  getAll(): EquipmentLocationRecord[] {

    try {
      return persistence.load<EquipmentLocationRecord[]>() ?? [];

    } catch {

      return [];

    }

  }

  saveAll(
    records: EquipmentLocationRecord[]
  ) {

    persistence.save(records);

  }

  create(
    record: EquipmentLocationRecord
  ) {

    const records =
      this.getAll();

    records.push(record);

    this.saveAll(records);

  }

  update(
    record: EquipmentLocationRecord
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
  equipmentLocationRepository =
    new EquipmentLocationRepository();
