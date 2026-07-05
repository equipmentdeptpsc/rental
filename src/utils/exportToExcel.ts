import { utils, writeFile } from "xlsx";

export function exportToExcel<T>(
  rows: T[],
  fileName: string
) {
  if (!rows.length) {
    alert("No data to export.");
    return;
  }

  const worksheet =
    utils.json_to_sheet(rows);

  const workbook =
    utils.book_new();

  utils.book_append_sheet(
    workbook,
    worksheet,
    "Data"
  );

  writeFile(
    workbook,
    `${fileName}.xlsx`
  );
}