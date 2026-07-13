import type {
    RecordValidationResult,
  } from "@/components/master-data/import-wizard/wizardTypes";
  
  import type {
    EquipmentOwnershipImportRecord,
  } from "./equipmentOwnershipImportConfig";
  
  export default function validateEquipmentOwnership(
    records: EquipmentOwnershipImportRecord[],
  ): RecordValidationResult<EquipmentOwnershipImportRecord> {
  
    const validRecords: EquipmentOwnershipImportRecord[] = [];
  
    const invalidRecords: EquipmentOwnershipImportRecord[] = [];
  
    const errors: RecordValidationResult<EquipmentOwnershipImportRecord>["errors"] = [];
  
    const warnings: RecordValidationResult<EquipmentOwnershipImportRecord>["warnings"] = [];
  
    const seen = new Set<string>();
  
    records.forEach((record, index) => {
  
      const row = index + 2;
  
      const ownership =
        (record.ownership ?? "").trim();
  
      const description =
        (record.description ?? "").trim();
  
      let valid = true;
  
      if (!ownership) {
  
        errors.push({
  
          row,
  
          column: "Equipment Ownership",
  
          message: "Equipment Ownership is required.",
  
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
        ownership.toUpperCase();
  
      if (
  
        ownership &&
  
        seen.has(key)
  
      ) {
  
        errors.push({
  
          row,
  
          column: "Equipment Ownership",
  
          message:
            "Duplicate Equipment Ownership found in import file.",
  
        });
  
        valid = false;
  
      }
  
      if (ownership) {
  
        seen.add(key);
  
      }
  
      const normalized: EquipmentOwnershipImportRecord = {
  
        ownership,
  
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