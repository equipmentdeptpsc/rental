import { describe, expect, it } from "vitest";
import { filterCanonicalEquipment, toCanonicalEquipmentQueryFilters } from "@/features/equipment/services/filterCanonicalEquipment";

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

  it("maps remote filters to canonical identifier predicates", () => {
    expect(toCanonicalEquipmentQueryFilters({ categoryId: "cat-1", subcategoryId: "sub-1", statusId: "status-1", projectId: "project-1" })).toEqual({ category_id: "cat-1", subcategory_id: "sub-1", status_id: "status-1", project_id: "project-1" });
    expect(toCanonicalEquipmentQueryFilters({ categoryId: "", subcategoryId: "", statusId: "", projectId: "" })).toEqual({ category_id: undefined, subcategory_id: undefined, status_id: undefined, project_id: undefined });
  });
});
