import * as XLSX from "xlsx";

export interface ImportResult<T> {

  success: boolean;

  records: T[];

  errors: string[];

}

export async function importExcel<T>(

  file: File

): Promise<ImportResult<T>> {

  try {

    const buffer =
      await file.arrayBuffer();

    const workbook =
      XLSX.read(
        buffer,
        {
          type: "array",
        }
      );

    const sheetName =
      workbook.SheetNames[0];

    if (!sheetName) {

      return {

        success: false,

        records: [],

        errors: [

          "Workbook contains no worksheets.",

        ],

      };

    }

    const worksheet =
      workbook.Sheets[
        sheetName
      ];

    const rows =
      XLSX.utils.sheet_to_json<T>(
        worksheet,
        {
          defval: "",
        }
      );

    return {

      success: true,

      records: rows,

      errors: [],

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

    };

  }

}