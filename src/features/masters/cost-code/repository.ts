import type {
    CostCodeRecord,
  } from "./types";
  import { createLegacyLocalRepositoryStorage } from "@/core/persistence";
  
  const persistence = createLegacyLocalRepositoryStorage("CostCode");

  const CLASSIFICATION_SEEDS: CostCodeRecord[] = [
    {
      id: "cost-code-5031-heavy-equipment",
      code: "5031HEAVYEQPT",
      description: "Heavy Equipment",
      equipmentClassification: "Heavy",
      sortOrder: 10,
      defaultRate: 0,
      unit: "Hour",
      active: true,
      deleted: false,
    },
    {
      id: "cost-code-5031-light-equipment",
      code: "5031LIGHTEQPT",
      description: "Light Equipment",
      equipmentClassification: "Light",
      sortOrder: 20,
      defaultRate: 0,
      unit: "Hour",
      active: true,
      deleted: false,
    },
  ];
  
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
      const persisted = persistence.load<CostCodeRecord[]>();
      const stored = persisted ?? SEED_DATA;
      const existingCodes = new Set(
        stored.map((record) => record.code.trim().toUpperCase())
      );
      const missingSeeds = CLASSIFICATION_SEEDS.filter(
        (seed) => !existingCodes.has(seed.code)
      );

      if (!persisted || missingSeeds.length > 0) {
        persistence.save([...stored, ...missingSeeds]);
      }
  
    }
  
    getAll(): CostCodeRecord[] {
  
      this.initialize();
  
      return persistence.load<CostCodeRecord[]>() ?? [];
  
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
  
      persistence.save(records);
  
    }
  
  }
  
  export const
  costCodeRepository =
  new CostCodeRepository();
