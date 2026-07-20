import { beforeEach, describe, expect, it } from "vitest";

import { storage } from "@/core/storage";
import { costCodeRepository } from "@/features/masters/cost-code/repository";

const STORAGE_KEY = "equipment-rental-cost-codes";

describe("cost code classification defaults", () => {
  beforeEach(() => storage.remove(STORAGE_KEY));

  it("seeds the required heavy and light equipment cost codes", () => {
    const records = costCodeRepository.getAll();

    expect(records).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "5031HEAVYEQPT",
        description: "Heavy Equipment",
        equipmentClassification: "Heavy",
        active: true,
      }),
      expect.objectContaining({
        code: "5031LIGHTEQPT",
        description: "Light Equipment",
        equipmentClassification: "Light",
        active: true,
      }),
    ]));
  });

  it("adds missing required seeds without replacing or duplicating stored records", () => {
    storage.set(STORAGE_KEY, [{
      id: "custom-cost-code",
      code: "CUSTOM",
      description: "Custom cost code",
      defaultRate: 25,
      unit: "Hour",
      active: true,
      deleted: false,
    }]);

    const firstRead = costCodeRepository.getAll();
    const secondRead = costCodeRepository.getAll();

    expect(firstRead.some((record) => record.id === "custom-cost-code")).toBe(true);
    expect(secondRead.filter((record) => record.code === "5031HEAVYEQPT")).toHaveLength(1);
    expect(secondRead.filter((record) => record.code === "5031LIGHTEQPT")).toHaveLength(1);
  });
});
