import type { EquipmentSubcategoryRecord } from "@/features/masters/equipment-subcategory/types";

export function retainCompatibleSubcategory(categoryId: string, subcategoryId: string | undefined, subcategories: readonly EquipmentSubcategoryRecord[]): string {
  return subcategories.some((item) => item.id === subcategoryId && item.categoryId === categoryId && item.active) ? subcategoryId ?? "" : "";
}
