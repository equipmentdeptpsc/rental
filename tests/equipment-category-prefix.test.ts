import { beforeEach, describe, expect, it } from "vitest";
import { storage } from "@/core/storage";
import { PrefixRepository } from "@/features/settings/repository/prefixRepository";
import { previewCategoryAssetNumber, createEquipmentWithCategoryAssetNumber } from "@/features/equipment/services/categoryAssetNumber";
import type { EquipmentRecord } from "@/features/equipment/types";

const equipment = (assetNo: string, category: EquipmentRecord["category"]): EquipmentRecord => ({ id: assetNo, prefixId: "prefix", assetNo, equipmentName: "Machine", category, maintenanceType: "Engine Hours", currentReading: 0, projectId: "", operatorId: "", status: "Available" });

describe("category Equipment Asset Number rules", () => {
  beforeEach(() => storage.clear());
  it("uses configured category prefixes with independent collision-free sequences", () => {
    const prefixes = new PrefixRepository().getAll();
    expect(previewCategoryAssetNumber("Moving Equipment", prefixes, [])).toMatchObject({ success: true, assetNo: "ME-000001" });
    expect(previewCategoryAssetNumber("Light Equipment", prefixes, [])).toMatchObject({ success: true, assetNo: "LE-000001" });
    expect(previewCategoryAssetNumber("Moving Equipment", prefixes, [equipment("ME-000001", "Moving Equipment"), equipment("ME-000003", "Moving Equipment"), equipment("LE-000009", "Light Equipment")])).toMatchObject({ success: true, assetNo: "ME-000004" });
  });
  it("blocks missing configuration and duplicate final numbers", () => {
    expect(previewCategoryAssetNumber("Moving Equipment", [], [])).toMatchObject({ success: false, message: "Asset number prefix is not configured for this equipment category." });
    const prefix = new PrefixRepository().getAll().filter((item) => item.category === "Moving Equipment");
    const candidate = equipment("", "Moving Equipment");
    expect(createEquipmentWithCategoryAssetNumber(candidate, prefix, [equipment("ME-000001", "Moving Equipment")])).toMatchObject({ success: true, record: { assetNo: "ME-000002" } });
    const duplicated = createEquipmentWithCategoryAssetNumber(candidate, [{ ...prefix[0], nextNumber: 1 }], [equipment("ME-000001", "Moving Equipment"), equipment("ME-000002", "Moving Equipment")]);
    expect(duplicated).toMatchObject({ success: true, record: { assetNo: "ME-000003" } });
  });
  it("preserves an existing asset number during edit-style normalization", () => {
    const existing = equipment("LEGACY-77", "Moving Equipment");
    expect(createEquipmentWithCategoryAssetNumber(existing, new PrefixRepository().getAll(), [], { preserveAssetNumber: true })).toMatchObject({ success: true, record: { assetNo: "LEGACY-77" } });
  });
});

describe("Prefix Master persistence and validation", () => {
  beforeEach(() => storage.clear());
  it("seeds stable category assignments once and persists a valid replacement", () => {
    const repository = new PrefixRepository();
    expect(repository.getAll().map((item) => [item.category, item.code])).toEqual([["Moving Equipment", "ME"], ["Non-Moving Equipment", "NME"], ["Aerial Equipment", "AE"], ["Light Equipment", "LE"]]);
    expect(new PrefixRepository().getAll()).toHaveLength(4);
    const current = repository.getAll().find((item) => item.category === "Moving Equipment")!;
    expect(repository.update({ ...current, code: "MV" })).toMatchObject({ success: true });
    expect(new PrefixRepository().getAll()).toContainEqual(expect.objectContaining({ category: "Moving Equipment", code: "MV" }));
  });
  it("rejects duplicate category, duplicate code, blank, and malformed prefixes", () => {
    const repository = new PrefixRepository(), records = repository.getAll();
    expect(repository.create({ id: "duplicate-category", category: "Moving Equipment", code: "MX", description: "Duplicate", nextNumber: 1, digits: 6, active: true })).toMatchObject({ success: false, code: "PREFIX_CATEGORY_CONFLICT" });
    expect(repository.create({ id: "duplicate-code", category: "Light Equipment", code: "ME", description: "Duplicate", nextNumber: 1, digits: 6, active: false })).toMatchObject({ success: false, code: "PREFIX_CODE_CONFLICT" });
    expect(repository.create({ ...records[0], id: "blank", category: "Aerial Equipment", code: " " })).toMatchObject({ success: false, code: "PREFIX_CODE_INVALID" });
    expect(repository.create({ ...records[0], id: "bad", category: "Aerial Equipment", code: "M-E" })).toMatchObject({ success: false, code: "PREFIX_CODE_INVALID" });
  });
});
