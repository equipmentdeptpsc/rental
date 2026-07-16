import { beforeEach, describe, expect, it } from "vitest";
import { storage } from "@/core/storage";
import { EquipmentCategoryRepository } from "@/features/masters/equipment-category/repository/EquipmentCategoryRepository";

describe("equipment category defaults", () => {
  beforeEach(() => storage.remove("equipment-category-master"));
  it("seeds once and preserves existing categories", () => {
    const repository = new EquipmentCategoryRepository();
    expect(repository.seedDefaults().map(x => x.category)).toEqual(["Moving", "Non-moving", "Aerial", "Light Equipment"]);
    expect(repository.seedDefaults()).toHaveLength(4);
    repository.saveAll([{ id: "custom", category: "Custom", description: "", active: true, deleted: false }]);
    expect(repository.seedDefaults().map(x => x.category)).toEqual(["Custom"]);
  });
});
