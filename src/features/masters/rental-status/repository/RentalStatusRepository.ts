import type {
    RentalStatusRecord,
  } from "../types";
  import { createLegacyLocalRepositoryStorage } from "@/core/persistence";
  
  const persistence = createLegacyLocalRepositoryStorage("RentalStatus");
  
  export class RentalStatusRepository {

    seedDefaults(): RentalStatusRecord[] {
      const existing = this.getAll();
      if (existing.length > 0) return existing;
      const statuses: RentalStatusRecord["status"][] = ["Draft", "Assigned", "Reserved", "Released", "Active", "Returned", "Closed", "Cancelled"];
      const seeded = statuses.map((status) => ({ id: `rental-status-${status.toLowerCase()}`, status, description: `${status} rental`, active: true, deleted: false }));
      this.saveAll(seeded);
      return seeded;
    }
  
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
