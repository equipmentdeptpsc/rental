import { describe, expect, it } from "vitest";

import {
  getActiveCostCodeOptions,
  getEquipmentCostCodeDisplay,
} from "@/features/equipment/utils/equipmentCostCode";
import type { CostCodeRecord } from "@/features/masters/cost-code";

const costCode = (
  id: string,
  code: string,
  description: string,
  active = true,
  deleted = false,
): CostCodeRecord => ({
  id,
  code,
  description,
  defaultRate: 0,
  unit: "Hour",
  active,
  deleted,
});

describe("Equipment Cost Code presentation", () => {
  const records = [
    costCode("heavy", "5031HEAVYEQPT", "Heavy Equipment"),
    costCode("light", "5031LIGHTEQPT", "Light Equipment"),
    costCode("inactive", "INACTIVE", "Inactive", false),
    costCode("deleted", "DELETED", "Deleted", true, true),
  ];

  it("builds dropdown options from active, non-deleted Cost Codes only", () => {
    expect(getActiveCostCodeOptions(records)).toEqual([
      { value: "heavy", label: "5031HEAVYEQPT — Heavy Equipment" },
      { value: "light", label: "5031LIGHTEQPT — Light Equipment" },
    ]);
  });

  it("resolves configured detail text and warns when configuration is missing", () => {
    expect(getEquipmentCostCodeDisplay("heavy", records)).toEqual({
      configured: true,
      code: "5031HEAVYEQPT",
      name: "Heavy Equipment",
    });
    expect(getEquipmentCostCodeDisplay(undefined, records)).toEqual({
      configured: false,
      warning: "Cost Code not configured",
    });
    expect(getEquipmentCostCodeDisplay("unknown", records)).toEqual({
      configured: false,
      warning: "Cost Code not configured",
    });
  });
});
