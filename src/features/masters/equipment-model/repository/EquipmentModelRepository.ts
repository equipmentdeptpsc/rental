import type {
    EquipmentModelRecord,
  } from "../types";
  
  const STORAGE_KEY =
    "equipment-models";
  
  class EquipmentModelRepository {
  
    getAll(): EquipmentModelRecord[] {
  
      const json =
        localStorage.getItem(
          STORAGE_KEY,
        );
  
      if (!json) {
  
        return [];
  
      }
  
      try {
  
        return JSON.parse(
          json,
        ) as EquipmentModelRecord[];
  
      }
  
      catch {
  
        return [];
  
      }
  
    }
  
    private save(
      records: EquipmentModelRecord[],
    ): void {
  
      localStorage.setItem(
  
        STORAGE_KEY,
  
        JSON.stringify(records),
  
      );
  
    }
  
    create(
      record: EquipmentModelRecord,
    ): void {
  
      const records =
        this.getAll();
  
      records.push(record);
  
      this.save(records);
  
    }
  
    update(
      record: EquipmentModelRecord,
    ): void {
  
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
    ): void {
  
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
    ): void {
  
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
  
  export const equipmentModelRepository =
    new EquipmentModelRepository();