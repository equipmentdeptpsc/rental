// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Pool } from "pg";

import { DeurSyncServerService } from "./server/application/DeurSyncServerService";
import { conformanceChange } from "./server/deurSyncConformance";
import { PostgresDeurSyncServerPersistence } from "./server/postgres/PostgresDeurSyncServerPersistence";
import { runDeurSyncPostgresMigrations } from "./server/postgres/runMigrations";

const connectionString = process.env.DEUR_SYNC_POSTGRES_TEST_URL;
const describePostgres = connectionString ? describe : describe.skip;

describePostgres("PostgreSQL DEUR sync persistence integration", () => {
  let pool: Pool;
  let persistence: PostgresDeurSyncServerPersistence;

  beforeAll(async () => {
    pool = new Pool({ connectionString, max: 8 });
    await runDeurSyncPostgresMigrations(pool);
    persistence = new PostgresDeurSyncServerPersistence(pool);
  });
  beforeEach(async () => { await persistence.reset(); });
  afterAll(async () => { if (pool) await pool.end(); });

  it("accepts once, reconstructs durable evidence, and returns immutable JSON", async () => {
    const input = conformanceChange("operation-1", "deur-1");
    const accepted = await persistence.accept({ change: input, expectedRevision: 0 });
    const replay = await new PostgresDeurSyncServerPersistence(pool).accept({ change: structuredClone(input), expectedRevision: 0 });

    expect(accepted).toMatchObject({ kind: "accepted", accepted: { remoteRevision: 1 } });
    expect(replay).toMatchObject({ kind: "replayed", accepted: { remoteRevision: 1 } });
    const page = await persistence.readChanges(0, 10);
    page.changes[0].operationId = "mutated-return";
    expect((await persistence.readChanges(0, 10)).changes[0].operationId).toBe("operation-1");
  });

  it("deduplicates concurrent operation IDs and idempotency keys", async () => {
    const sameOperation = conformanceChange("same-operation", "deur-a");
    const operationResults = await Promise.all([
      persistence.accept({ change: sameOperation, expectedRevision: 0 }),
      persistence.accept({ change: { ...sameOperation, idempotencyKey: "other-key" }, expectedRevision: 0 }),
    ]);
    expect(operationResults.filter((item) => item.kind === "accepted")).toHaveLength(1);
    expect((await persistence.readChanges(0, 10)).changes).toHaveLength(1);

    await persistence.reset();
    const sameKey = conformanceChange("first-operation", "deur-b");
    const keyResults = await Promise.all([
      persistence.accept({ change: sameKey, expectedRevision: 0 }),
      persistence.accept({ change: { ...sameKey, operationId: "other-operation" }, expectedRevision: 0 }),
    ]);
    expect(keyResults.filter((item) => item.kind === "accepted")).toHaveLength(1);
    expect((await persistence.readChanges(0, 10)).changes).toHaveLength(1);
  });

  it("serializes concurrent same-revision entity updates so only one advances", async () => {
    await persistence.accept({ change: conformanceChange("create", "deur-1"), expectedRevision: 0 });
    const first = { ...conformanceChange("update-a", "deur-1"), operation: "update" as const, baseRemoteRevision: 1 };
    const second = { ...conformanceChange("update-b", "deur-1"), operation: "update" as const, baseRemoteRevision: 1 };
    const results = await Promise.all([
      persistence.accept({ change: first, expectedRevision: 1 }),
      persistence.accept({ change: second, expectedRevision: 1 }),
    ]);

    expect(results.filter((item) => item.kind === "accepted")).toHaveLength(1);
    expect(results.filter((item) => item.kind === "revision-mismatch")).toHaveLength(1);
    expect((await persistence.getEntityState("deur-1"))?.revision).toBe(2);
    expect((await persistence.readChanges(0, 10)).changes).toHaveLength(2);
  });

  it("supports service revision rules, cursor limits, and durable conflicts", async () => {
    const service = new DeurSyncServerService(persistence, () => new Date("2026-07-19T10:00:00.000Z"));
    await service.push({ clientId: "a", changes: [conformanceChange("create", "deur-1"), conformanceChange("other", "deur-2")] });
    const future = await service.push({ clientId: "b", changes: [{ ...conformanceChange("future", "deur-1"), operation: "update", baseRemoteRevision: 9 }] });
    const stale = await service.push({ clientId: "b", changes: [{ ...conformanceChange("stale", "deur-1"), operation: "update", baseRemoteRevision: 0 }] });
    const page = await service.pull({ clientId: "b", cursor: "0", limit: 1 });

    expect(future.rejected).toHaveLength(1);
    expect(stale.conflicts[0]).toMatchObject({ reason: "stale-local" });
    expect(await persistence.findConflict("deur-1:stale:stale-local")).toMatchObject({ local: { operationId: "stale" }, remote: { operationId: "create" } });
    expect(page).toMatchObject({ cursor: "1", hasMore: true });
  });

  it("rolls back every durable invariant after a simulated acceptance failure", async () => {
    persistence.failNextAcceptance();
    await expect(persistence.accept({ change: conformanceChange("failed", "deur-1"), expectedRevision: 0 })).rejects.toThrow("Simulated PostgreSQL acceptance failure");

    expect(await persistence.findByOperationId("failed")).toBeUndefined();
    expect(await persistence.findByIdempotencyKey("failed")).toBeUndefined();
    expect(await persistence.getEntityState("deur-1")).toBeUndefined();
    expect((await persistence.readChanges(0, 10)).changes).toEqual([]);
  });
});

if (!connectionString) {
  describe("PostgreSQL DEUR sync persistence configuration", () => {
    it("skips integration safely when DEUR_SYNC_POSTGRES_TEST_URL is absent", () => {
      expect(connectionString).toBeUndefined();
    });
  });
}
