import type {
    RentalStatusRecord,
  } from "../types";
  
  const STORAGE_KEY =
    "rental-status-master";
  
  export class RentalStatusRepository {
  
    getAll(): RentalStatusRecord[] {
  
      const raw =
        localStorage.getItem(
          STORAGE_KEY
        );
  
      if (!raw) return [];
  
      try {
  
        return JSON.parse(raw);
  
      } catch {
  
        return [];
  
      }
  
    }
  
    saveAll(
      records: RentalStatusRecord[]
    ) {
  
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(records)
      );
  
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