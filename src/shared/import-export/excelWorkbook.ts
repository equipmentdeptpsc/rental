import ExcelJS from "exceljs";

const XLSX_MIME_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export async function downloadWorkbook(
  workbook: ExcelJS.Workbook,
  fileName: string
): Promise<void> {
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob(
    [buffer as unknown as BlobPart],
    { type: XLSX_MIME_TYPE }
  );
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = `${fileName}.xlsx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function getWorksheetRecords<T>(
  worksheet: ExcelJS.Worksheet
): T[] {
  const headerRow = worksheet.getRow(1);
  const headers: string[] = [];

  headerRow.eachCell({ includeEmpty: true }, (cell, columnNumber) => {
    headers[columnNumber - 1] = cell.text.trim();
  });

  if (headers.length === 0 || headers.every((header) => !header)) {
    throw new Error("Worksheet contains no header row.");
  }

  const records: T[] = [];
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;

    const record: Record<string, unknown> = {};
    let hasValues = false;

    row.eachCell({ includeEmpty: true }, (cell, columnNumber) => {
      if (cell.formula || cell.hyperlink) {
        throw new Error(
          "Workbook formulas and external links are not supported."
        );
      }

      const header = headers[columnNumber - 1];
      if (!header) return;

      const value = cell.value ?? "";
      record[header] = value;
      hasValues ||= value !== "";
    });

    if (hasValues) {
      records.push(record as T);
    }
  });

  return records;
}

export function getWorksheetHeaders(
  worksheet: ExcelJS.Worksheet
): string[] {
  const headers: string[] = [];
  worksheet.getRow(1).eachCell({ includeEmpty: true }, (cell, columnNumber) => {
    headers[columnNumber - 1] = cell.text.trim();
  });
  return headers;
}
