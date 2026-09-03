import { describe, expect, it } from "vitest";
import { filterCanonicalEquipment } from "@/features/equipment/services/filterCanonicalEquipment";

const items = [
  { id: "1", assetNo: "A-1", equipmentName: "Excavator", category: "Heavy", statusLabel: "Available", active: true, deleted: false },
  { id: "2", assetNo: "A-2", equipmentName: "Generator", category: "Power", statusLabel: "Maintenance", active: true, deleted: false },
] as const;

describe("canonical equipment filters", () => {
  it("filters by search, category, and status and supports filtered-empty", () => {
    expect(filterCanonicalEquipment(items, { query: "excavator", category: "", status: "" })).toHaveLength(1);
    expect(filterCanonicalEquipment(items, { query: "", category: "Power", status: "" })[0].id).toBe("2");
    expect(filterCanonicalEquipment(items, { query: "", category: "", status: "Available" })[0].id).toBe("1");
    expect(filterCanonicalEquipment(items, { query: "missing", category: "", status: "" })).toHaveLength(0);
  });
});
