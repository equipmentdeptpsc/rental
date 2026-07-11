import type {
    RecordValidationError,
    RecordValidationResult,
  } from "@/components/master-data/import-wizard/wizardTypes";
  
  import type {
    ActivityCodeImportRecord,
  } from "./activityImportConfig";
  
  export default function validateActivityCode(
    records: ActivityCodeImportRecord[],
  ): RecordValidationResult<ActivityCodeImportRecord> {
  
    const validRecords: ActivityCodeImportRecord[] = [];
  
    const invalidRecords: ActivityCodeImportRecord[] = [];
  
    const errors: RecordValidationError[] = [];
  
    const seen = new Set<string>();
  
    records.forEach((record, index) => {
  
      const cleaned: ActivityCodeImportRecord = {
  
        ...record,
  
        activityCode:
          record.activityCode?.trim() ?? "",
  
        description:
          record.description?.trim() ?? "",
  
        active:
          record.active ?? true,
  
      };
  
      let hasError = false;
  
      if (!cleaned.activityCode) {
  
        hasError = true;
  
        errors.push({
  
          row: index + 2,
  
          column: "Activity Code",
  
          message: "Activity Code is required.",
  
        });
  
      }
  
      if (!cleaned.description) {
  
        hasError = true;
  
        errors.push({
  
          row: index + 2,
  
          column: "Description",
  
          message: "Description is required.",
  
        });
  
      }
  
      const key =
        cleaned.activityCode.toUpperCase();
  
      if (
  
        key &&
  
        seen.has(key)
  
      ) {
  
        hasError = true;
  
        errors.push({
  
          row: index + 2,
  
          column: "Activity Code",
  
          message:
            "Duplicate Activity Code found in import file.",
  
        });
  
      }
  
      if (key) {
  
        seen.add(key);
  
      }
  
      if (hasError) {
  
        invalidRecords.push(cleaned);
  
      }
  
      else {
  
        validRecords.push(cleaned);
  
      }
  
    });
  
    return {
  
      validRecords,
  
      invalidRecords,
  
      errors,
  
      warnings: [],
  
    };
  
  }