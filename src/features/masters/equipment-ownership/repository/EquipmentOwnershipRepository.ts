import type {
  EquipmentOwnershipRecord,
} from "../types";
import { createLegacyLocalRepositoryStorage } from "@/core/persistence";

const persistence = createLegacyLocalRepositoryStorage("EquipmentOwnership");

export class EquipmentOwnershipRepository {

  getAll(): EquipmentOwnershipRecord[] {

    try {
      return persistence.load<EquipmentOwnershipRecord[]>() ?? [];

    } catch {

      return [];

    }

  }

  saveAll(
    records: EquipmentOwnershipRecord[]
  ) {

    persistence.save(records);

  }

  create(
    record: EquipmentOwnershipRecord
  ) {

    const records =
      this.getAll();

    records.push(record);

    this.saveAll(records);

  }

  update(
    record: EquipmentOwnershipRecord
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
  equipmentOwnershipRepository =
    new EquipmentOwnershipRepository();
