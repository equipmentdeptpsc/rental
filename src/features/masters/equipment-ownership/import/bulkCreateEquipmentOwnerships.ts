import type {
    ImportSummary,
  } from "@/components/master-data/import-wizard/wizardTypes";
  
  import {
    equipmentOwnershipRepository,
  } from "../repository";
  
  import type {
    EquipmentOwnershipRecord,
  } from "../types";
  
  import type {
    EquipmentOwnershipImportRecord,
  } from "./equipmentOwnershipImportConfig";
  
  export default function bulkCreateEquipmentOwnerships(
    records: EquipmentOwnershipImportRecord[],
  ): ImportSummary {
  
    const existing =
      equipmentOwnershipRepository.getAll();
  
    const existingOwnerships =
      new Set(
  
        existing.map(
  
          item =>
  
            item.ownership
              .trim()
              .toUpperCase(),
  
        ),
  
      );
  
    let importedRows = 0;
  
    let skippedRows = 0;
  
    let duplicateRows = 0;
  
    for (const record of records) {
  
      const ownership =
        record.ownership
          .trim()
          .toUpperCase();
  
      if (existingOwnerships.has(ownership)) {
  
        skippedRows++;
  
        duplicateRows++;
  
        continue;
  
      }
  
      const newRecord: EquipmentOwnershipRecord = {
  
        id: crypto.randomUUID(),
  
        ownership:
          record.ownership.trim(),
  
        description:
          record.description.trim(),
  
        active:
          record.active ?? true,
  
        deleted: false,
  
      };
  
      equipmentOwnershipRepository.create(
        newRecord,
      );
  
      existingOwnerships.add(
        ownership,
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