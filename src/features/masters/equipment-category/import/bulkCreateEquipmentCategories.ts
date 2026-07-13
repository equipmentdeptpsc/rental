import type {
    ImportSummary,
  } from "@/components/master-data/import-wizard/wizardTypes";
  
  import {
    equipmentCategoryRepository,
  } from "../repository";
  
  import type {
    EquipmentCategoryRecord,
  } from "../types";
  
  import type {
    EquipmentCategoryImportRecord,
  } from "./equipmentCategoryImportConfig";
  
  export default function bulkCreateEquipmentCategories(
    records: EquipmentCategoryImportRecord[],
  ): ImportSummary {
  
    const existing =
      equipmentCategoryRepository.getAll();
  
    const existingCategories =
      new Set(
  
        existing.map(
  
          item =>
  
            item.category
              .trim()
              .toUpperCase(),
  
        ),
  
      );
  
    let importedRows = 0;
  
    let skippedRows = 0;
  
    let duplicateRows = 0;
  
    for (const record of records) {
  
      const category =
        record.category
          .trim()
          .toUpperCase();
  
      if (existingCategories.has(category)) {
  
        skippedRows++;
  
        duplicateRows++;
  
        continue;
  
      }
  
      const newRecord: EquipmentCategoryRecord = {
  
        id: crypto.randomUUID(),
  
        category:
          record.category.trim(),
  
        description:
          record.description.trim(),
  
        active:
          record.active ?? true,
  
        deleted: false,
  
      };
  
      equipmentCategoryRepository.create(
        newRecord,
      );
  
      existingCategories.add(category);
  
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