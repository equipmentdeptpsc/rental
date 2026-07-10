/**
 * ==========================================================
 * Record Validation
 * ----------------------------------------------------------
 * Generic row validator for all ERP imports.
 * ==========================================================
 */

export interface ValidationRule {

    field: string;
  
    required?: boolean;
  
    type?:
      | "string"
      | "number"
      | "boolean";
  
    maxLength?: number;
  
    min?: number;
  
    max?: number;
  
    allowedValues?: readonly string[];
  
  }
  
  export interface RecordValidationError {
  
    row: number;
  
    field: string;
  
    message: string;
  
  }
  
  export interface RecordValidationResult<T> {
  
    valid: boolean;
  
    validRecords: T[];
  
    errors: RecordValidationError[];
  
  }
  
  export function validateRecords<T extends Record<string, unknown>>(
  
    records: T[],
  
    rules: ValidationRule[],
  
    duplicateKey?: keyof T
  
  ): RecordValidationResult<T> {
  
    const errors: RecordValidationError[] = [];
  
    const validRecords: T[] = [];
  
    const duplicates = new Set<string>();
  
    records.forEach((record, index) => {
  
      let valid = true;
  
      rules.forEach(rule => {
  
        const value = record[rule.field];
  
        /**
         * Required
         */
  
        if (
  
          rule.required &&
  
          (
  
            value === undefined ||
  
            value === null ||
  
            value === ""
  
          )
  
        ) {
  
          errors.push({
  
            row: index + 2,
  
            field: rule.field,
  
            message: "Required field."
  
          });
  
          valid = false;
  
          return;
  
        }
  
        if (
  
          value === undefined ||
  
          value === null ||
  
          value === ""
  
        ) {
  
          return;
  
        }
  
        /**
         * String
         */
  
        if (
  
          rule.type === "string"
  
        ) {
  
          if (
  
            typeof value !== "string"
  
          ) {
  
            errors.push({
  
              row: index + 2,
  
              field: rule.field,
  
              message: "Must be text."
  
            });
  
            valid = false;
  
            return;
  
          }
  
          if (
  
            rule.maxLength &&
  
            value.length > rule.maxLength
  
          ) {
  
            errors.push({
  
              row: index + 2,
  
              field: rule.field,
  
              message:
  
                `Maximum ${rule.maxLength} characters.`
  
            });
  
            valid = false;
  
          }
  
        }
  
        /**
         * Number
         */
  
        if (
  
          rule.type === "number"
  
        ) {
  
          const numberValue =
  
            Number(value);
  
          if (
  
            Number.isNaN(
  
              numberValue
  
            )
  
          ) {
  
            errors.push({
  
              row: index + 2,
  
              field: rule.field,
  
              message: "Must be numeric."
  
            });
  
            valid = false;
  
            return;
  
          }
  
          if (
  
            rule.min !== undefined &&
  
            numberValue < rule.min
  
          ) {
  
            errors.push({
  
              row: index + 2,
  
              field: rule.field,
  
              message:
  
                `Minimum value is ${rule.min}.`
  
            });
  
            valid = false;
  
          }
  
          if (
  
            rule.max !== undefined &&
  
            numberValue > rule.max
  
          ) {
  
            errors.push({
  
              row: index + 2,
  
              field: rule.field,
  
              message:
  
                `Maximum value is ${rule.max}.`
  
            });
  
            valid = false;
  
          }
  
        }
  
        /**
         * Boolean
         */
  
        if (
  
          rule.type === "boolean"
  
        ) {
  
          if (
  
            typeof value !== "boolean"
  
          ) {
  
            errors.push({
  
              row: index + 2,
  
              field: rule.field,
  
              message: "Must be TRUE or FALSE."
  
            });
  
            valid = false;
  
          }
  
        }
  
        /**
         * Allowed values
         */
  
        if (
  
          rule.allowedValues &&
  
          !rule.allowedValues.includes(
  
            String(value)
  
          )
  
        ) {
  
          errors.push({
  
            row: index + 2,
  
            field: rule.field,
  
            message:
  
              `Invalid value "${value}".`
  
          });
  
          valid = false;
  
        }
  
      });
  
      /**
       * Duplicate detection
       */
  
      if (
  
        duplicateKey
  
      ) {
  
        const duplicateValue =
  
          String(
  
            record[duplicateKey]
  
          )
  
            .trim()
  
            .toLowerCase();
  
        if (
  
          duplicates.has(
  
            duplicateValue
  
          )
  
        ) {
  
          errors.push({
  
            row: index + 2,
  
            field: String(
  
              duplicateKey
  
            ),
  
            message:
  
              "Duplicate value."
  
          });
  
          valid = false;
  
        }
  
        duplicates.add(
  
          duplicateValue
  
        );
  
      }
  
      if (
  
        valid
  
      ) {
  
        validRecords.push(
  
          record
  
        );
  
      }
  
    });
  
    return {
  
      valid:
  
        errors.length === 0,
  
      validRecords,
  
      errors,
  
    };
  
  }