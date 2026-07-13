import type {
    RecordValidationResult,
  } from "@/components/master-data/import-wizard/wizardTypes";
  
  import type {
    EquipmentBrandImportRecord,
  } from "./equipmentBrandImportConfig";
  
  export default function validateEquipmentBrand(
    records: EquipmentBrandImportRecord[],
  ): RecordValidationResult<EquipmentBrandImportRecord> {
  
    const validRecords: EquipmentBrandImportRecord[] = [];
  
    const invalidRecords: EquipmentBrandImportRecord[] = [];
  
    const errors: RecordValidationResult<EquipmentBrandImportRecord>["errors"] = [];
  
    const warnings: RecordValidationResult<EquipmentBrandImportRecord>["warnings"] = [];
  
    const seen = new Set<string>();
  
    records.forEach((record, index) => {
  
      const row = index + 2;
  
      const brand = (record.brand ?? "").trim();
  
      const description = (record.description ?? "").trim();
  
      let valid = true;
  
      if (!brand) {
  
        errors.push({
  
          row,
  
          column: "Equipment Brand",
  
          message: "Equipment Brand is required.",
  
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
  
      const key = brand.toUpperCase();
  
      if (brand && seen.has(key)) {
  
        errors.push({
  
          row,
  
          column: "Equipment Brand",
  
          message: "Duplicate Equipment Brand found in import file.",
  
        });
  
        valid = false;
  
      }
  
      if (brand) {
  
        seen.add(key);
  
      }
  
      const normalized: EquipmentBrandImportRecord = {
  
        brand,
  
        description,
  
        active: record.active ?? true,
  
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