import type {
    RecordValidationError,
    RecordValidationResult,
  } from "@/components/master-data/import-wizard/wizardTypes";
  
  import type {
    CostCodeImportRecord,
  } from "./costCodeImportConfig";
  
  export default function validateCostCode(
    records: CostCodeImportRecord[],
  ): RecordValidationResult<CostCodeImportRecord> {
  
    const validRecords: CostCodeImportRecord[] = [];
  
    const invalidRecords: CostCodeImportRecord[] = [];
  
    const errors: RecordValidationError[] = [];
  
    const seenCodes = new Set<string>();
  
    records.forEach((record, index) => {
  
      const row = index + 2;
  
      const normalized: CostCodeImportRecord = {
  
        ...record,
  
        costCode:
          record.costCode?.trim() ?? "",
  
        description:
          record.description?.trim() ?? "",
  
        active:
          record.active ?? true,
  
      };
  
      let hasError = false;
  
      if (!normalized.costCode) {
  
        errors.push({
  
          row,
  
          column: "Cost Code",
  
          message: "Cost Code is required.",
  
        });
  
        hasError = true;
  
      }
  
      if (!normalized.description) {
  
        errors.push({
  
          row,
  
          column: "Description",
  
          message: "Description is required.",
  
        });
  
        hasError = true;
  
      }
  
      const duplicateKey =
        normalized.costCode.toUpperCase();
  
      if (duplicateKey) {
  
        if (seenCodes.has(duplicateKey)) {
  
          errors.push({
  
            row,
  
            column: "Cost Code",
  
            message:
              `Duplicate Cost Code '${normalized.costCode}' found in import file.`,
  
          });
  
          hasError = true;
  
        }
  
        else {
  
          seenCodes.add(duplicateKey);
  
        }
  
      }
  
      if (hasError) {
  
        invalidRecords.push(normalized);
  
      }
  
      else {
  
        validRecords.push(normalized);
  
      }
  
    });
  
    return {
  
      validRecords,
  
      invalidRecords,
  
      errors,
  
      warnings: [],
  
    };
  
  }