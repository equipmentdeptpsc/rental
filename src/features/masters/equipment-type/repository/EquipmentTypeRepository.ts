import type {
    EquipmentTypeRecord,
  } from "../types";
  
  const STORAGE_KEY =
    "equipment-types";
  
  class EquipmentTypeRepository {
  
    getAll(): EquipmentTypeRecord[] {
  
      const json =
        localStorage.getItem(
          STORAGE_KEY
        );
  
      if (!json) {
  
        return [];
  
      }
  
      try {
  
        return JSON.parse(
          json
        ) as EquipmentTypeRecord[];
  
      }
  
      catch {
  
        return [];
  
      }
  
    }
  
    private save(
      records: EquipmentTypeRecord[],
    ) {
  
      localStorage.setItem(
  
        STORAGE_KEY,
  
        JSON.stringify(records),
  
      );
  
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