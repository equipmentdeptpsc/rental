import { beforeEach, describe, expect, it, vi } from "vitest";

import { DeurSyncServerService } from "./server/application/DeurSyncServerService";
import { InMemoryDeurSyncServerPersistence } from "./server/persistence/InMemoryDeurSyncServerPersistence";
import { ReferenceDeurSyncServer } from "./server/ReferenceDeurSyncServer";
import { conformanceChange } from "./server/deurSyncConformance";

describe("DEUR sync server application service", () => {
  let persistence: InMemoryDeurSyncServerPersistence;
  let service: DeurSyncServerService;

  beforeEach(() => {
    persistence = new InMemoryDeurSyncServerPersistence();
    service = new DeurSyncServerService(persistence, () => new Date("2026-07-19T10:00:00.000Z"));
  });

  it("accepts, revisions, orders, and replays valid operations deterministically", () => {
    const change = conformanceChange("operation-1", "deur-1");
    const first = service.push({ clientId: "client-a", changes: [change] });
    const replay = service.push({ clientId: "client-a", changes: [structuredClone(change)] });

    expect(first.accepted[0]).toMatchObject({ remoteRevision: 1, alreadyAccepted: false });
    expect(replay.accepted[0]).toMatchObject({ remoteRevision: 1, alreadyAccepted: true });
    expect(persistence.snapshot()).toMatchObject({ sequence: 1, operationIds: ["operation-1"], idempotencyKeys: ["operation-1"] });
  });

  it("returns stale conflicts with both envelopes and rejects future revisions", () => {
    service.push({ clientId: "a", changes: [conformanceChange("create", "deur-1")] });
    const current = { ...conformanceChange("current", "deur-1"), operation: "update" as const, baseRemoteRevision: 1 };
    service.push({ clientId: "a", changes: [current] });
    const stale = { ...conformanceChange("stale", "deur-1"), operation: "update" as const, baseRemoteRevision: 1 };
    const conflict = service.push({ clientId: "b", changes: [stale] });
    const future = service.push({ clientId: "b", changes: [{ ...stale, operationId: "future", idempotencyKey: "future", baseRemoteRevision: 8 }] });

    expect(conflict.conflicts[0]).toMatchObject({ reason: "stale-local", local: stale });
    expect(conflict.conflicts[0].remote.operationId).toBe("current");
    expect(future.rejected[0]).toMatchObject({ reason: "validation" });
  });

  it("pulls deterministic ordered pages after numeric cursors", () => {
    service.push({ clientId: "a", changes: [conformanceChange("one"), conformanceChange("two"), conformanceChange("three")] });
    const first = service.pull({ clientId: "b", cursor: "0", limit: 2 });
    const second = service.pull({ clientId: "b", cursor: first.cursor, limit: 2 });

    expect(first).toMatchObject({ cursor: "2", hasMore: true });
    expect(first.changes.map((item) => item.operationId)).toEqual(["one", "two"]);
    expect(second).toMatchObject({ cursor: "3", hasMore: false });
  });
});

describe("reference controller delegation", () => {
  it("delegates normalized push and pull requests to the application service", async () => {
    const push = vi.fn(() => ({ accepted: [], rejected: [], conflicts: [], cursor: "0", serverTimestamp: "2026-07-19T10:00:00.000Z" }));
    const pull = vi.fn(() => ({ changes: [], cursor: "0", hasMore: false, serverTimestamp: "2026-07-19T10:00:00.000Z" }));
    const server = new ReferenceDeurSyncServer({ service: { push, pull } });

    expect((await server.handle("POST", "/deur-sync/push", { protocolVersion: 1, clientId: "a", changes: [] })).status).toBe(200);
    expect((await server.handle("POST", "/deur-sync/pull", { protocolVersion: 1, clientId: "b", cursor: "0" })).status).toBe(200);
    expect(push).toHaveBeenCalledWith({ clientId: "a", changes: [], cursor: undefined });
    expect(pull).toHaveBeenCalledWith({ clientId: "b", cursor: "0", limit: undefined });
  });
});
