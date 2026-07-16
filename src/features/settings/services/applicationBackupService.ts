import { storage } from "@/core/storage";

export const BACKUP_APPLICATION_ID = "equipment-rental-system";
export const BACKUP_SCHEMA_VERSION = 1;
export const STORAGE_METADATA_KEY = "equipment-rental-storage-metadata";
export const MAX_BACKUP_FILE_SIZE_BYTES = 5 * 1024 * 1024;

// This registry intentionally excludes authentication/session keys.
export const APPLICATION_STORAGE_KEYS = [
  "equipment-records",
  "equipment-history-records",
  "equipment-audit-logs",
  "assignments",
  "equipment-rental-records",
  "projects",
  "operators",
  "customer_records",
  "maintenance_records",
  "equipment-rental-deur",
  "equipment-rental-billing-statements",
  "equipment-rental-billing",
  "equipment-rental-contracts",
  "equipment-daily-logs",
  "equipment-prefixes",
  "equipment-types",
  "equipment-models",
  "equipment-brand-master",
  "equipment-category-master",
  "equipment-condition-master",
  "equipment-location-master",
  "equipment-ownership-master",
  "equipment-status-master",
  "rental-status-master",
  "equipment-rental-activity-codes",
  "equipment-rental-cost-codes",
] as const;

export type ApplicationStorageKey = (typeof APPLICATION_STORAGE_KEYS)[number];
export type BackupData = Record<ApplicationStorageKey, unknown | null>;

export interface ApplicationBackup {
  application: typeof BACKUP_APPLICATION_ID;
  schemaVersion: number;
  exportedAt: string;
  recordCounts: Record<ApplicationStorageKey, number>;
  data: BackupData;
}

export interface RestorePreview {
  backup: ApplicationBackup;
  sections: ApplicationStorageKey[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function countRecords(value: unknown): number {
  return Array.isArray(value) ? value.length : value === null ? 0 : 1;
}

function readSection(key: ApplicationStorageKey): unknown | null {
  try {
    return storage.get<unknown>(key);
  } catch {
    throw new Error(`Stored data in '${key}' is malformed. Fix or reset that section before creating a backup.`);
  }
}

function validateData(data: unknown): data is BackupData {
  if (!isRecord(data)) return false;
  return APPLICATION_STORAGE_KEYS.every((key) =>
    Object.prototype.hasOwnProperty.call(data, key) &&
    (data[key] === null || Array.isArray(data[key]))
  );
}

export function createApplicationBackup(now = new Date()): ApplicationBackup {
  const data = {} as BackupData;
  const recordCounts = {} as Record<ApplicationStorageKey, number>;

  for (const key of APPLICATION_STORAGE_KEYS) {
    const value = readSection(key);
    data[key] = value;
    recordCounts[key] = countRecords(value);
  }

  return {
    application: BACKUP_APPLICATION_ID,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: now.toISOString(),
    recordCounts,
    data,
  };
}

export function serializeApplicationBackup(now = new Date()): string {
  return JSON.stringify(createApplicationBackup(now), null, 2);
}

export function backupFilename(now = new Date()): string {
  const date = now.toISOString().replace(/[-:]/g, "").replace(/T/, "-").slice(0, 13);
  return `equipment-rental-backup-${date}.json`;
}

export function validateApplicationBackup(value: unknown): RestorePreview {
  if (!isRecord(value) || value.application !== BACKUP_APPLICATION_ID) {
    throw new Error("This file is not an Equipment Rental System backup.");
  }
  if (value.schemaVersion !== BACKUP_SCHEMA_VERSION) {
    throw new Error(`Unsupported backup schema version '${String(value.schemaVersion)}'.`);
  }
  if (typeof value.exportedAt !== "string" || Number.isNaN(Date.parse(value.exportedAt))) {
    throw new Error("The backup export date is missing or invalid.");
  }
  if (!validateData(value.data)) {
    throw new Error("The backup does not contain every required application storage section.");
  }

  const recordCounts = {} as Record<ApplicationStorageKey, number>;
  for (const key of APPLICATION_STORAGE_KEYS) {
    recordCounts[key] = countRecords(value.data[key]);
  }

  return {
    backup: {
      application: BACKUP_APPLICATION_ID,
      schemaVersion: BACKUP_SCHEMA_VERSION,
      exportedAt: value.exportedAt,
      recordCounts,
      data: value.data,
    },
    sections: [...APPLICATION_STORAGE_KEYS],
  };
}

export function parseApplicationBackup(json: string): RestorePreview {
  try {
    return validateApplicationBackup(JSON.parse(json) as unknown);
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error("The selected file is not valid JSON.");
    throw error;
  }
}

export function restoreApplicationBackup(preview: RestorePreview): void {
  // Validation happens before this function is called, so writes are all-or-nothing for invalid input.
  for (const key of APPLICATION_STORAGE_KEYS) storage.remove(key);
  for (const key of APPLICATION_STORAGE_KEYS) {
    const value = preview.backup.data[key];
    if (value !== null) storage.set(key, value);
  }
  storage.set(STORAGE_METADATA_KEY, { schemaVersion: BACKUP_SCHEMA_VERSION });
}

export function resetApplicationData(): void {
  for (const key of APPLICATION_STORAGE_KEYS) storage.remove(key);
  storage.remove(STORAGE_METADATA_KEY);
}

export function resetTransactionalData(): void {
  const masterKeys = new Set<ApplicationStorageKey>([
    "equipment-prefixes", "equipment-types", "equipment-models", "equipment-brand-master",
    "equipment-category-master", "equipment-condition-master", "equipment-location-master",
    "equipment-ownership-master", "equipment-status-master", "rental-status-master",
    "equipment-rental-activity-codes", "equipment-rental-cost-codes",
  ]);
  for (const key of APPLICATION_STORAGE_KEYS) {
    if (!masterKeys.has(key)) storage.remove(key);
  }
}

export function getStorageSchemaVersion(): number {
  const metadata = storage.get<{ schemaVersion?: number }>(STORAGE_METADATA_KEY);
  // Missing metadata is the legacy storage format and remains readable as v1.
  if (!metadata?.schemaVersion) return BACKUP_SCHEMA_VERSION;
  if (metadata.schemaVersion > BACKUP_SCHEMA_VERSION) {
    throw new Error(`Unsupported storage schema version '${metadata.schemaVersion}'.`);
  }
  return metadata.schemaVersion;
}
