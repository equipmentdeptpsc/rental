import type { PrefixRecord } from "@/features/settings/types";
import type { EquipmentCategory, EquipmentRecord } from "../types";

/**
 * Canonical EquipmentCategory normalization.
 *
 * PrefixRecord.category is always one of the four canonical values below
 * (enforced by prefixRepository's normalizePrefixRecord). Other parts of the
 * app — e.g. the Equipment Category master used by EquipmentForm — persist
 * shorter/legacy labels ("Moving", "Non-Moving", "Aerial") for the same
 * concepts. This is the single mapping point that reconciles both forms so
 * every consumer (preview, save, edit) agrees on the same category identity.
 */
const EQUIPMENT_CATEGORY_ALIASES: Record<string, EquipmentCategory> = {
  "moving": "Moving Equipment",
  "moving equipment": "Moving Equipment",

  "non-moving": "Non-Moving Equipment",
  "non moving": "Non-Moving Equipment",
  "non-moving equipment": "Non-Moving Equipment",
  "non moving equipment": "Non-Moving Equipment",

  "aerial": "Aerial Equipment",
  "aerial equipment": "Aerial Equipment",

  "light equipment": "Light Equipment",
};

export function normalizeEquipmentCategory(value: string | null | undefined): EquipmentCategory | null {
  if (!value) return null;
  const key = value.trim().toLowerCase().replace(/\s+/g, " ");
  return EQUIPMENT_CATEGORY_ALIASES[key] ?? null;
}

const failure = { success: false as const, code: "ASSET_PREFIX_NOT_CONFIGURED", message: "Asset number prefix is not configured for this equipment category." };
export function previewCategoryAssetNumber(category: EquipmentCategory | string | "", prefixes: PrefixRecord[], equipment: EquipmentRecord[]) {
  const normalizedCategory = normalizeEquipmentCategory(category);
  if (!normalizedCategory) return { success: false as const, code: "EQUIPMENT_CATEGORY_REQUIRED", message: "Select an equipment category to generate the asset number." };
  const matches = prefixes.filter((prefix) => prefix.active && normalizeEquipmentCategory(prefix.category) === normalizedCategory);
  if (matches.length !== 1) return failure;
  const prefix = matches[0], expression = new RegExp(`^${prefix.code.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}-(\\d+)$`, "i");
  const highest = equipment.reduce((current, item) => { const match = expression.exec(item.assetNo); return match ? Math.max(current, Number(match[1])) : current; }, 0);
  const sequence = Math.max(prefix.nextNumber, highest + 1); const assetNo = `${prefix.code}-${String(sequence).padStart(prefix.digits, "0")}`;
  if (equipment.some((item) => item.assetNo.toUpperCase() === assetNo.toUpperCase())) return { success: false as const, code: "ASSET_NUMBER_CONFLICT", message: "Generated Asset Number already exists." };
  return { success: true as const, prefixId: prefix.id, assetNo, sequence };
}

export function createEquipmentWithCategoryAssetNumber(record: EquipmentRecord, prefixes: PrefixRecord[], equipment: EquipmentRecord[], options?: { preserveAssetNumber?: boolean }) {
  if ((options?.preserveAssetNumber || record.assetNo.trim()) && record.assetNo.trim()) {
    const assetNo=record.assetNo.trim();
    if(equipment.some(item=>item.id!==record.id&&item.assetNo.trim().toLowerCase()===assetNo.toLowerCase()))return{success:false as const,code:"ASSET_NUMBER_CONFLICT",message:"Asset Number already exists."};
    return { success: true as const, record: { ...structuredClone(record), assetNo } };
  }
  const generated = previewCategoryAssetNumber(record.category, prefixes, equipment); if (!generated.success) return generated;
  return { success: true as const, record: { ...structuredClone(record), prefixId: generated.prefixId, assetNo: generated.assetNo } };
}
