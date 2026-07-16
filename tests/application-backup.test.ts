import { beforeEach, describe, expect, it } from "vitest";
import { storage } from "@/core/storage";
import {
  APPLICATION_STORAGE_KEYS,
  BACKUP_APPLICATION_ID,
  BACKUP_SCHEMA_VERSION,
  createApplicationBackup,
  getStorageSchemaVersion,
  parseApplicationBackup,
  resetApplicationData,
  restoreApplicationBackup,
} from "@/features/settings/services/applicationBackupService";

describe("application backup and restore", () => {
  beforeEach(() => storage.clear());

  it("exports every registered section without authentication secrets and preserves relationships", () => {
    storage.set("equipment-records", [{ id: "equipment-1" }]);
    storage.set("equipment-rental-records", [{ id: "rental-1", equipmentId: "equipment-1" }]);
    storage.set("auth_token", "secret");
    const backup = createApplicationBackup(new Date("2026-07-17T08:30:00Z"));
    expect(backup.application).toBe(BACKUP_APPLICATION_ID);
    expect(backup.schemaVersion).toBe(BACKUP_SCHEMA_VERSION);
    expect(backup.exportedAt).toBe("2026-07-17T08:30:00.000Z");
    expect(Object.keys(backup.data)).toEqual(APPLICATION_STORAGE_KEYS);
    expect(JSON.stringify(backup)).not.toContain("secret");
    expect(backup.data["equipment-rental-records"]).toEqual([{ id: "rental-1", equipmentId: "equipment-1" }]);
  });

  it("rejects malformed, wrong, unsupported, and incomplete backups without writing", () => {
    storage.set("projects", [{ id: "current" }]);
    expect(() => parseApplicationBackup("{")) .toThrow("not valid JSON");
    expect(() => parseApplicationBackup(JSON.stringify({ application: "other" }))).toThrow("not an Equipment Rental");
    const valid = createApplicationBackup();
    expect(() => parseApplicationBackup(JSON.stringify({ ...valid, schemaVersion: 99 }))).toThrow("Unsupported");
    expect(() => parseApplicationBackup(JSON.stringify({ ...valid, data: {} }))).toThrow("required application storage section");
    expect(storage.get("projects")).toEqual([{ id: "current" }]);
  });

  it("fully replaces registered data while preserving unrelated local storage", () => {
    storage.set("projects", [{ id: "old" }]);
    storage.set("equipment-records", [{ id: "old-equipment" }]);
    storage.set("unrelated-key", { keep: true });
    const backup = createApplicationBackup();
    backup.data.projects = [{ id: "new" }];
    storage.set("equipment-records", [{ id: "replacement-should-be-removed" }]);
    const preview = parseApplicationBackup(JSON.stringify(backup));
    restoreApplicationBackup(preview);
    expect(storage.get("projects")).toEqual([{ id: "new" }]);
    expect(storage.get("equipment-records")).toEqual([{ id: "old-equipment" }]);
    expect(storage.get("unrelated-key")).toEqual({ keep: true });
  });

  it("resets only registered application keys and treats missing metadata as legacy-compatible", () => {
    storage.set("projects", [{ id: "project-1" }]);
    storage.set("unrelated-key", "keep");
    resetApplicationData();
    expect(storage.get("projects")).toBeNull();
    expect(storage.get("unrelated-key")).toBe("keep");
    expect(getStorageSchemaVersion()).toBe(BACKUP_SCHEMA_VERSION);
  });
});
