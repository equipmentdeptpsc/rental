import type {
    ImportSummary,
  } from "@/components/master-data/import-wizard/wizardTypes";
  
  import {
    equipmentLocationRepository,
  } from "../repository";
  
  import type {
    EquipmentLocationRecord,
  } from "../types";
  
  import type {
    EquipmentLocationImportRecord,
  } from "./equipmentLocationImportConfig";
  
  export default function bulkCreateEquipmentLocations(
    records: EquipmentLocationImportRecord[],
  ): ImportSummary {
  
    const existing =
      equipmentLocationRepository.getAll();
  
    const existingLocations =
      new Set(
  
        existing.map(
  
          item =>
  
            item.location
              .trim()
              .toUpperCase(),
  
        ),
  
      );
  
    let importedRows = 0;
  
    let skippedRows = 0;
  
    let duplicateRows = 0;
  
    for (const record of records) {
  
      const location =
        record.location
          .trim()
          .toUpperCase();
  
      if (existingLocations.has(location)) {
  
        skippedRows++;
  
        duplicateRows++;
  
        continue;
  
      }
  
      const newRecord: EquipmentLocationRecord = {
  
        id: crypto.randomUUID(),
  
        location:
          record.location.trim(),
  
        description:
          record.description.trim(),
  
        active:
          record.active ?? true,
  
        deleted: false,
  
      };
  
      equipmentLocationRepository.create(
        newRecord,
      );
  
      existingLocations.add(location);
  
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