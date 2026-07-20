import type { ActivityCodeRecord } from "./types";

const STORAGE_KEY = "equipment-rental-activity-codes";
const SEED_TIMESTAMP = "2026-07-20T00:00:00.000Z";

const seed = (
  id: string,
  activityCode: string,
  description: string,
  sortOrder: number,
): ActivityCodeRecord => ({
  id,
  activityCode,
  description,
  active: true,
  sortOrder,
  createdAt: SEED_TIMESTAMP,
  updatedAt: SEED_TIMESTAMP,
  deleted: false,
});

export const ACTIVITY_CODE_SEEDS: readonly ActivityCodeRecord[] = [
  seed("activity-code-act100", "ACT100", "ACCOUNTING DEPARTMENT", 10),
  seed("activity-code-adm100", "ADM100", "ADMINISTRATIVE DEPARTMENT", 20),
  seed("activity-code-amd-pm", "AMD_PM", "AMD P&M USAGE", 30),
  seed("activity-code-cw100", "CW100", "CENTRAL WAREHOUSE", 40),
  seed("activity-code-cpmd-p", "CPMD_P", "CIP-MD CARPENTRY EXPANSION", 50),
  seed("activity-code-cipmed", "CIPMED", "CIP-MEDELLIN", 60),
  seed("activity-code-exe100", "EXE100", "EXECUTIVE DEPARTMENT", 70),
  seed("activity-code-hrd116", "HRD116", "HRD - EMPLOYEE RELATION", 80),
  seed("activity-code-hrd102", "HRD102", "HRD - HEALTH SERVICES", 90),
  seed("activity-code-hrd100", "HRD100", "HUMAN RESOURCE DEPARTMENT", 100),
  seed("activity-code-ldc", "LDC", "LAUCHANCO DEVELOPMENT CORPORATION", 110),
  seed("activity-code-smd-pm", "SMD_PM", "SMD P&M USAGE", 120),
  seed("activity-code-scm", "SCM", "SUPPLY CHAIN MANAGEMENT", 130),
  seed("activity-code-saf100", "SAF100", "SAFETY & HEALTH COMMITTEE", 140),
] as const;

export type ActivityCodeMutationResult =
  | { success: true; record: ActivityCodeRecord }
  | { success: false; message: string };

const clone = <T>(value: T): T => structuredClone(value);
export const normalizeActivityCode = (value: string) => value.trim().toUpperCase();

export function validateActivityCodeWrite(
  record: ActivityCodeRecord,
  existing: ActivityCodeRecord[],
): string | undefined {
  if (!record.activityCode.trim()) return "Activity Code is required.";
  if (!record.description.trim()) return "Description is required.";

  const normalized = normalizeActivityCode(record.activityCode);
  if (existing.some((item) =>
    item.id !== record.id && normalizeActivityCode(item.activityCode) === normalized
  )) return "Activity Code already exists.";

  return undefined;
}

export class ActivityCodeRepository {
  private initialize(): void {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) as unknown : [];
    const stored = Array.isArray(parsed) ? parsed as ActivityCodeRecord[] : [];
    const seedCodes = new Set(ACTIVITY_CODE_SEEDS.map((item) => normalizeActivityCode(item.activityCode)));
    const byCode = new Map(stored.map((item) => [normalizeActivityCode(item.activityCode), item]));
    const missingSeed = ACTIVITY_CODE_SEEDS.some((item) => !byCode.has(normalizeActivityCode(item.activityCode)));

    if (!raw || !Array.isArray(parsed) || missingSeed) {
      const seededRecords = ACTIVITY_CODE_SEEDS.map((item) =>
        byCode.get(normalizeActivityCode(item.activityCode)) ?? item
      );
      const customRecords = stored.filter((item) => !seedCodes.has(normalizeActivityCode(item.activityCode)));
      this.saveAll([...seededRecords, ...customRecords]);
    }
  }

  getAll(): ActivityCodeRecord[] {
    this.initialize();
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) as unknown : [];
    return clone(Array.isArray(parsed) ? parsed as ActivityCodeRecord[] : []);
  }

  getActive(): ActivityCodeRecord[] {
    return this.getAll().filter((item) => item.active && !item.deleted);
  }

  getById(id: string): ActivityCodeRecord | undefined {
    const found = this.getAll().find((item) => item.id === id);
    return found ? clone(found) : undefined;
  }

  search(keyword: string): ActivityCodeRecord[] {
    const value = keyword.trim().toLowerCase();
    return this.getAll().filter((item) =>
      !item.deleted && (!value ||
        item.activityCode.toLowerCase().includes(value) ||
        item.description.toLowerCase().includes(value))
    );
  }

  create(record: ActivityCodeRecord): ActivityCodeMutationResult {
    const all = this.getAll();
    const error = validateActivityCodeWrite(record, all);
    if (error) return { success: false, message: error };

    const timestamp = new Date().toISOString();
    const created: ActivityCodeRecord = {
      ...clone(record),
      activityCode: record.activityCode.trim(),
      description: record.description.trim(),
      createdAt: record.createdAt ?? timestamp,
      updatedAt: timestamp,
    };
    this.saveAll([...all, created]);
    return { success: true, record: clone(created) };
  }

  update(record: ActivityCodeRecord): ActivityCodeMutationResult {
    const all = this.getAll();
    const current = all.find((item) => item.id === record.id);
    if (!current) return { success: false, message: "Activity Code not found." };
    const error = validateActivityCodeWrite(record, all);
    if (error) return { success: false, message: error };

    const updated: ActivityCodeRecord = {
      ...clone(record),
      activityCode: record.activityCode.trim(),
      description: record.description.trim(),
      createdAt: record.createdAt ?? current.createdAt,
      updatedAt: new Date().toISOString(),
    };
    this.saveAll(all.map((item) => item.id === updated.id ? updated : item));
    return { success: true, record: clone(updated) };
  }

  softDelete(id: string): void {
    this.saveAll(this.getAll().map((item) => item.id === id
      ? { ...item, deleted: true, deletedAt: Date.now() }
      : item));
  }

  restore(id: string): void {
    this.saveAll(this.getAll().map((item) => item.id === id
      ? { ...item, deleted: false, deletedAt: undefined }
      : item));
  }

  private saveAll(records: ActivityCodeRecord[]): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(clone(records)));
  }
}

export const activityCodeRepository = new ActivityCodeRepository();
