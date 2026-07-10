import type {
    ActivityCodeRecord,
  } from "./types";
  
  const STORAGE_KEY =
    "equipment-rental-activity-codes";
  
  class ActivityCodeRepository {
  
    getAll(): ActivityCodeRecord[] {
  
      const raw =
        localStorage.getItem(
          STORAGE_KEY
        );
  
      if (!raw) {
        return [];
      }
  
      return JSON.parse(
        raw
      ) as ActivityCodeRecord[];
  
    }
  
    getById(
      id: string
    ): ActivityCodeRecord | undefined {
  
      return this
        .getAll()
        .find(
          item =>
            item.id === id
        );
  
    }
  
    search(
      keyword: string
    ): ActivityCodeRecord[] {
  
      const value =
        keyword
          .trim()
          .toLowerCase();
  
      return this
        .getAll()
  
        .filter(
          item =>
            !item.deleted
        )
  
        .filter(
          item =>
  
            !value ||
  
            item.activityCode
              .toLowerCase()
              .includes(value)
  
            ||
  
            item.description
              .toLowerCase()
              .includes(value)
  
        );
  
    }
  
    create(
      record: ActivityCodeRecord
    ): void {
  
      const all =
        this.getAll();
  
      all.push(record);
  
      this.saveAll(all);
  
    }
  
    update(
      record: ActivityCodeRecord
    ): void {
  
      const updated =
        this
          .getAll()
          .map(
  
            item =>
  
              item.id ===
              record.id
  
                ? record
  
                : item
  
          );
  
      this.saveAll(
        updated
      );
  
    }
  
    softDelete(
      id: string
    ): void {
  
      const updated =
        this
          .getAll()
          .map(
  
            item =>
  
              item.id === id
  
                ? {
  
                    ...item,
  
                    deleted: true,
  
                    deletedAt:
                      Date.now(),
  
                  }
  
                : item
  
          );
  
      this.saveAll(
        updated
      );
  
    }
  
    restore(
      id: string
    ): void {
  
      const updated =
        this
          .getAll()
          .map(
  
            item =>
  
              item.id === id
  
                ? {
  
                    ...item,
  
                    deleted: false,
  
                    deletedAt:
                      undefined,
  
                  }
  
                : item
  
          );
  
      this.saveAll(
        updated
      );
  
    }
  
    private saveAll(
      records:
        ActivityCodeRecord[]
    ): void {
  
      localStorage.setItem(
  
        STORAGE_KEY,
  
        JSON.stringify(
          records
        )
  
      );
  
    }
  
  }
  
  export const
  activityCodeRepository =
  new ActivityCodeRepository();