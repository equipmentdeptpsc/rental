import { describe, expect, it } from "vitest";
import { validateImportedData } from "@/shared/import-export/importValidation";

const columns = [{ field: "code" as const, header: "Code", required: true }];

describe("import validation", () => {
  it("blocks missing headers and invalid rows with spreadsheet row numbers", () => {
    const outcome = validateImportedData(
      { success: true, headers: ["Name"], records: [{ code: "" }], errors: [] },
      columns,
      () => ["Code is required."]
    );
    expect(outcome.canConfirm).toBe(false);
    expect(outcome.blockingErrors.join(" ")).toContain("Missing required column");
    expect(outcome.rowErrors).toEqual([{ row: 2, message: "Code is required." }]);
  });

  it("keeps parser failures distinct and accepts valid populated data", () => {
    expect(validateImportedData({ success: false, headers: [], records: [], errors: ["Workbook cannot be parsed."] }, columns).blockingErrors)
      .toEqual(["Workbook cannot be parsed."]);
    expect(validateImportedData({ success: true, headers: ["Code"], records: [{ code: "A" }], errors: [] }, columns).canConfirm)
      .toBe(true);
  });
});
