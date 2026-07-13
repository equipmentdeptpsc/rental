import type {
    RecordValidationResult,
  } from "@/components/master-data/import-wizard/wizardTypes";
  
  import type {
    EquipmentModelImportRecord,
  } from "./equipmentModelImportConfig";
  
  export default function validateEquipmentModel(
    records: EquipmentModelImportRecord[],
  ): RecordValidationResult<EquipmentModelImportRecord> {
  
    const validRecords: EquipmentModelImportRecord[] = [];
  
    const invalidRecords: EquipmentModelImportRecord[] = [];
  
    const errors: RecordValidationResult<EquipmentModelImportRecord>["errors"] = [];
  
    const warnings: RecordValidationResult<EquipmentModelImportRecord>["warnings"] = [];
  
    const seen = new Set<string>();
  
    records.forEach((record, index) => {
  
      const row = index + 2;
  
      const equipmentModel =
        (record.equipmentModel ?? "").trim();
  
      const description =
        (record.description ?? "").trim();
  
      let valid = true;
  
      if (!equipmentModel) {
  
        errors.push({
  
          row,
  
          column: "Equipment Model",
  
          message: "Equipment Model is required.",
  
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
        equipmentModel.toUpperCase();
  
      if (
  
        equipmentModel &&
  
        seen.has(key)
  
      ) {
  
        errors.push({
  
          row,
  
          column: "Equipment Model",
  
          message:
            "Duplicate Equipment Model found in import file.",
  
        });
  
        valid = false;
  
      }
  
      if (equipmentModel) {
  
        seen.add(key);
  
      }
  
      const normalized: EquipmentModelImportRecord = {
  
        equipmentModel,
  
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