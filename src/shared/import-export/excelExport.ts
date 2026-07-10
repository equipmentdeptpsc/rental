import * as XLSX from "xlsx";

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

export function exportToExcel<T>(

  records: T[],

  options: ExportOptions<T>

): void {

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

  const worksheet =
    XLSX.utils.json_to_sheet(exportRows);

  const workbook =
    XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(

    workbook,

    worksheet,

    sheetName

  );

  XLSX.writeFile(

    workbook,

    `${fileName}.xlsx`

  );

}