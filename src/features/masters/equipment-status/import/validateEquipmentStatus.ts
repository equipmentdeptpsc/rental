import type {
    RecordValidationResult,
  } from "@/components/master-data/import-wizard/wizardTypes";
  
  import type {
    EquipmentStatusImportRecord,
  } from "./equipmentStatusImportConfig";
  
  export default function validateEquipmentStatus(
    records: EquipmentStatusImportRecord[],
  ): RecordValidationResult<EquipmentStatusImportRecord> {
  
    const validRecords: EquipmentStatusImportRecord[] = [];
  
    const invalidRecords: EquipmentStatusImportRecord[] = [];
  
    const errors: RecordValidationResult<EquipmentStatusImportRecord>["errors"] = [];
  
    const warnings: RecordValidationResult<EquipmentStatusImportRecord>["warnings"] = [];
  
    const seen = new Set<string>();
  
    records.forEach((record, index) => {
  
      const row = index + 2;
  
      const status =
        (record.status ?? "").trim();
  
      const description =
        (record.description ?? "").trim();
  
      let valid = true;
  
      if (!status) {
  
        errors.push({
  
          row,
  
          column: "Equipment Status",
  
          message: "Equipment Status is required.",
  
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
        status.toUpperCase();
  
      if (
  
        status &&
  
        seen.has(key)
  
      ) {
  
        errors.push({
  
          row,
  
          column: "Equipment Status",
  
          message:
            "Duplicate Equipment Status found in import file.",
  
        });
  
        valid = false;
  
      }
  
      if (status) {
  
        seen.add(key);
  
      }
  
      const normalized: EquipmentStatusImportRecord = {
  
        status,
  
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