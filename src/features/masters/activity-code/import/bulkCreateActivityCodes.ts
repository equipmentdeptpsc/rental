import type {
    ImportSummary,
  } from "@/components/master-data/import-wizard/wizardTypes";
  
  import {
    activityCodeRepository,
  } from "../repository";
  
  import type {
    ActivityCodeRecord,
  } from "../types";
  
  import type {
    ActivityCodeImportRecord,
  } from "./activityImportConfig";
  
  /**
   * ==========================================
   * Bulk Import Activity Codes
   * ==========================================
   *
   * Imports validated Activity Code records.
   *
   * Rules:
   * - Skip duplicate Activity Codes already
   *   existing in storage.
   * - Preserve no-seed architecture.
   * - New records are Active and not Deleted.
   * - Returns ImportSummary.
   */
  
  export function bulkCreateActivityCodes(
    records: ActivityCodeImportRecord[],
  ): ImportSummary {
  
    const existing =
      activityCodeRepository.getAll();
  
    const existingCodes =
      new Set(
  
        existing.map(item =>
          item.activityCode
            .trim()
            .toUpperCase()
        )
  
      );
  
    let importedRows = 0;
  
    let duplicateRows = 0;
  
    const newRecords: ActivityCodeRecord[] = [];
  
    records.forEach(record => {
  
      const code =
        record.activityCode
          .trim()
          .toUpperCase();
  
      if (existingCodes.has(code)) {
  
        duplicateRows++;
  
        return;
  
      }
  
      existingCodes.add(code);
  
      newRecords.push({
  
        id: crypto.randomUUID(),
  
        activityCode:
          record.activityCode.trim(),
  
        description:
          record.description.trim(),
  
        active:
          record.active ?? true,
  
        deleted: false,
  
      });
  
      importedRows++;
  
    });
  
    if (newRecords.length > 0) {
  
      newRecords.forEach(record => {
  
        activityCodeRepository.create(record);
  
      });
  
    }
  
    return {
  
      totalRows:
        records.length,
  
      importedRows,
  
      skippedRows:
        duplicateRows,
  
      duplicateRows,
  
      invalidRows: 0,
  
    };
  
  }
  
  export default bulkCreateActivityCodes;