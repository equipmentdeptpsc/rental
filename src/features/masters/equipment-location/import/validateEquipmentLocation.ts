import type {
    RecordValidationResult,
  } from "@/components/master-data/import-wizard/wizardTypes";
  
  import type {
    EquipmentLocationImportRecord,
  } from "./equipmentLocationImportConfig";
  
  export default function validateEquipmentLocation(
    records: EquipmentLocationImportRecord[],
  ): RecordValidationResult<EquipmentLocationImportRecord> {
  
    const validRecords: EquipmentLocationImportRecord[] = [];
  
    const invalidRecords: EquipmentLocationImportRecord[] = [];
  
    const errors: RecordValidationResult<EquipmentLocationImportRecord>["errors"] = [];
  
    const warnings: RecordValidationResult<EquipmentLocationImportRecord>["warnings"] = [];
  
    const seen = new Set<string>();
  
    records.forEach((record, index) => {
  
      const row = index + 2;
  
      const location =
        (record.location ?? "").trim();
  
      const description =
        (record.description ?? "").trim();
  
      let valid = true;
  
      if (!location) {
  
        errors.push({
  
          row,
  
          column: "Equipment Location",
  
          message: "Equipment Location is required.",
  
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
        location.toUpperCase();
  
      if (
  
        location &&
  
        seen.has(key)
  
      ) {
  
        errors.push({
  
          row,
  
          column: "Equipment Location",
  
          message:
            "Duplicate Equipment Location found in import file.",
  
        });
  
        valid = false;
  
      }
  
      if (location) {
  
        seen.add(key);
  
      }
  
      const normalized: EquipmentLocationImportRecord = {
  
        location,
  
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