import { storage } from "@/core/storage";
import type { DeurShiftWindowDefinition } from "@/features/rental/types";
import { normalizeDeurShiftWindow } from "./normalizeDeurShiftWindow";

export const DEUR_SHIFT_WINDOW_STORAGE_KEY = "equipment-rental-deur-shift-windows";
const clone = <T>(value: T): T => structuredClone(value);

export class DeurShiftWindowRepository {
  constructor(private readonly defaultTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC") {}
  private seed() {
    const stored = storage.get<unknown[]>(DEUR_SHIFT_WINDOW_STORAGE_KEY) ?? [];
    const codes = new Set(stored.flatMap((item) => item && typeof item === "object" && typeof (item as Record<string, unknown>).code === "string" ? [(item as Record<string, unknown>).code] : []));
    const defaults: DeurShiftWindowDefinition[] = [
      { code: "DAY", label: "Day Shift", startTime: "08:00", endTime: "17:00", timezone: this.defaultTimezone },
      { code: "NIGHT", label: "Night Shift", startTime: "20:00", endTime: "05:00", timezone: this.defaultTimezone },
    ];
    const missing = defaults.filter((item) => !codes.has(item.code));
    if (missing.length) storage.set(DEUR_SHIFT_WINDOW_STORAGE_KEY, [...stored, ...missing]);
  }
  getAll(): DeurShiftWindowDefinition[] { this.seed(); return (storage.get<unknown[]>(DEUR_SHIFT_WINDOW_STORAGE_KEY) ?? []).flatMap((item) => { const result = normalizeDeurShiftWindow(item); return result.valid ? [result.value] : []; }).map(clone); }
  update(value: DeurShiftWindowDefinition, capturedAt: string): DeurShiftWindowDefinition {
    const result = normalizeDeurShiftWindow({ ...value, capturedAt }); if (!result.valid) throw new Error(result.message);
    const all = this.getAll().filter((item) => item.code !== result.value.code); storage.set(DEUR_SHIFT_WINDOW_STORAGE_KEY, [...all, result.value]); return clone(result.value);
  }
}
export const deurShiftWindowRepository = new DeurShiftWindowRepository();
