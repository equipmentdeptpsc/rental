import ExcelJS from "exceljs";

import { downloadWorkbook } from "./excelWorkbook";

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

export async function generateTemplate(

  columns: TemplateColumn[],

  options: TemplateOptions

): Promise<void> {

  const workbook = new ExcelJS.Workbook();

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

  const templateSheet = workbook.addWorksheet(sheetName);
  templateSheet.addRows(templateRows);

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

    const dictionarySheet = workbook.addWorksheet("Data Dictionary");
    dictionarySheet.addRows(dictionaryRows);

  }

  await downloadWorkbook(workbook, options.fileName);

}
