import type {
    EquipmentTypeRecord,
  } from "../types";
  import { createLegacyLocalRepositoryStorage } from "@/core/persistence";
  
  const persistence = createLegacyLocalRepositoryStorage("EquipmentType");
  
  class EquipmentTypeRepository {
  
    getAll(): EquipmentTypeRecord[] {
  
      try {
        return persistence.load<EquipmentTypeRecord[]>() ?? [];
  
      }
  
      catch {
  
        return [];
  
      }
  
    }
  
    private save(
      records: EquipmentTypeRecord[],
    ) {
  
      persistence.save(records);
  
    }
  
    create(
      record: EquipmentTypeRecord,
    ) {
  
      const records =
        this.getAll();
  
      records.push(record);
  
      this.save(records);
  
    }
  
    update(
      record: EquipmentTypeRecord,
    ) {
  
      const records =
        this.getAll().map(
  
          item =>
  
            item.id === record.id
  
              ? record
  
              : item,
  
        );
  
      this.save(records);
  
    }
  
    softDelete(
      id: string,
    ) {
  
      const records =
        this.getAll().map(
  
          item =>
  
            item.id === id
  
              ? {
  
                  ...item,
  
                  deleted: true,
  
                  deletedAt: Date.now(),
  
                }
  
              : item,
  
        );
  
      this.save(records);
  
    }
  
    restore(
      id: string,
    ) {
  
      const records =
        this.getAll().map(
  
          item =>
  
            item.id === id
  
              ? {
  
                  ...item,
  
                  deleted: false,
  
                  deletedAt: undefined,
  
                }
  
              : item,
  
        );
  
      this.save(records);
  
    }
  
  }
  
  export const equipmentTypeRepository =
    new EquipmentTypeRepository();
