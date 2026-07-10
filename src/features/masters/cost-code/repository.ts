import type {
    CostCodeRecord,
  } from "./types";
  
  const STORAGE_KEY =
    "equipment-rental-cost-codes";
  
  const SEED_DATA: CostCodeRecord[] = [
  
    {
      id: crypto.randomUUID(),
      code: "RENT",
      description: "Equipment Rental",
      defaultRate: 0,
      unit: "Hour",
      active: true,
      deleted: false,
    },
  
    {
      id: crypto.randomUUID(),
      code: "IDLE",
      description: "Idle Rental",
      defaultRate: 0,
      unit: "Hour",
      active: true,
      deleted: false,
    },
  
    {
      id: crypto.randomUUID(),
      code: "MOB",
      description: "Mobilization",
      defaultRate: 0,
      unit: "Trip",
      active: true,
      deleted: false,
    },
  
    {
      id: crypto.randomUUID(),
      code: "DEMOB",
      description: "Demobilization",
      defaultRate: 0,
      unit: "Trip",
      active: true,
      deleted: false,
    },
  
    {
      id: crypto.randomUUID(),
      code: "OT",
      description: "Overtime Rental",
      defaultRate: 0,
      unit: "Hour",
      active: true,
      deleted: false,
    },
  
  ];
  
  class CostCodeRepository {
  
    private initialize() {
  
      if (
        localStorage.getItem(
          STORAGE_KEY
        )
      ) {
        return;
      }
  
      localStorage.setItem(
  
        STORAGE_KEY,
  
        JSON.stringify(
          SEED_DATA
        )
  
      );
  
    }
  
    getAll(): CostCodeRecord[] {
  
      this.initialize();
  
      const raw =
        localStorage.getItem(
          STORAGE_KEY
        );
  
      if (!raw) {
        return [];
      }
  
      return JSON.parse(raw);
  
    }
  
    getActive() {
  
      return this.getAll().filter(
  
        item =>
  
          item.active &&
  
          !item.deleted
  
      );
  
    }
  
    getById(
      id: string
    ) {
  
      return this.getAll().find(
  
        item =>
  
          item.id === id
  
      );
  
    }
  
    search(
      keyword: string
    ) {
  
      const value =
        keyword
          .trim()
          .toLowerCase();
  
      if (!value) {
        return this.getAll();
      }
  
      return this.getAll().filter(
  
        item =>
  
          item.code
            .toLowerCase()
            .includes(value)
  
          ||
  
          item.description
            .toLowerCase()
            .includes(value)
  
      );
  
    }
  
    create(
      record: CostCodeRecord
    ) {
  
      const all =
        this.getAll();
  
      all.push(record);
  
      this.saveAll(all);
  
    }
  
    update(
      record: CostCodeRecord
    ) {
  
      this.saveAll(
  
        this.getAll().map(
  
          item =>
  
            item.id === record.id
  
              ? record
  
              : item
  
        )
  
      );
  
    }
  
    softDelete(
      id: string
    ) {
  
      this.saveAll(
  
        this.getAll().map(
  
          item =>
  
            item.id === id
  
              ? {
  
                  ...item,
  
                  deleted: true,
  
                  deletedAt:
                    Date.now(),
  
                }
  
              : item
  
        )
  
      );
  
    }
  
    private saveAll(
      records: CostCodeRecord[]
    ) {
  
      localStorage.setItem(
  
        STORAGE_KEY,
  
        JSON.stringify(
          records
        )
  
      );
  
    }
  
  }
  
  export const
  costCodeRepository =
  new CostCodeRepository();