import type {
    RentalStatusRecord,
  } from "../types";
  import { createLegacyLocalRepositoryStorage } from "@/core/persistence";
  
  const persistence = createLegacyLocalRepositoryStorage("RentalStatus");
  
  export class RentalStatusRepository {
  
    getAll(): RentalStatusRecord[] {
  
      try {
        return persistence.load<RentalStatusRecord[]>() ?? [];
  
      } catch {
  
        return [];
  
      }
  
    }
  
    saveAll(
      records: RentalStatusRecord[]
    ) {
  
      persistence.save(records);
  
    }
  
    create(
      record: RentalStatusRecord
    ) {
  
      const records =
        this.getAll();
  
      records.push(record);
  
      this.saveAll(records);
  
    }
  
    update(
      record: RentalStatusRecord
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
    rentalStatusRepository =
      new RentalStatusRepository();
