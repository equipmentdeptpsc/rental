import type {
  EquipmentOwnershipRecord,
} from "../types";
import { createLegacyLocalRepositoryStorage } from "@/core/persistence";

const persistence = createLegacyLocalRepositoryStorage("EquipmentOwnership");

export class EquipmentOwnershipRepository {

  seedDefaults(): EquipmentOwnershipRecord[] {
    const existing = this.getAll();
    if (existing.length > 0) return existing;
    const seeded = [{ id: "equipment-ownership-company", ownership: "Company Owned", description: "Equipment owned by the rental company", active: true, deleted: false }];
    this.saveAll(seeded);
    return seeded;
  }

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
