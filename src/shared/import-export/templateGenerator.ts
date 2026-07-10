import * as XLSX from "xlsx";

export interface TemplateColumn {

  /**
   * Excel column header
   */

  header: string;

  /**
   * Sample value shown
   */

  sample?: string | number | boolean;

  /**
   * Description shown in the
   * Data Dictionary sheet.
   */

  description?: string;

  /**
   * Whether the field is required.
   */

  required?: boolean;

}

export interface TemplateOptions {

  fileName: string;

  sheetName?: string;

  includeDataDictionary?: boolean;

}

export function generateTemplate(

  columns: TemplateColumn[],

  options: TemplateOptions

): void {

  const workbook = XLSX.utils.book_new();

  const sheetName =

    options.sheetName ??

    "Template";

  /**
   * Template sheet
   */

  const templateRows = [

    columns.map(

      column => column.header

    ),

    columns.map(

      column =>

        column.sample ?? ""

    ),

  ];

  const templateSheet =

    XLSX.utils.aoa_to_sheet(

      templateRows

    );

  XLSX.utils.book_append_sheet(

    workbook,

    templateSheet,

    sheetName

  );

  /**
   * Optional Data Dictionary
   */

  if (

    options.includeDataDictionary !==

    false

  ) {

    const dictionaryRows = [

      [

        "Column",

        "Required",

        "Description",

      ],

    ];

    columns.forEach(

      column => {

        dictionaryRows.push([

          column.header,

          column.required

            ? "YES"

            : "NO",

          column.description ??

            "",

        ]);

      }

    );

    const dictionarySheet =

      XLSX.utils.aoa_to_sheet(

        dictionaryRows

      );

    XLSX.utils.book_append_sheet(

      workbook,

      dictionarySheet,

      "Data Dictionary"

    );

  }

  XLSX.writeFile(

    workbook,

    `${options.fileName}.xlsx`

  );

}