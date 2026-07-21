import { beforeEach, describe, expect, it } from "vitest";
import { storage } from "@/core/storage";
import { LocalStoragePersistenceAdapter, checkOptimisticVersion, normalizeStorageEnvelope, paginate, prepareRepositoryTransaction, repositoryCatalog } from "@/core/persistence";
import { APPLICATION_STORAGE_KEYS } from "@/features/settings/services/applicationBackupService";

describe("repository persistence contracts", () => {
  beforeEach(() => storage.clear());

  it("catalogs every persisted application repository with stable version metadata", () => {
    const names = new Set<string>(); const keys = new Set<string>();
    for (const descriptor of repositoryCatalog) {
      expect(descriptor.name).not.toBe(""); expect(descriptor.storageKey).not.toBe(""); expect(descriptor.schemaVersion).toBeGreaterThan(0); expect(descriptor.capabilities.length).toBeGreaterThan(0);
      expect(names.has(descriptor.name)).toBe(false); expect(keys.has(descriptor.storageKey)).toBe(false); names.add(descriptor.name); keys.add(descriptor.storageKey);
    }
    const repositoryKeys = APPLICATION_STORAGE_KEYS.filter((key) => !["equipment-audit-logs", "equipment-rental-billing"].includes(key));
    expect(repositoryKeys.filter((key) => !keys.has(key))).toEqual([]);
  });

  it("adapts local storage through structured read/write/delete results", () => {
    const adapter = new LocalStoragePersistenceAdapter(storage);
    expect(adapter.write("records", [{ id: "1", value: "original" }])).toMatchObject({ success: true });
    const loaded = adapter.read<Array<{ id: string; value: string }>>("records"); expect(loaded).toMatchObject({ success: true, value: [{ id: "1", value: "original" }] });
    if (loaded.success && loaded.value) loaded.value[0].value = "changed";
    expect(adapter.read("records")).toMatchObject({ success: true, value: [{ id: "1", value: "original" }] });
    expect(adapter.remove("records")).toMatchObject({ success: true }); expect(adapter.read("records")).toMatchObject({ success: true, value: null });
  });

  it("normalizes legacy arrays without losing records and rejects malformed envelopes", () => {
    expect(normalizeStorageEnvelope<{ id: string }>([{ id: "legacy" }], 2)).toMatchObject({ success: true, value: { schemaVersion: 2, records: [{ id: "legacy" }], metadata: { sourceSchemaVersion: 0 } } });
    expect(normalizeStorageEnvelope({ schemaVersion: 1, records: [{ id: "current" }] }, 2)).toMatchObject({ success: true, value: { schemaVersion: 1, records: [{ id: "current" }] } });
    expect(normalizeStorageEnvelope("broken", 1)).toMatchObject({ success: false, error: { code: "REPOSITORY_STORAGE_MALFORMED", context: {}, recoverability: "USER_ACTION_REQUIRED" } });
  });

  it("provides deterministic paging without exposing mutable repository records", () => {
    const source = [{ id: "1" }, { id: "2" }, { id: "3" }]; const first = paginate(source, { limit: 2 });
    expect(first).toEqual({ items: [{ id: "1" }, { id: "2" }], nextCursor: "2", total: 3 }); first.items[0].id = "changed";
    expect(source[0].id).toBe("1"); expect(paginate(source, { limit: 2, cursor: first.nextCursor })).toEqual({ items: [{ id: "3" }], total: 3 });
  });

  it("supports optimistic conflict detection and transaction preparation without persistence", () => {
    expect(checkOptimisticVersion({ version: 2, etag: "a" }, { version: 2, etag: "a" })).toMatchObject({ success: true });
    expect(checkOptimisticVersion({ version: 3 }, { version: 2 })).toMatchObject({ success: false, error: { code: "REPOSITORY_CONFLICT", recoverability: "RETRYABLE" } });
    const mutation = { id: "rental-1", repository: "Rental", operation: "UPDATE" as const, before: { id: "rental-1", version: 1 }, after: { id: "rental-1", version: 2 }, expectedVersion: { version: 1 } };
    const prepared = prepareRepositoryTransaction([mutation], new Date("2026-07-22T00:00:00.000Z"));
    expect(prepared).toMatchObject({ success: true, value: { preparedAt: "2026-07-22T00:00:00.000Z", mutations: [mutation] } });
    expect(prepareRepositoryTransaction([mutation, mutation])).toMatchObject({ success: false, error: { code: "TRANSACTION_MUTATION_DUPLICATE" } });
  });
});
