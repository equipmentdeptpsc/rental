import type {
  EquipmentBrandRecord,
} from "../types";
import { createLegacyLocalRepositoryStorage } from "@/core/persistence";

const persistence = createLegacyLocalRepositoryStorage("EquipmentBrand");

export class EquipmentBrandRepository {
  getAll(): EquipmentBrandRecord[] {
    try { return persistence.load<EquipmentBrandRecord[]>() ?? []; } catch { return []; }
  }

  saveAll(
    records: EquipmentBrandRecord[]
  ) {
    persistence.save(records);
  }

  create(
    record: EquipmentBrandRecord
  ) {
    const records =
      this.getAll();

    records.push(record);

    this.saveAll(records);
  }

  update(
    record: EquipmentBrandRecord
  ) {
    const records =
      this.getAll().map((item) =>
        item.id === record.id
          ? record
          : item
      );

    this.saveAll(records);
  }

  softDelete(id: string) {
    const records =
      this.getAll().map((item) =>
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
      this.getAll().map((item) =>
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
  equipmentBrandRepository =
    new EquipmentBrandRepository();
