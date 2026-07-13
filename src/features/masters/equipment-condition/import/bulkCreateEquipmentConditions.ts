import type {
    ImportSummary,
  } from "@/components/master-data/import-wizard/wizardTypes";
  
  import {
    equipmentConditionRepository,
  } from "../repository";
  
  import type {
    EquipmentConditionRecord,
  } from "../types";
  
  import type {
    EquipmentConditionImportRecord,
  } from "./equipmentConditionImportConfig";
  
  export default function bulkCreateEquipmentConditions(
    records: EquipmentConditionImportRecord[],
  ): ImportSummary {
  
    const existing =
      equipmentConditionRepository.getAll();
  
    const existingConditions =
      new Set(
  
        existing.map(
  
          item =>
  
            item.condition
              .trim()
              .toUpperCase(),
  
        ),
  
      );
  
    let importedRows = 0;
  
    let skippedRows = 0;
  
    let duplicateRows = 0;
  
    for (const record of records) {
  
      const condition =
        record.condition
          .trim()
          .toUpperCase();
  
      if (existingConditions.has(condition)) {
  
        skippedRows++;
  
        duplicateRows++;
  
        continue;
  
      }
  
      const newRecord: EquipmentConditionRecord = {
  
        id: crypto.randomUUID(),
  
        condition:
          record.condition.trim(),
  
        description:
          record.description.trim(),
  
        active:
          record.active ?? true,
  
        deleted: false,
  
      };
  
      equipmentConditionRepository.create(
        newRecord,
      );
  
      existingConditions.add(condition);
  
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