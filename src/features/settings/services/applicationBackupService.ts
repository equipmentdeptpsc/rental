import { storage } from "@/core/storage";
import { initializeRequiredMasterData } from "@/features/masters/initializeRequiredMasterData";

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
  "equipment-rental-operator-user-links",
  "customer_records",
  "maintenance_records",
  "equipment-rental-deur",
  "equipment-rental-billing-statements",
  "equipment-rental-collections",
  "equipment-rental-billing",
  "equipment-rental-audit-events",
  "equipment-rental-development-approval-email-outbox",
  "equipment-rental-development-customer-review-outbox",
  "equipment-rental-manager-approver-configuration",
  "equipment-rental-contracts",
  "equipment-rental-equipment-lines",
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
  "equipment-rental-work-descriptions",
  "equipment-rental-deur-shift-windows",
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
  if (isRecord(value) && Array.isArray(value.records)) return value.records.length;
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
  return APPLICATION_STORAGE_KEYS.filter((key) => key !== "equipment-rental-collections" && key !== "equipment-rental-operator-user-links" && key !== "equipment-rental-development-customer-review-outbox" && key !== "equipment-rental-deur-shift-windows" && key !== "equipment-rental-equipment-lines" && key !== "equipment-rental-audit-events" && key !== "equipment-rental-development-approval-email-outbox" && key !== "equipment-rental-manager-approver-configuration").every((key) =>
    Object.prototype.hasOwnProperty.call(data, key) &&
    (data[key] === null || Array.isArray(data[key]))
  ) && (!Object.prototype.hasOwnProperty.call(data, "equipment-rental-collections") || data["equipment-rental-collections"] === null || Array.isArray(data["equipment-rental-collections"]))
    && (!Object.prototype.hasOwnProperty.call(data, "equipment-rental-operator-user-links") || data["equipment-rental-operator-user-links"] === null || Array.isArray(data["equipment-rental-operator-user-links"]))
    && (!Object.prototype.hasOwnProperty.call(data, "equipment-rental-deur-shift-windows") || data["equipment-rental-deur-shift-windows"] === null || Array.isArray(data["equipment-rental-deur-shift-windows"]))
    && (!Object.prototype.hasOwnProperty.call(data, "equipment-rental-development-approval-email-outbox") || data["equipment-rental-development-approval-email-outbox"] === null || Array.isArray(data["equipment-rental-development-approval-email-outbox"]))
    && (!Object.prototype.hasOwnProperty.call(data, "equipment-rental-development-customer-review-outbox") || data["equipment-rental-development-customer-review-outbox"] === null || Array.isArray(data["equipment-rental-development-customer-review-outbox"]))
    && (!Object.prototype.hasOwnProperty.call(data, "equipment-rental-manager-approver-configuration") || data["equipment-rental-manager-approver-configuration"] === null || Array.isArray(data["equipment-rental-manager-approver-configuration"]))
    && (!Object.prototype.hasOwnProperty.call(data, "equipment-rental-equipment-lines") || data["equipment-rental-equipment-lines"] === null || (isRecord(data["equipment-rental-equipment-lines"]) && data["equipment-rental-equipment-lines"].schemaVersion === 1 && Array.isArray(data["equipment-rental-equipment-lines"].records)));
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

  const normalizedData = {
    ...value.data,
    "equipment-rental-collections": value.data["equipment-rental-collections"] ?? null,
    "equipment-rental-operator-user-links": value.data["equipment-rental-operator-user-links"] ?? null,
    "equipment-rental-deur-shift-windows": value.data["equipment-rental-deur-shift-windows"] ?? null,
    "equipment-rental-equipment-lines": value.data["equipment-rental-equipment-lines"] ?? null,
    "equipment-rental-audit-events": value.data["equipment-rental-audit-events"] ?? null,
    "equipment-rental-development-approval-email-outbox": value.data["equipment-rental-development-approval-email-outbox"] ?? null,
    "equipment-rental-development-customer-review-outbox": value.data["equipment-rental-development-customer-review-outbox"] ?? null,
    "equipment-rental-manager-approver-configuration": value.data["equipment-rental-manager-approver-configuration"] ?? null,
  } as BackupData;
  const recordCounts = {} as Record<ApplicationStorageKey, number>;
  for (const key of APPLICATION_STORAGE_KEYS) {
    recordCounts[key] = countRecords(normalizedData[key]);
  }

  return {
    backup: {
      application: BACKUP_APPLICATION_ID,
      schemaVersion: BACKUP_SCHEMA_VERSION,
      exportedAt: value.exportedAt,
      recordCounts,
      data: normalizedData,
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
  const managerApproverConfiguration = storage.get<unknown>("equipment-rental-manager-approver-configuration");
  for (const key of APPLICATION_STORAGE_KEYS) storage.remove(key);
  storage.remove(STORAGE_METADATA_KEY);
  if (managerApproverConfiguration !== null) storage.set("equipment-rental-manager-approver-configuration", managerApproverConfiguration);
  initializeRequiredMasterData();
}

export function resetTransactionalData(): void {
  const masterKeys = new Set<ApplicationStorageKey>([
    "equipment-prefixes", "equipment-types", "equipment-models", "equipment-brand-master",
    "equipment-category-master", "equipment-condition-master", "equipment-location-master",
    "equipment-ownership-master", "equipment-status-master", "rental-status-master",
    "equipment-rental-activity-codes", "equipment-rental-cost-codes",
    "equipment-rental-work-descriptions",
    "equipment-rental-deur-shift-windows",
    "equipment-rental-manager-approver-configuration",
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
