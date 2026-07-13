import type {
    RecordValidationResult,
  } from "@/components/master-data/import-wizard/wizardTypes";
  
  import type {
    EquipmentConditionImportRecord,
  } from "./equipmentConditionImportConfig";
  
  export default function validateEquipmentCondition(
    records: EquipmentConditionImportRecord[],
  ): RecordValidationResult<EquipmentConditionImportRecord> {
  
    const validRecords: EquipmentConditionImportRecord[] = [];
  
    const invalidRecords: EquipmentConditionImportRecord[] = [];
  
    const errors: RecordValidationResult<EquipmentConditionImportRecord>["errors"] = [];
  
    const warnings: RecordValidationResult<EquipmentConditionImportRecord>["warnings"] = [];
  
    const seen = new Set<string>();
  
    records.forEach((record, index) => {
  
      const row = index + 2;
  
      const condition =
        (record.condition ?? "").trim();
  
      const description =
        (record.description ?? "").trim();
  
      let valid = true;
  
      if (!condition) {
  
        errors.push({
  
          row,
  
          column: "Equipment Condition",
  
          message: "Equipment Condition is required.",
  
        });
  
        valid = false;
  
      }
  
      if (!description) {
  
        errors.push({
  
          row,
  
          column: "Description",
  
          message: "Description is required.",
  
        });
  
        valid = false;
  
      }
  
      const key =
        condition.toUpperCase();
  
      if (
  
        condition &&
  
        seen.has(key)
  
      ) {
  
        errors.push({
  
          row,
  
          column: "Equipment Condition",
  
          message:
            "Duplicate Equipment Condition found in import file.",
  
        });
  
        valid = false;
  
      }
  
      if (condition) {
  
        seen.add(key);
  
      }
  
      const normalized: EquipmentConditionImportRecord = {
  
        condition,
  
        description,
  
        active:
          record.active ?? true,
  
      };
  
      if (valid) {
  
        validRecords.push(normalized);
  
      } else {
  
        invalidRecords.push(normalized);
  
      }
  
    });
  
    return {
  
      validRecords,
  
      invalidRecords,
  
      errors,
  
      warnings,
  
    };
  
  }