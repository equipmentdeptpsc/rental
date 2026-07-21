import type {
    EquipmentModelRecord,
  } from "../types";
  import { createLegacyLocalRepositoryStorage } from "@/core/persistence";
  
  const persistence = createLegacyLocalRepositoryStorage("EquipmentModel");
  
  class EquipmentModelRepository {
  
    getAll(): EquipmentModelRecord[] {
  
      try { return persistence.load<EquipmentModelRecord[]>() ?? []; } catch { return []; }
  
    }
  
    private save(
      records: EquipmentModelRecord[],
    ): void {
  
      persistence.save(records);
  
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
