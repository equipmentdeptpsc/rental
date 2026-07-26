import type {
  EquipmentStatusRecord,
} from "../types";
import { createLegacyLocalRepositoryStorage } from "@/core/persistence";

const persistence = createLegacyLocalRepositoryStorage("EquipmentStatus");

export class EquipmentStatusRepository {
  seedDefaults(): EquipmentStatusRecord[] {
    const existing = this.getAll();
    if (existing.length > 0) return existing;
    const seeded = ["Available", "Assigned", "Rented", "Maintenance"].map((status) => ({
      id: `equipment-status-${status.toLowerCase()}`,
      status,
      description: `${status} equipment`,
      active: true,
      deleted: false,
    }));
    this.saveAll(seeded);
    return seeded;
  }

  getAll(): EquipmentStatusRecord[] {
    try {
      return persistence.load<EquipmentStatusRecord[]>() ?? [];
    } catch {
      return [];
    }
  }

  saveAll(
    records: EquipmentStatusRecord[]
  ) {
    persistence.save(records);
  }

  create(
    record: EquipmentStatusRecord
  ) {
    const records =
      this.getAll();

    records.push(record);

    this.saveAll(records);
  }

  update(
    record: EquipmentStatusRecord
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
  equipmentStatusRepository =
    new EquipmentStatusRepository();
