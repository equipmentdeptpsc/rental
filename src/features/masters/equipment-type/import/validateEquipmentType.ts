import type {
    RecordValidationError,
    RecordValidationResult,
  } from "@/components/master-data/import-wizard/wizardTypes";
  
  import type {
    EquipmentTypeImportRecord,
  } from "./equipmentTypeImportConfig";
  
  export default function validateEquipmentType(
    records: EquipmentTypeImportRecord[],
  ): RecordValidationResult<EquipmentTypeImportRecord> {
  
    const validRecords: EquipmentTypeImportRecord[] = [];
  
    const invalidRecords: EquipmentTypeImportRecord[] = [];
  
    const errors: RecordValidationError[] = [];
  
    const seen = new Set<string>();
  
    records.forEach((record, index) => {
  
      const row = index + 1;
  
      const equipmentType =
        record.equipmentType?.trim() ?? "";
  
      const description =
        record.description?.trim() ?? "";
  
      const rowErrors: RecordValidationError[] = [];
  
      if (!equipmentType) {
  
        rowErrors.push({
  
          row,
  
          column: "Equipment Type",
  
          message: "Equipment Type is required.",
  
        });
  
      }
  
      if (!description) {
  
        rowErrors.push({
  
          row,
  
          column: "Description",
  
          message: "Description is required.",
  
        });
  
      }
  
      const duplicateKey =
        equipmentType.toUpperCase();
  
      if (
  
        equipmentType &&
  
        seen.has(duplicateKey)
  
      ) {
  
        rowErrors.push({
  
          row,
  
          column: "Equipment Type",
  
          message: "Duplicate Equipment Type found in import file.",
  
        });
  
      }
  
      seen.add(duplicateKey);
  
      const cleanedRecord: EquipmentTypeImportRecord = {
  
        equipmentType,
  
        description,
  
        active:
  
          record.active ?? true,
  
      };
  
      if (rowErrors.length === 0) {
  
        validRecords.push(
  
          cleanedRecord
  
        );
  
      }
  
      else {
  
        invalidRecords.push(
  
          cleanedRecord
  
        );
  
        errors.push(
  
          ...rowErrors
  
        );
  
      }
  
    });
  
    return {
  
      validRecords,
  
      invalidRecords,
  
      errors,
  
      warnings: [],
  
    };
  
  }