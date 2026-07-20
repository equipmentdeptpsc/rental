import { storage } from "@/core/storage";
import type { EquipmentCategory, PrefixRecord } from "../types";

export const PREFIX_STORAGE_KEY = "equipment-prefixes";
const categories: EquipmentCategory[] = ["Moving Equipment", "Non-Moving Equipment", "Aerial Equipment", "Light Equipment"];
const defaults: PrefixRecord[] = [
  { id: "prefix-moving-equipment", category: "Moving Equipment", code: "ME", description: "Moving Equipment", nextNumber: 1, digits: 6, active: true },
  { id: "prefix-non-moving-equipment", category: "Non-Moving Equipment", code: "NME", description: "Non-moving Equipment", nextNumber: 1, digits: 6, active: true },
  { id: "prefix-aerial-equipment", category: "Aerial Equipment", code: "AE", description: "Aerial Equipment", nextNumber: 1, digits: 6, active: true },
  { id: "prefix-light-equipment", category: "Light Equipment", code: "LE", description: "Light Equipment", nextNumber: 1, digits: 6, active: true },
];
const clone = <T>(value: T): T => structuredClone(value);
export type PrefixMutationResult = { success: true; record: PrefixRecord } | { success: false; code: string; message: string };

export function normalizePrefixRecord(value: PrefixRecord): PrefixMutationResult {
  const category = value.category; const code = value.code.trim().toUpperCase(); const description = value.description.trim();
  if (!category || !categories.includes(category)) return { success: false, code: "PREFIX_CATEGORY_REQUIRED", message: "Equipment Category is required." };
  if (!/^[A-Z][A-Z0-9]{0,5}$/.test(code)) return { success: false, code: "PREFIX_CODE_INVALID", message: "Prefix must use 1–6 uppercase letters or numbers and start with a letter." };
  if (!description) return { success: false, code: "PREFIX_DESCRIPTION_REQUIRED", message: "Description is required." };
  if (!Number.isInteger(value.digits) || value.digits < 1 || value.digits > 9) return { success: false, code: "PREFIX_DIGITS_INVALID", message: "Digits must be a whole number from 1 to 9." };
  if (!Number.isInteger(value.nextNumber) || value.nextNumber < 1) return { success: false, code: "PREFIX_SEQUENCE_INVALID", message: "Next Number must be a positive whole number." };
  return { success: true, record: { id: value.id, category, code, description, nextNumber: value.nextNumber, digits: value.digits, active: value.active } };
}

export class PrefixRepository {
  private load(): PrefixRecord[] {
    const stored = storage.get<PrefixRecord[]>(PREFIX_STORAGE_KEY);
    if (!stored) { storage.set(PREFIX_STORAGE_KEY, clone(defaults)); return clone(defaults); }
    const existingActiveCategories = new Set(stored.filter((item) => item.active && item.category).map((item) => item.category));
    const missing = defaults.filter((item) => !existingActiveCategories.has(item.category));
    if (missing.length) storage.set(PREFIX_STORAGE_KEY, [...clone(stored), ...clone(missing)]);
    return clone([...stored, ...missing]);
  }
  getAll() { return this.load(); }
  get(id: string) { const record = this.load().find((item) => item.id === id); return record ? clone(record) : undefined; }
  create(value: PrefixRecord): PrefixMutationResult { return this.saveMutation(value, false); }
  update(value: PrefixRecord): PrefixMutationResult { return this.saveMutation(value, true); }
  delete(id: string) { storage.set(PREFIX_STORAGE_KEY, this.load().filter((item) => item.id !== id)); }
  private saveMutation(value: PrefixRecord, updating: boolean): PrefixMutationResult {
    const normalized = normalizePrefixRecord(value); if (!normalized.success) return normalized;
    const records = this.load(); const others = records.filter((item) => item.id !== normalized.record.id);
    if (updating && others.length === records.length) return { success: false, code: "PREFIX_NOT_FOUND", message: "Prefix was not found." };
    if (normalized.record.active && others.some((item) => item.active && item.category === normalized.record.category)) return { success: false, code: "PREFIX_CATEGORY_CONFLICT", message: "This equipment category already has an active asset-number prefix." };
    if (others.some((item) => item.code.trim().toUpperCase() === normalized.record.code)) return { success: false, code: "PREFIX_CODE_CONFLICT", message: "Prefix code is already configured." };
    storage.set(PREFIX_STORAGE_KEY, updating ? records.map((item) => item.id === normalized.record.id ? normalized.record : item) : [...records, normalized.record]);
    return { success: true, record: clone(normalized.record) };
  }
}
export const prefixRepository = new PrefixRepository();
