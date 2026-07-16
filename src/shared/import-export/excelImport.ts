import ExcelJS from "exceljs";

import {
  validateImportFile,
  validateRowCount,
} from "./fileValidation";
import { getWorksheetHeaders, getWorksheetRecords } from "./excelWorkbook";

export interface ImportResult<T> {

  success: boolean;

  records: T[];

  errors: string[];

  headers: string[];

}

export async function importExcel<T>(

  file: File

): Promise<ImportResult<T>> {

  try {

    const validation = validateImportFile(file);

    if (!validation.valid) {
      return {
        success: false,
        records: [],
        errors: validation.errors,
        headers: [],
      };
    }

    const extension = file.name.split(".").pop()?.toLowerCase();

    if (extension === "csv") {
      const parsed = parseCsv<T>(await file.text());
      const records = parsed.records;
      const rowValidation = validateRowCount(records.length);

      return {
        success: rowValidation.valid,
        records: rowValidation.valid ? records : [],
        errors: rowValidation.errors,
        headers: parsed.headers,
      };
    }

    const buffer =
      await file.arrayBuffer();

    const workbook = new ExcelJS.Workbook();

    await workbook.xlsx.load(buffer as never);

    const sheetName =
      workbook.worksheets[0]?.name;

    if (!sheetName) {

      return {

        success: false,

        records: [],

        errors: [

          "Workbook contains no worksheets.",

        ],
        headers: [],

      };

    }

    const worksheet =
      workbook.getWorksheet(sheetName);

    if (!worksheet) {
      return {
        success: false,
        records: [],
        errors: ["Workbook worksheet could not be read."],
        headers: [],
      };
    }

    const rows =
      getWorksheetRecords<T>(worksheet);
    const headers = getWorksheetHeaders(worksheet);

    if (!headers.length || headers.every(header => !header)) {
      return { success: false, records: [], errors: ["Worksheet has no usable header row."], headers };
    }

    if (!rows.length) {
      return { success: false, records: [], errors: ["Worksheet contains headers but no data records."], headers };
    }

    const rowValidation = validateRowCount(rows.length);

    return {

      success: rowValidation.valid,

      records: rowValidation.valid ? rows : [],

      errors: rowValidation.errors,
      headers,

    };

  }

  catch (error) {

    return {

      success: false,

      records: [],

      errors: [

        error instanceof Error

          ? error.message

          : "Unknown import error.",

      ],
      headers: [],

    };

  }

}

function parseCsv<T>(content: string): { headers: string[]; records: T[] } {
  const rows = content
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((row) => row.trim());

  if (rows.length === 0) {
    throw new Error("CSV file contains no rows.");
  }

  const headers = parseCsvRow(rows[0]).map((header) => header.trim());

  if (headers.length === 0 || headers.some((header) => !header)) {
    throw new Error("CSV contains an invalid header row.");
  }

  if (rows.length === 1) throw new Error("Worksheet contains headers but no data records.");

  const records = rows.slice(1).map((row) => {
    const values = parseCsvRow(row);
    const record: Record<string, string> = {};

    headers.forEach((header, index) => {
      record[header] = values[index] ?? "";
    });

    return record as T;
  });

  return { headers, records };
}

function parseCsvRow(row: string): string[] {
  const values: string[] = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < row.length; index += 1) {
    const character = row[index];

    if (character === '"' && row[index + 1] === '"') {
      value += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === "," && !quoted) {
      values.push(value);
      value = "";
    } else {
      value += character;
    }
  }

  if (quoted) {
    throw new Error("CSV contains an unterminated quoted value.");
  }

  values.push(value);
  return values;
}
