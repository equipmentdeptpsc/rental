import { createLegacyLocalRepositoryStorage } from "@/core/persistence";
import type { EquipmentSubcategoryRecord } from "./types";
const persistence = createLegacyLocalRepositoryStorage("EquipmentSubcategory");
const clone = <T>(value: T): T => structuredClone(value);

export class EquipmentSubcategoryRepository {
  getAll() { const value = persistence.load<unknown>(); return clone(Array.isArray(value) ? value as EquipmentSubcategoryRecord[] : []); }
  getById(id: string) { return this.getAll().find(record => record.id === id); }
  listByCategory(categoryId: string, { includeInactive = false } = {}) { return this.getAll().filter(record => record.categoryId === categoryId && (includeInactive || record.active)); }
  seedDefaults(categories: { id: string; category: string }[]) {
    const all = this.getAll(); let next = [...all];
    const definitions = [
      { category: "Moving", items: [["Dump Truck", "DUMP", "DT"], ["Excavator", "EXC", "EX"], ["Wheel Loader", "WL", "WL"], ["Bulldozer", "DOZ", "BD"]] },
      { category: "Non-moving", items: [["Generator", "GEN", "GEN"], ["Air Compressor", "AC", "AC"], ["Welding Machine", "WELD", "WM"]] },
    ] as const;
    for (const definition of definitions) {
      const category = categories.find(item => item.category.trim().toLowerCase() === definition.category.toLowerCase()); if (!category) continue;
      for (const [name, code, assetPrefix] of definition.items) {
        if (next.some(item => item.categoryId === category.id && item.code === code)) continue;
        next.push({ id: `equipment-subcategory-${code.toLowerCase()}`, categoryId: category.id, name, code, assetPrefix, active: true, createdAt: "2026-08-10T00:00:00.000Z", updatedAt: "2026-08-10T00:00:00.000Z" });
      }
    }
    if (next.length !== all.length) persistence.save(next); return clone(next);
  }
  save(record: EquipmentSubcategoryRecord) {
    const all = this.getAll(); const name = record.name.trim(); const code = record.code.trim().toUpperCase(); const assetPrefix = record.assetPrefix?.trim().toUpperCase() || undefined;
    if (!record.categoryId || !name || !code) return { success: false as const, message: "Category, name, and code are required." };
    if (all.some(item => item.id !== record.id && item.categoryId === record.categoryId && (item.name.trim().toLowerCase() === name.toLowerCase() || item.code.trim().toUpperCase() === code))) return { success: false as const, message: "Equipment Sub-Category already exists under this Category." };
    const now = new Date().toISOString(); const saved = { ...clone(record), name, code, assetPrefix, createdAt: record.createdAt || now, updatedAt: now };
    persistence.save(all.some(item => item.id === record.id) ? all.map(item => item.id === record.id ? saved : item) : [...all, saved]); return { success: true as const, record: clone(saved) };
  }
}
export const equipmentSubcategoryRepository = new EquipmentSubcategoryRepository();
export function suggestSubcategoryAssetNumber(prefix: string | undefined, equipment: { assetNo: string }[]) { const normalized = prefix?.trim().toUpperCase(); if (!normalized) return undefined; const pattern = new RegExp(`^${normalized.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}-(\\d+)$`, "i"); const next = equipment.reduce((max, item) => Math.max(max, Number(item.assetNo.match(pattern)?.[1] ?? 0)), 0) + 1; return `${normalized}-${String(next).padStart(6, "0")}`; }
