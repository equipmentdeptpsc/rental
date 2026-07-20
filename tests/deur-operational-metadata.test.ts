import { describe, expect, it } from "vitest";

import { createDeurOperationalMetadataSnapshot } from "@/features/rental/deur/services/createDeurOperationalMetadataSnapshot";
import type { WorkDescriptionRecord } from "@/features/masters/work-description/types";
import type { RentalRecord } from "@/features/rental/types";

const rental = (operationalMetadata: RentalRecord["operationalMetadata"] = {
  costCode: { id: "cost-1", code: " 5031HEAVYEQPT ", name: " Heavy Equipment " },
  activityCode: { id: "activity-1", code: " LDC ", name: " LAUCHANCO DEVELOPMENT CORPORATION " },
}): RentalRecord => ({
  id: "rental-1", equipmentId: "equipment-1", customer: "Customer", project: "Project",
  rentedBy: "Admin", dateOut: "2026-02-27", statusId: "released", status: "Released",
  operationalMetadata,
});

const description = (overrides: Partial<WorkDescriptionRecord> = {}): WorkDescriptionRecord => ({
  id: "work-1", code: "MATERIAL_HAULING", name: "MATERIAL HAULING", active: true,
  deleted: false, operatorSelectable: true, requiresRemarks: false, ...overrides,
});

describe("DEUR operational metadata snapshot", () => {
  it("copies detached Rental code snapshots and the exact Work Description without a date", () => {
    const sourceRental = rental();
    const selected = description();
    const beforeRental = structuredClone(sourceRental);
    const beforeSelected = structuredClone(selected);

    const result = createDeurOperationalMetadataSnapshot({ rental: sourceRental, selectedWorkDescription: selected });

    expect(result).toEqual({
      snapshot: {
        costCode: { id: "cost-1", code: "5031HEAVYEQPT", name: "Heavy Equipment" },
        activityCode: { id: "activity-1", code: "LDC", name: "LAUCHANCO DEVELOPMENT CORPORATION" },
        workDescription: { id: "work-1", code: "MATERIAL_HAULING", name: "MATERIAL HAULING", requiresRemarks: false },
      },
      issues: [], complete: true,
    });
    expect(result.snapshot.workDescription?.name).not.toContain("2026");
    expect(result.snapshot.workDescription?.name).not.toContain("02/27/2026");
    expect(sourceRental).toEqual(beforeRental);
    expect(selected).toEqual(beforeSelected);
    sourceRental.operationalMetadata!.costCode!.name = "Changed";
    selected.name = "Changed";
    expect(result.snapshot.costCode?.name).toBe("Heavy Equipment");
    expect(result.snapshot.workDescription?.name).toBe("MATERIAL HAULING");
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });

  it("returns missing metadata issues in deterministic order without fabricating values", () => {
    const first = createDeurOperationalMetadataSnapshot({ rental: rental({}) });
    const second = createDeurOperationalMetadataSnapshot({ rental: rental({}) });
    expect(first).toEqual(second);
    expect(first.complete).toBe(false);
    expect(first.snapshot).toEqual({});
    expect(first.issues.map((issue) => issue.code)).toEqual([
      "RENTAL_COST_CODE_NOT_CAPTURED", "RENTAL_ACTIVITY_CODE_NOT_CAPTURED", "WORK_DESCRIPTION_REQUIRED",
    ]);
  });

  it.each([
    [{ active: false }, "WORK_DESCRIPTION_INACTIVE"],
    [{ deleted: true }, "WORK_DESCRIPTION_DELETED"],
    [{ operatorSelectable: false }, "WORK_DESCRIPTION_NOT_OPERATOR_SELECTABLE"],
    [{ name: "   " }, "WORK_DESCRIPTION_INVALID"],
  ] as const)("rejects unusable Work Description selections", (overrides, code) => {
    const result = createDeurOperationalMetadataSnapshot({ rental: rental(), selectedWorkDescription: description(overrides) });
    expect(result.complete).toBe(false);
    expect(result.snapshot.workDescription).toBeUndefined();
    expect(result.issues.map((issue) => issue.code)).toContain(code);
  });

  it("uses the snapshotted flag to require and trim OTHER OPERATION remarks", () => {
    const other = description({ id: "other", code: "OTHER_OPERATION", name: "OTHER OPERATION", requiresRemarks: true });
    const missing = createDeurOperationalMetadataSnapshot({ rental: rental(), selectedWorkDescription: other, remarks: "   " });
    expect(missing.issues.map((issue) => issue.code)).toContain("WORK_DESCRIPTION_REMARKS_REQUIRED");
    expect(missing.complete).toBe(false);

    const valid = createDeurOperationalMetadataSnapshot({ rental: rental(), selectedWorkDescription: other, remarks: "  slope clearing  " });
    expect(valid.snapshot.workDescription?.requiresRemarks).toBe(true);
    expect(valid.remarks).toBe("slope clearing");
    expect(valid.complete).toBe(true);
    expect(createDeurOperationalMetadataSnapshot({ rental: rental(), selectedWorkDescription: description() }).complete).toBe(true);
  });

  it("safely omits malformed Rental snapshots", () => {
    const malformed = rental({ costCode: { code: "", name: "bad" }, activityCode: { code: "LDC", name: "" } });
    expect(createDeurOperationalMetadataSnapshot({ rental: malformed, selectedWorkDescription: description() }).issues.map(i => i.code)).toEqual([
      "RENTAL_COST_CODE_NOT_CAPTURED", "RENTAL_ACTIVITY_CODE_NOT_CAPTURED",
    ]);
  });
});
