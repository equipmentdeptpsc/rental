import type {
    ImportSummary,
  } from "@/components/master-data/import-wizard/wizardTypes";
  
  import {
    equipmentModelRepository,
  } from "../repository";
  
  import type {
    EquipmentModelRecord,
  } from "../types";
  
  import type {
    EquipmentModelImportRecord,
  } from "./equipmentModelImportConfig";
  
  export default function bulkCreateEquipmentModels(
    records: EquipmentModelImportRecord[],
  ): ImportSummary {
  
    const existing =
      equipmentModelRepository.getAll();
  
    const existingModels =
      new Set(
  
        existing.map(
  
          item =>
  
            item.equipmentModel
              .trim()
              .toUpperCase(),
  
        ),
  
      );
  
    let importedRows = 0;
  
    let skippedRows = 0;
  
    let duplicateRows = 0;
  
    for (const record of records) {
  
      const model =
        record.equipmentModel
          .trim()
          .toUpperCase();
  
      if (existingModels.has(model)) {
  
        skippedRows++;
  
        duplicateRows++;
  
        continue;
  
      }
  
      const newRecord: EquipmentModelRecord = {
  
        id: crypto.randomUUID(),
  
        equipmentModel:
          record.equipmentModel.trim(),
  
        description:
          record.description.trim(),
  
        active:
          record.active ?? true,
  
        deleted: false,
  
      };
  
      equipmentModelRepository.create(
        newRecord,
      );
  
      existingModels.add(model);
  
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