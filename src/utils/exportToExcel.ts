import ExcelJS from "exceljs";

import { downloadWorkbook } from "@/shared/import-export/excelWorkbook";

export async function exportToExcel<T>(
  rows: T[],
  fileName: string
) {
  if (!rows.length) {
    alert("No data to export.");
    return;
  }

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Data");
  const firstRow = rows[0] as Record<string, unknown>;
  const headers = Object.keys(firstRow);

  worksheet.addRow(headers);
  rows.forEach((row) => {
    const source = row as Record<string, unknown>;
    worksheet.addRow(headers.map((header) => source[header] ?? ""));
  });

  await downloadWorkbook(workbook, fileName);
}
