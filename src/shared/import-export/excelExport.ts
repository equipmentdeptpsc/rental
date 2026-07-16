import ExcelJS from "exceljs";

import { downloadWorkbook } from "./excelWorkbook";

export interface ExportOptions<T> {

  fileName: string;

  sheetName?: string;

  columns?: Partial<
    Record<
      keyof T,
      string
    >
  >;

}

export async function exportToExcel<T>(

  records: T[],

  options: ExportOptions<T>

): Promise<void> {

  const {

    fileName,

    sheetName = "Sheet1",

    columns,

  } = options;

  if (records.length === 0) {

    alert("There is no data to export.");

    return;

  }

  let exportRows: Record<string, unknown>[] = [];

  if (columns) {

    const columnEntries = Object.entries(
      columns
    ) as Array<[keyof T, string]>;

    exportRows = records.map(record => {

      const source =
        record as Record<string, unknown>;

      const row: Record<string, unknown> = {};

      columnEntries.forEach(([key, label]) => {

        row[label || String(key)] =
          source[String(key)];

      });

      return row;

    });

  }

  else {

    exportRows = records.map(record =>

      record as Record<string, unknown>

    );

  }

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(sheetName);
  const headers = Object.keys(exportRows[0] ?? {});

  worksheet.addRow(headers);
  exportRows.forEach((row) => {
    worksheet.addRow(headers.map((header) => row[header] ?? ""));
  });

  await downloadWorkbook(workbook, fileName);

}
