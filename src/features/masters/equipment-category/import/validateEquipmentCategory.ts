import type {
    RecordValidationResult,
  } from "@/components/master-data/import-wizard/wizardTypes";
  
  import type {
    EquipmentCategoryImportRecord,
  } from "./equipmentCategoryImportConfig";
  
  export default function validateEquipmentCategory(
    records: EquipmentCategoryImportRecord[],
  ): RecordValidationResult<EquipmentCategoryImportRecord> {
  
    const validRecords: EquipmentCategoryImportRecord[] = [];
  
    const invalidRecords: EquipmentCategoryImportRecord[] = [];
  
    const errors: RecordValidationResult<EquipmentCategoryImportRecord>["errors"] = [];
  
    const warnings: RecordValidationResult<EquipmentCategoryImportRecord>["warnings"] = [];
  
    const seen = new Set<string>();
  
    records.forEach((record, index) => {
  
      const row = index + 2;
  
      const category =
        (record.category ?? "").trim();
  
      const description =
        (record.description ?? "").trim();
  
      let valid = true;
  
      if (!category) {
  
        errors.push({
  
          row,
  
          column: "Equipment Category",
  
          message: "Equipment Category is required.",
  
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
        category.toUpperCase();
  
      if (
  
        category &&
  
        seen.has(key)
  
      ) {
  
        errors.push({
  
          row,
  
          column: "Equipment Category",
  
          message:
            "Duplicate Equipment Category found in import file.",
  
        });
  
        valid = false;
  
      }
  
      if (category) {
  
        seen.add(key);
  
      }
  
      const normalized: EquipmentCategoryImportRecord = {
  
        category,
  
        description,
  
        active:
          record.active ?? true,
  
      };
  
      if (valid) {
  
        validRecords.push(normalized);
  
      }
  
      else {
  
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