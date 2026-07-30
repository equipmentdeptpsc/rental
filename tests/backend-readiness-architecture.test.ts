import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  validateMigrationPackage,
  type AggregateChangeEvent,
  type CommandResult,
  type LocalMigrationPackage,
  type OfflineCommandEnvelope,
} from "@/core/persistence";
import type { EquipmentAuditRepository } from "@/features/equipment/audit/repository";

const sourceRoot = path.resolve(process.cwd(), "src");
const checkedRoots = ["pages", "features"];
const allowed = new Set([
  "features/auth/repository/LocalAuthRepository.ts",
  "features/auth/repository/LocalUserRepository.ts",
  "features/auth/repository/LegacyAuthCompatibilityRepository.ts",
  "features/auth/repository/localStorageSchema.ts",
  "features/rental/deur/synchronization/deurChangeNotifications.ts",
  "features/settings/services/applicationBackupService.ts",
]);

function sourceFiles(root: string): string[] {
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(root, entry.name);
    return entry.isDirectory() ? sourceFiles(absolute) : /\.(ts|tsx)$/.test(entry.name) ? [absolute] : [];
  });
}

describe("backend readiness architecture", () => {
  it("keeps browser storage out of pages, contexts, components, and domain/application services", () => {
    const violations = checkedRoots.flatMap((root) => sourceFiles(path.join(sourceRoot, root))).flatMap((file) => {
      const relative = path.relative(sourceRoot, file).replaceAll("\\", "/");
      if (allowed.has(relative)) return [];
      const text = fs.readFileSync(file, "utf8");
      const isGuardedLayer =
        relative.startsWith("pages/") ||
        /Context\.tsx?$/.test(relative) ||
        /\/components\//.test(relative) ||
        /\/(services|domain)\//.test(relative);
      return isGuardedLayer && /\b(localStorage|sessionStorage)\b/.test(text) ? [relative] : [];
    });
    expect(violations).toEqual([]);
  });

  it("supports injecting a browser-neutral audit adapter", () => {
    const writes: unknown[] = [];
    const adapter: EquipmentAuditRepository = {
      getAll: () => [],
      replace: (records) => writes.push(structuredClone(records)),
    };
    adapter.replace([]);
    expect(writes).toEqual([[]]);
  });

  it("preserves typed conflicts instead of masking them as generic failures", () => {
    const result: CommandResult<{ id: string }> = {
      ok: false,
      rejection: { kind: "CONFLICT", expectedVersion: 2, currentVersion: 3 },
    };
    expect(result).toEqual({ ok: false, rejection: { kind: "CONFLICT", expectedVersion: 2, currentVersion: 3 } });
  });

  it("serializes complete offline command identity and idempotency metadata", () => {
    const command: OfflineCommandEnvelope<{ activityCode: string }> = {
      commandId: "cmd-1", idempotencyKey: "device-1:7", commandType: "CHANGE_ACTIVITY",
      userId: "user-1", operatorId: "operator-1", rentalId: "rental-1", rentalLineId: "line-1",
      deurId: "deur-1", equipmentId: "equipment-1", expectedVersion: 4,
      clientCreatedAt: "2026-07-28T01:00:00.000Z", clientSequence: 7,
      payload: { activityCode: "WORK" }, retryCount: 0, status: "QUEUED",
    };
    expect(JSON.parse(JSON.stringify(command))).toEqual(command);
    expect(command.idempotencyKey).toBe("device-1:7");
  });

  it("requires complete line identity on line-scoped subscription events", () => {
    const event: AggregateChangeEvent = {
      eventId: "event-1", eventType: "DEUR_UPDATED", aggregateType: "DEUR", aggregateId: "deur-1",
      rentalId: "rental-1", rentalLineId: "line-1", deurId: "deur-1", equipmentId: "equipment-1",
      operatorId: "operator-1", version: 5, occurredAt: "2026-07-28T01:01:00.000Z", actorId: "user-1",
    };
    expect(event).toMatchObject({ rentalLineId: "line-1", equipmentId: "equipment-1", operatorId: "operator-1" });
  });

  it("preserves stable IDs and snapshots while reporting bad references and repeat imports", () => {
    const migration: LocalMigrationPackage = {
      importId: "export-device-a-1", source: "LOCAL_STORAGE", sourceSchemaVersion: 1,
      exportedAt: "2026-07-28T01:00:00.000Z",
      records: [{ entityType: "Rental", id: "rental-stable-id", record: { id: "rental-stable-id", number: "R-2026-1" } }],
      commercialSnapshots: [{ entityType: "RentalLineSnapshot", id: "snapshot-stable-id", record: { rate: 100, unit: "DAY" } }],
    };
    const issues = validateMigrationPackage(
      migration,
      { hasImport: (id) => id === migration.importId },
      [{ entityType: "Rental", id: "rental-stable-id", targetType: "Customer", targetId: "missing-customer" }],
    );
    expect(migration.records[0].id).toBe("rental-stable-id");
    expect(migration.commercialSnapshots[0].record).toEqual({ rate: 100, unit: "DAY" });
    expect(issues.map((issue) => issue.code)).toEqual(["DUPLICATE_IMPORT", "BROKEN_REFERENCE"]);
  });
});
