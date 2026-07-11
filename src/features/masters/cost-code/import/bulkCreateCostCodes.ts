import type {
    ImportSummary,
  } from "@/components/master-data/import-wizard/wizardTypes";
  
  import {
    costCodeRepository,
  } from "../repository";
  
  import type {
    CostCodeImportRecord,
  } from "./costCodeImportConfig";
  
  import type {
    CostCodeRecord,
  } from "../types";
  
  export default function bulkCreateCostCodes(
    records: CostCodeImportRecord[],
  ): ImportSummary {
  
    const existing =
      costCodeRepository.getAll();
  
    const existingCodes =
      new Set(
  
        existing.map(
  
          item =>
  
            item.code
              .trim()
              .toUpperCase()
  
        )
  
      );
  
    let importedRows = 0;
  
    let skippedRows = 0;
  
    let duplicateRows = 0;
  
    for (const record of records) {
  
      const code =
        record.costCode
          .trim()
          .toUpperCase();
  
      if (existingCodes.has(code)) {
  
        skippedRows++;
  
        duplicateRows++;
  
        continue;
  
      }
  
      const newRecord: CostCodeRecord = {
  
        id: crypto.randomUUID(),
  
        code: record.costCode.trim(),
  
        description: record.description.trim(),
  
        defaultRate: 0,
  
        unit: "Hour",
  
        active: record.active ?? true,
  
        remarks: "",
  
        deleted: false,
  
      };
  
      costCodeRepository.create(
        newRecord
      );
  
      existingCodes.add(code);
  
      importedRows++;
  
    }
  
    return {
  
      totalRows: records.length,
  
      importedRows,
  
      skippedRows,
  
      duplicateRows,
  
      invalidRows: 0,
  
    };
  
  }