import type {
    ImportSummary,
  } from "@/components/master-data/import-wizard/wizardTypes";
  
  import {
    equipmentTypeRepository,
  } from "../repository";
  
  import type {
    EquipmentTypeRecord,
  } from "../types";
  
  import type {
    EquipmentTypeImportRecord,
  } from "./equipmentTypeImportConfig";
  
  export default function bulkCreateEquipmentTypes(
    records: EquipmentTypeImportRecord[],
  ): ImportSummary {
  
    const existing =
      equipmentTypeRepository.getAll();
  
    const existingTypes =
      new Set(
  
        existing.map(
  
          item =>
  
            item.equipmentType
              .trim()
              .toUpperCase()
  
        )
  
      );
  
    let importedRows = 0;
  
    let skippedRows = 0;
  
    let duplicateRows = 0;
  
    for (const record of records) {
  
      const equipmentType =
        record.equipmentType
          .trim()
          .toUpperCase();
  
      if (
  
        existingTypes.has(
  
          equipmentType
  
        )
  
      ) {
  
        skippedRows++;
  
        duplicateRows++;
  
        continue;
  
      }
  
      const newRecord: EquipmentTypeRecord = {
  
        id: crypto.randomUUID(),
  
        equipmentType:
          record.equipmentType.trim(),
  
        description:
          record.description.trim(),
  
        active:
          record.active ?? true,
  
        deleted: false,
  
      };
  
      equipmentTypeRepository.create(
  
        newRecord
  
      );
  
      existingTypes.add(
  
        equipmentType
  
      );
  
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