import { beforeEach, describe, expect, it } from "vitest";

import { storage } from "@/core/storage";
import {
  WORK_DESCRIPTION_SEEDS,
  WorkDescriptionRepository,
} from "@/features/masters/work-description/repository";
import type { WorkDescriptionRecord } from "@/features/masters/work-description/types";

const STORAGE_KEY = "equipment-rental-work-descriptions";
const expectedNames = [
  "MATERIAL HAULING",
  "EXCAVATION",
  "LOADING / UNLOADING",
  "GRADING / LEVELLING",
  "BACKFILLING",
  "LIFTING / MATERIAL HANDLING",
  "SITE CLEARING",
  "OTHER OPERATION",
];

const custom = (overrides: Partial<WorkDescriptionRecord> = {}): WorkDescriptionRecord => ({
  id: "custom",
  code: "CUSTOM_WORK",
  name: "CUSTOM WORK",
  active: true,
  deleted: false,
  operatorSelectable: true,
  requiresRemarks: false,
  ...overrides,
});

describe("Work Description master repository", () => {
  beforeEach(() => storage.remove(STORAGE_KEY));

  it("seeds the exact compact list in deterministic order with stable IDs", () => {
    const records = new WorkDescriptionRepository().getAll();
    expect(records.map((record) => record.name)).toEqual(expectedNames);
    expect(records.map((record) => record.id)).toEqual(WORK_DESCRIPTION_SEEDS.map((record) => record.id));
    expect(records.map((record) => record.sortOrder)).toEqual([10, 20, 30, 40, 50, 60, 70, 80]);
  });

  it("seeds only operator-selectable work descriptions and only OTHER OPERATION requires remarks", () => {
    const records = new WorkDescriptionRepository().getAll();
    expect(records.every((record) => record.active && !record.deleted && record.operatorSelectable)).toBe(true);
    expect(records.filter((record) => record.requiresRemarks).map((record) => record.name))
      .toEqual(["OTHER OPERATION"]);
  });

  it("does not seed dates, date prefixes, or timer states", () => {
    const names = new WorkDescriptionRepository().getAll().map((record) => record.name);
    expect(names.every((name) => !/\d{1,4}[/-]\d{1,2}[/-]\d{1,4}/.test(name))).toBe(true);
    expect(names).not.toEqual(expect.arrayContaining(["Operation", "Standby", "Meal Break", "Breakdown", "End Shift"]));
  });

  it("is idempotent and preserves stable seed IDs", () => {
    const repository = new WorkDescriptionRepository();
    const first = repository.getAll();
    const second = repository.getAll();
    expect(second).toHaveLength(8);
    expect(second.map((record) => record.id)).toEqual(first.map((record) => record.id));
  });

  it("preserves normalized matching legacy records without reactivating or restoring them", () => {
    storage.set(STORAGE_KEY, [
      custom({
        id: "legacy-material",
        code: "legacy-code",
        name: "  material   hauling ",
        active: false,
        deleted: true,
        operatorSelectable: undefined,
        requiresRemarks: undefined,
      }),
    ]);
    const records = new WorkDescriptionRepository().getAll();
    const matching = records.filter((record) => record.name.trim().replace(/\s+/g, " ").toUpperCase() === "MATERIAL HAULING");
    expect(matching).toHaveLength(1);
    expect(matching[0]).toMatchObject({ id: "legacy-material", active: false, deleted: true });
  });

  it("preserves unrelated custom records and legacy optional metadata", () => {
    storage.set(STORAGE_KEY, [custom({ operatorSelectable: undefined, requiresRemarks: undefined })]);
    const records = new WorkDescriptionRepository().getAll();
    expect(records.find((record) => record.id === "custom")).toMatchObject({
      code: "CUSTOM_WORK",
      name: "CUSTOM WORK",
    });
    expect(records.find((record) => record.id === "custom")?.sortOrder).toBeUndefined();
  });

  it("recovers required seeds without crashing on malformed legacy values", () => {
    storage.set(STORAGE_KEY, [{ id: "malformed", active: true }]);
    expect(() => new WorkDescriptionRepository().getAll()).not.toThrow();
    expect(new WorkDescriptionRepository().getAll().map((record) => record.name))
      .toEqual(expect.arrayContaining(expectedNames));
  });

  it("trims values, normalizes category references, and serializes mappings", () => {
    const repository = new WorkDescriptionRepository();
    const result = repository.create(custom({
      id: "mapped",
      code: " mapped_code ",
      name: " Mapped Work ",
      applicableEquipmentCategoryIds: [" category-1 ", "category-1", "", "category-2"],
    }));
    expect(result).toMatchObject({ success: true, record: expect.objectContaining({
      code: "mapped_code",
      name: "Mapped Work",
      applicableEquipmentCategoryIds: ["category-1", "category-2"],
    }) });
    expect(new WorkDescriptionRepository().getById("mapped")?.applicableEquipmentCategoryIds)
      .toEqual(["category-1", "category-2"]);
  });

  it("rejects duplicate normalized names and codes", () => {
    const repository = new WorkDescriptionRepository();
    expect(repository.create(custom({ id: "duplicate-name", code: "NEW", name: " material   hauling " })))
      .toEqual({ success: false, message: "Work Description already exists." });
    expect(repository.create(custom({ id: "duplicate-code", code: " excavation ", name: "Different" })))
      .toEqual({ success: false, message: "Work Description already exists." });
  });

  it("returns detached reads and detached mutation results", () => {
    const repository = new WorkDescriptionRepository();
    const result = repository.create(custom({ id: "detached" }));
    expect(result.success).toBe(true);
    if (!result.success) return;
    result.record.name = "MUTATED";
    const all = repository.getAll();
    all.find((record) => record.id === "detached")!.name = "MUTATED AGAIN";
    expect(repository.getById("detached")?.name).toBe("CUSTOM WORK");
  });
});
