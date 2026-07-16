import { validateHeaders } from "./headerValidation";
import type { ImportResult } from "./excelImport";
import type { ImportColumnDefinition } from "@/components/master-data/import-wizard/wizardTypes";

export interface ImportValidationOutcome<T> {
  blockingErrors: string[];
  warnings: string[];
  validRecords: T[];
  invalidRecords: T[];
  rowErrors: Array<{ row: number; message: string }>;
  canConfirm: boolean;
}

export function validateImportedData<T extends object>(
  result: ImportResult<T>,
  columns: ImportColumnDefinition<T>[],
  validateRecord?: (record: T, rowNumber: number) => string[]
): ImportValidationOutcome<T> {
  const blockingErrors = [...result.errors];
  const rowErrors: Array<{ row: number; message: string }> = [];
  const validRecords: T[] = [];
  const invalidRecords: T[] = [];

  if (result.success) {
    const headers = validateHeaders(result.headers, {
      requiredHeaders: columns.filter(column => column.required).map(column => column.header),
      allowAdditionalColumns: true,
    });
    blockingErrors.push(...headers.errors);
    if (!result.records.length) blockingErrors.push("The file contains no data records.");
    result.records.forEach((record, index) => {
      const errors = validateRecord?.(record, index + 2) ?? [];
      if (errors.length) {
        invalidRecords.push(record);
        errors.forEach(message => rowErrors.push({ row: index + 2, message }));
      } else validRecords.push(record);
    });
    if (rowErrors.length) blockingErrors.push("Some rows need correction before import.");
  }

  return { blockingErrors, warnings: [], validRecords, invalidRecords, rowErrors, canConfirm: blockingErrors.length === 0 };
}
