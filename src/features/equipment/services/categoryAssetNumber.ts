import type { PrefixRecord } from "@/features/settings/types";
import type { EquipmentCategory, EquipmentRecord } from "../types";

const failure = { success: false as const, code: "ASSET_PREFIX_NOT_CONFIGURED", message: "Asset number prefix is not configured for this equipment category." };
export function previewCategoryAssetNumber(category: EquipmentCategory | "", prefixes: PrefixRecord[], equipment: EquipmentRecord[]) {
  if (!category) return { success: false as const, code: "EQUIPMENT_CATEGORY_REQUIRED", message: "Select an equipment category to generate the asset number." };
  const matches = prefixes.filter((prefix) => prefix.active && prefix.category === category);
  if (matches.length !== 1) return failure;
  const prefix = matches[0], expression = new RegExp(`^${prefix.code.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}-(\\d+)$`, "i");
  const highest = equipment.reduce((current, item) => { const match = expression.exec(item.assetNo); return match ? Math.max(current, Number(match[1])) : current; }, 0);
  const sequence = Math.max(prefix.nextNumber, highest + 1); const assetNo = `${prefix.code}-${String(sequence).padStart(prefix.digits, "0")}`;
  if (equipment.some((item) => item.assetNo.toUpperCase() === assetNo.toUpperCase())) return { success: false as const, code: "ASSET_NUMBER_CONFLICT", message: "Generated Asset Number already exists." };
  return { success: true as const, prefixId: prefix.id, assetNo, sequence };
}
export function createEquipmentWithCategoryAssetNumber(record: EquipmentRecord, prefixes: PrefixRecord[], equipment: EquipmentRecord[], options?: { preserveAssetNumber?: boolean }) {
  if (options?.preserveAssetNumber && record.assetNo.trim()) return { success: true as const, record: structuredClone(record) };
  const generated = previewCategoryAssetNumber(record.category, prefixes, equipment); if (!generated.success) return generated;
  return { success: true as const, record: { ...structuredClone(record), prefixId: generated.prefixId, assetNo: generated.assetNo } };
}
