import { describe, expect, it } from "vitest";

import { getSelectableWorkDescriptions } from "@/features/masters/work-description/services/getSelectableWorkDescriptions";
import type { WorkDescriptionRecord } from "@/features/masters/work-description/types";

const work = (id: string, overrides: Partial<WorkDescriptionRecord> = {}): WorkDescriptionRecord => ({
  id,
  code: id.toUpperCase(),
  name: `Work ${id}`,
  active: true,
  deleted: false,
  operatorSelectable: true,
  requiresRemarks: false,
  sortOrder: 10,
  ...overrides,
});

describe("selectable Work Descriptions", () => {
  it("excludes inactive, deleted, and non-operator-selectable records", () => {
    const result = getSelectableWorkDescriptions({ workDescriptions: [
      work("active"),
      work("inactive", { active: false }),
      work("deleted", { deleted: true }),
      work("admin", { operatorSelectable: false }),
    ] });
    expect(result.map((record) => record.id)).toEqual(["active"]);
  });

  it("includes general and matching mappings while excluding other categories", () => {
    const result = getSelectableWorkDescriptions({
      workDescriptions: [
        work("general", { applicableEquipmentCategoryIds: [] }),
        work("matching", { applicableEquipmentCategoryIds: ["category-a"] }),
        work("other", { applicableEquipmentCategoryIds: ["category-b"] }),
      ],
      equipmentCategoryId: "category-a",
    });
    expect(result.map((record) => record.id)).toEqual(["general", "matching"]);
  });

  it("falls back to the usable full list when category cannot be resolved", () => {
    const records = [
      work("general"),
      work("mapped-a", { applicableEquipmentCategoryIds: ["category-a"] }),
      work("mapped-b", { applicableEquipmentCategoryIds: ["category-b"] }),
    ];
    expect(getSelectableWorkDescriptions({ workDescriptions: records }).map((record) => record.id))
      .toEqual(["general", "mapped-a", "mapped-b"]);
  });

  it("keeps the full list when no mappings exist", () => {
    const records = [work("two", { sortOrder: 20 }), work("one", { sortOrder: 10 })];
    expect(getSelectableWorkDescriptions({ workDescriptions: records, equipmentCategoryId: "unknown" }).map((record) => record.id))
      .toEqual(["one", "two"]);
  });

  it("is deterministic, detached, and does not mutate inputs", () => {
    const records = [work("later", { sortOrder: 20 }), work("first", { sortOrder: 10 })];
    const original = structuredClone(records);
    const result = getSelectableWorkDescriptions({ workDescriptions: records });
    result[0].name = "MUTATED";
    expect(records).toEqual(original);
    expect(result.map((record) => record.id)).toEqual(["first", "later"]);
  });
});
