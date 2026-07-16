import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import { importExcel } from "@/shared/import-export/excelImport";
import {
  DEFAULT_MAX_FILE_SIZE,
  validateImportFile,
} from "@/shared/import-export/fileValidation";

function file(name: string, content: BlobPart[], type: string): File {
  return new File(content, name, { type });
}

async function workbookFile(
  configure: (worksheet: ExcelJS.Worksheet) => void
): Promise<File> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Data");
  configure(worksheet);
  const buffer = await workbook.xlsx.writeBuffer();

  return file(
    "data.xlsx",
    [buffer as unknown as BlobPart],
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
}

describe("spreadsheet import security", () => {
  it("accepts a valid spreadsheet file", async () => {
    const input = await workbookFile((worksheet) => {
      worksheet.addRow(["Code", "Name"]);
      worksheet.addRow(["EQ-1", "Excavator"]);
    });

    await expect(importExcel<{ Code: string; Name: string }>(input))
      .resolves.toEqual({
        success: true,
        records: [{ Code: "EQ-1", Name: "Excavator" }],
        errors: [],
        headers: ["Code", "Name"],
      });
  });

  it("rejects invalid extensions, MIME types, and oversized files", () => {
    expect(validateImportFile(file("data.xlsm", ["x"], "application/vnd.ms-excel")))
      .toMatchObject({ valid: false });
    expect(validateImportFile(file("data.xlsx", ["x"], "application/pdf")))
      .toMatchObject({ valid: false });
    expect(validateImportFile(file(
      "large.xlsx",
      [new Uint8Array(DEFAULT_MAX_FILE_SIZE + 1)],
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    ))).toMatchObject({ valid: false });
  });

  it("handles malformed workbooks and rejects formulas without crashing", async () => {
    const malformed = file(
      "broken.xlsx",
      ["not a workbook"],
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    const formulaWorkbook = await workbookFile((worksheet) => {
      worksheet.addRow(["Code"]);
      worksheet.getCell("A2").value = { formula: "1+1" };
    });

    await expect(importExcel(malformed)).resolves.toMatchObject({ success: false });
    await expect(importExcel(formulaWorkbook)).resolves.toMatchObject({
      success: false,
      records: [],
    });
  });
});
