import type {
    ImportSummary,
  } from "@/components/master-data/import-wizard/wizardTypes";
  
  import {
    equipmentBrandRepository,
  } from "../repository";
  
  import type {
    EquipmentBrandRecord,
  } from "../types";
  
  import type {
    EquipmentBrandImportRecord,
  } from "./equipmentBrandImportConfig";
  
  export default function bulkCreateEquipmentBrands(
    records: EquipmentBrandImportRecord[],
  ): ImportSummary {
  
    const existing =
      equipmentBrandRepository.getAll();
  
    const existingBrands =
      new Set(
  
        existing.map(
  
          item =>
  
            item.brand
              .trim()
              .toUpperCase(),
  
        ),
  
      );
  
    let importedRows = 0;
  
    let skippedRows = 0;
  
    let duplicateRows = 0;
  
    for (const record of records) {
  
      const brand =
        record.brand
          .trim()
          .toUpperCase();
  
      if (existingBrands.has(brand)) {
  
        skippedRows++;
  
        duplicateRows++;
  
        continue;
  
      }
  
      const newRecord: EquipmentBrandRecord = {
  
        id: crypto.randomUUID(),
  
        brand:
          record.brand.trim(),
  
        description:
          record.description.trim(),
  
        active:
          record.active ?? true,
  
        deleted: false,
  
      };
  
      equipmentBrandRepository.create(
        newRecord,
      );
  
      existingBrands.add(brand);
  
      importedRows++;
  
    }
  
    return {
  
      totalRows:
        records.length,
  
      importedRows,
  
      skippedRows,
  
      duplicateRows,
  
      invalidRows: 0,
  
    };
  
  }