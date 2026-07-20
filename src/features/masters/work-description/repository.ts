import type { WorkDescriptionRecord } from "./types";

const STORAGE_KEY = "equipment-rental-work-descriptions";
const SEED_TIMESTAMP = "2026-07-20T00:00:00.000Z";
const clone = <T>(value: T): T => structuredClone(value);

const seed = (
  id: string,
  code: string,
  name: string,
  sortOrder: number,
  requiresRemarks = false,
): WorkDescriptionRecord => ({
  id,
  code,
  name,
  active: true,
  deleted: false,
  sortOrder,
  operatorSelectable: true,
  requiresRemarks,
  createdAt: SEED_TIMESTAMP,
  updatedAt: SEED_TIMESTAMP,
});

export const WORK_DESCRIPTION_SEEDS: readonly WorkDescriptionRecord[] = [
  seed("work-description-material-hauling", "MATERIAL_HAULING", "MATERIAL HAULING", 10),
  seed("work-description-excavation", "EXCAVATION", "EXCAVATION", 20),
  seed("work-description-loading-unloading", "LOADING_UNLOADING", "LOADING / UNLOADING", 30),
  seed("work-description-grading-levelling", "GRADING_LEVELLING", "GRADING / LEVELLING", 40),
  seed("work-description-backfilling", "BACKFILLING", "BACKFILLING", 50),
  seed("work-description-lifting-material-handling", "LIFTING_MATERIAL_HANDLING", "LIFTING / MATERIAL HANDLING", 60),
  seed("work-description-site-clearing", "SITE_CLEARING", "SITE CLEARING", 70),
  seed("work-description-other-operation", "OTHER_OPERATION", "OTHER OPERATION", 80, true),
] as const;

export type WorkDescriptionMutationResult =
  | { success: true; record: WorkDescriptionRecord }
  | { success: false; message: string };

export const normalizeWorkDescriptionValue = (value: unknown) =>
  (typeof value === "string" ? value : "").trim().replace(/\s+/g, " ").toUpperCase();

export function validateWorkDescriptionWrite(
  record: WorkDescriptionRecord,
  existing: WorkDescriptionRecord[],
): string | undefined {
  if (!record.name.trim()) return "Work Description name is required.";
  if (!record.code.trim()) return "Work Description code is required.";
  const name = normalizeWorkDescriptionValue(record.name);
  const code = normalizeWorkDescriptionValue(record.code);
  if (existing.some((item) => item.id !== record.id && (
    normalizeWorkDescriptionValue(item.name) === name ||
    normalizeWorkDescriptionValue(item.code) === code
  ))) return "Work Description already exists.";
  return undefined;
}

function normalizeRecord(record: WorkDescriptionRecord): WorkDescriptionRecord {
  const categories = record.applicableEquipmentCategoryIds
    ?.map((id) => id.trim())
    .filter(Boolean);
  return {
    ...clone(record),
    code: record.code.trim(),
    name: record.name.trim().replace(/\s+/g, " "),
    applicableEquipmentCategoryIds: categories
      ? [...new Set(categories)]
      : undefined,
  };
}

export class WorkDescriptionRepository {
  private initialize(): void {
    let parsed: unknown = [];
    const raw = localStorage.getItem(STORAGE_KEY);
    try {
      parsed = raw ? JSON.parse(raw) : [];
    } catch {
      parsed = [];
    }
    const stored = Array.isArray(parsed) ? parsed as WorkDescriptionRecord[] : [];
    const matchesSeed = (record: WorkDescriptionRecord, candidate: WorkDescriptionRecord) =>
      normalizeWorkDescriptionValue(record.code) === normalizeWorkDescriptionValue(candidate.code) ||
      normalizeWorkDescriptionValue(record.name) === normalizeWorkDescriptionValue(candidate.name);
    const missing = WORK_DESCRIPTION_SEEDS.some((candidate) =>
      !stored.some((record) => matchesSeed(record, candidate))
    );

    if (!raw || !Array.isArray(parsed) || missing) {
      const seeded = WORK_DESCRIPTION_SEEDS.map((candidate) =>
        stored.find((record) => matchesSeed(record, candidate)) ?? candidate
      );
      const custom = stored.filter((record) =>
        !WORK_DESCRIPTION_SEEDS.some((candidate) => matchesSeed(record, candidate))
      );
      this.saveAll([...seeded, ...custom]);
    }
  }

  getAll(): WorkDescriptionRecord[] {
    this.initialize();
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]") as unknown;
      return clone(Array.isArray(parsed) ? parsed as WorkDescriptionRecord[] : []);
    } catch {
      return [];
    }
  }

  getById(id: string): WorkDescriptionRecord | undefined {
    const found = this.getAll().find((record) => record.id === id);
    return found ? clone(found) : undefined;
  }

  getActive(): WorkDescriptionRecord[] {
    return this.getAll().filter((record) => record.active && !record.deleted);
  }

  create(record: WorkDescriptionRecord): WorkDescriptionMutationResult {
    const all = this.getAll();
    const error = validateWorkDescriptionWrite(record, all);
    if (error) return { success: false, message: error };
    const timestamp = new Date().toISOString();
    const created = normalizeRecord({
      ...record,
      createdAt: record.createdAt ?? timestamp,
      updatedAt: timestamp,
    });
    this.saveAll([...all, created]);
    return { success: true, record: clone(created) };
  }

  update(record: WorkDescriptionRecord): WorkDescriptionMutationResult {
    const all = this.getAll();
    const current = all.find((item) => item.id === record.id);
    if (!current) return { success: false, message: "Work Description not found." };
    const error = validateWorkDescriptionWrite(record, all);
    if (error) return { success: false, message: error };
    const updated = normalizeRecord({
      ...record,
      createdAt: record.createdAt ?? current.createdAt,
      updatedAt: new Date().toISOString(),
    });
    this.saveAll(all.map((item) => item.id === updated.id ? updated : item));
    return { success: true, record: clone(updated) };
  }

  softDelete(id: string): void {
    this.saveAll(this.getAll().map((record) => record.id === id
      ? { ...record, deleted: true, deletedAt: Date.now() }
      : record));
  }

  restore(id: string): void {
    this.saveAll(this.getAll().map((record) => record.id === id
      ? { ...record, deleted: false, deletedAt: undefined }
      : record));
  }

  private saveAll(records: WorkDescriptionRecord[]): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(clone(records)));
  }
}

export const workDescriptionRepository = new WorkDescriptionRepository();
