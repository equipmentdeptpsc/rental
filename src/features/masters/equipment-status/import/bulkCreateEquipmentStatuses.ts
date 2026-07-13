import type {
    ImportSummary,
  } from "@/components/master-data/import-wizard/wizardTypes";
  
  import {
    equipmentStatusRepository,
  } from "../repository";
  
  import type {
    EquipmentStatusRecord,
  } from "../types";
  
  import type {
    EquipmentStatusImportRecord,
  } from "./equipmentStatusImportConfig";
  
  export default function bulkCreateEquipmentStatuses(
    records: EquipmentStatusImportRecord[],
  ): ImportSummary {
  
    const existing =
      equipmentStatusRepository.getAll();
  
    const existingStatuses =
      new Set(
  
        existing.map(
  
          item =>
  
            item.status
              .trim()
              .toUpperCase(),
  
        ),
  
      );
  
    let importedRows = 0;
  
    let skippedRows = 0;
  
    let duplicateRows = 0;
  
    for (const record of records) {
  
      const status =
        record.status
          .trim()
          .toUpperCase();
  
      if (existingStatuses.has(status)) {
  
        skippedRows++;
  
        duplicateRows++;
  
        continue;
  
      }
  
      const newRecord: EquipmentStatusRecord = {
  
        id: crypto.randomUUID(),
  
        status:
          record.status.trim(),
  
        description:
          record.description.trim(),
  
        active:
          record.active ?? true,
  
        deleted: false,
  
      };
  
      equipmentStatusRepository.create(
        newRecord,
      );
  
      existingStatuses.add(status);
  
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