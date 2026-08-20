import { beforeEach, describe, expect, it } from "vitest";
import { storage } from "@/core/storage";
import { PrefixRepository } from "@/features/settings/repository/prefixRepository";
import { previewCategoryAssetNumber, createEquipmentWithCategoryAssetNumber } from "@/features/equipment/services/categoryAssetNumber";
import { buildManualEquipmentRecord } from "@/features/equipment/services/manualEquipmentRegistration";
import { createInlineMasterValue } from "@/features/equipment/services/inlineEquipmentMaster";
import { retainCompatibleSubcategory } from "@/features/equipment/services/equipmentCategorySelection";
import { validateDuplicateEquipment } from "@/features/equipment/utils/duplicateValidator";
import type { EquipmentFormData, EquipmentRecord } from "@/features/equipment/types";

const form = (overrides: Partial<EquipmentFormData> = {}): EquipmentFormData => ({ prefixId: "prefix", assetNo: "USER-CANNOT-KEEP", equipmentName: " EXC-OPS-01 ", category: "Moving Equipment", categoryId: "moving", subcategoryId: "excavator", subcategoryName: "Excavator", manufacturer: "", model: "", serialNumber: "", engineNumber: "", chassisNumber: "", plateNumber: "", yearModel: "", capacity: "", maintenanceType: "Engine Hours", currentReading: "", projectId: "", operatorId: "", ...overrides });
const equipment = (id: string, assetNo: string, equipmentName = id, category: EquipmentRecord["category"] = "Moving Equipment"): EquipmentRecord => ({ id, prefixId: "prefix", assetNo, equipmentName, category, maintenanceType: "Engine Hours", currentReading: 0, projectId: "", operatorId: "", status: "Available" });

describe("Milestone 3 Equipment creation rules", () => {
  beforeEach(() => storage.clear());
  it("keeps the user-entered Equipment Code and defaults manual status without condition", () => {
    const created = buildManualEquipmentRecord(form(), "equipment-1");
    expect(created).toMatchObject({ equipmentName: "EXC-OPS-01", status: "Available" });
    expect(created).not.toHaveProperty("condition");
    expect(created).not.toHaveProperty("conditionId");
  });

  it("requires a unique Equipment Code case-insensitively", () => {
    expect(validateDuplicateEquipment([], { ...equipment("new", ""), equipmentName: " " })).toMatchObject({ valid: false, message: "Equipment Code is required." });
    expect(validateDuplicateEquipment([equipment("old", "ME-000001", "EXC-OPS-01")], equipment("new", "ME-000002", " exc-ops-01 "))).toMatchObject({ valid: false, message: "Equipment Code already exists." });
  });

  it("generates independent category prefixes and sequential numbers", () => {
    const prefixes = new PrefixRepository().getAll();
    const existing = [equipment("one", "ME-000001"), equipment("two", "ME-000002"), equipment("light", "LE-000008", "LIGHT-8", "Light Equipment")];
    expect(previewCategoryAssetNumber("Moving Equipment", prefixes, existing)).toMatchObject({ success: true, assetNo: "ME-000003" });
    expect(previewCategoryAssetNumber("Light Equipment", prefixes, existing)).toMatchObject({ success: true, assetNo: "LE-000009" });
  });

  it("ignores a supplied create-time Asset Number but preserves edit identity and status", () => {
    const prefixes = new PrefixRepository().getAll();
    const manual = buildManualEquipmentRecord(form(), "new");
    expect(createEquipmentWithCategoryAssetNumber({ ...manual, assetNo: "" }, prefixes, [])).toMatchObject({ success: true, record: { assetNo: "ME-000001", status: "Available" } });
    const existing = { ...equipment("legacy", "LEGACY-77"), status: "Rented" as const };
    expect(createEquipmentWithCategoryAssetNumber(existing, prefixes, [], { preserveAssetNumber: true })).toMatchObject({ success: true, record: { assetNo: "LEGACY-77", status: "Rented" } });
  });

  it("invalidates a cross-category sub-category and retains a compatible one", () => {
    const records = [{ id: "excavator", categoryId: "moving", name: "Excavator", code: "EXC", active: true, createdAt: "", updatedAt: "" }, { id: "generator", categoryId: "non-moving", name: "Generator", code: "GEN", active: true, createdAt: "", updatedAt: "" }];
    expect(retainCompatibleSubcategory("moving", "excavator", records)).toBe("excavator");
    expect(retainCompatibleSubcategory("non-moving", "excavator", records)).toBe("");
  });

  it("normalizes inline masters and rejects blank or duplicate values", () => {
    expect(createInlineMasterValue("  PSC   Yard  ", [], "location")).toMatchObject({ success: true, value: "PSC Yard" });
    expect(createInlineMasterValue("   ", [], "location")).toMatchObject({ success: false, message: "location is required." });
    expect(createInlineMasterValue("caterpillar", ["Caterpillar"], "brand")).toMatchObject({ success: false, message: "brand already exists." });
  });
});
