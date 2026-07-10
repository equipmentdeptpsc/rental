import * as XLSX from "xlsx";

export interface ExportOptions<T> {

  /**
   * Worksheet name
   */

  sheetName?: string;

  /**
   * Export filename
   */

  fileName: string;

  /**
   * Optional column mapping.
   *
   * Example:
   *
   * {
   *   activityCode: "Activity Code",
   *   description: "Description"
   * }
   */

  columns?: Partial<
    Record<
      keyof T,
      string
    >
  >;

}

export function exportToExcel<T extends Record<string, unknown>>(

  records: T[],

  options: ExportOptions<T>

): void {

  const {

    fileName,

    sheetName = "Sheet1",

    columns,

  } = options;

  /**
   * Nothing to export.
   */

  if (

    records.length === 0

  ) {

    alert(

      "There is no data to export."

    );

    return;

  }

  let exportRows: Record<string, unknown>[] =
    [];

  /**
   * Column mapping
   */

  if (

    columns

  ) {

    exportRows =

      records.map(

        record => {

          const row:
            Record<string, unknown> =
            {};

          Object.entries(

            columns

          ).forEach(

            ([

              key,

              label,

            ]) => {

              row[
                label ??
                key
              ] =
                record[
                  key
                ];

            }

          );

          return row;

        }

      );

  }

  else {

    exportRows =

      records as Record<
        string,
        unknown
      >[];

  }

  const worksheet =
    XLSX.utils.json_to_sheet(

      exportRows

    );

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