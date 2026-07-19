import { beforeEach, describe, expect, it } from "vitest";

import { HttpDeurSyncTransport } from "@/features/rental/deur/synchronization/http/HttpDeurSyncTransport";
import { InMemoryDeurSyncTransport } from "./fakes/InMemoryDeurSyncTransport";
import { conformanceChange, defineDeurSyncConformanceSuite } from "./server/deurSyncConformance";
import { ReferenceDeurSyncServer } from "./server/ReferenceDeurSyncServer";

defineDeurSyncConformanceSuite("in-memory fake", () => new InMemoryDeurSyncTransport());
defineDeurSyncConformanceSuite("reference REST server", () => {
  const server = new ReferenceDeurSyncServer();
  return new HttpDeurSyncTransport({ baseUrl: "https://reference.test", clientId: "client-a", fetch: server.fetch });
});

describe("reference DEUR REST server", () => {
  let server: ReferenceDeurSyncServer;
  let transport: HttpDeurSyncTransport;

  beforeEach(() => {
    server = new ReferenceDeurSyncServer({ now: () => new Date("2026-07-19T10:00:00.000Z") });
    transport = new HttpDeurSyncTransport({ baseUrl: "https://reference.test", clientId: "client-a", fetch: server.fetch });
  });

  it("deduplicates repeated operation IDs and repeated idempotency keys", async () => {
    const first = conformanceChange("operation-1", "deur-1");
    await transport.push({ changes: [first] });
    const operationRetry = await transport.push({ changes: [{ ...first, idempotencyKey: "another-key" }] });
    const keyRetry = await transport.push({ changes: [{ ...first, operationId: "another-operation" }] });

    expect(operationRetry.accepted[0]).toMatchObject({ alreadyAccepted: true, remoteRevision: 1 });
    expect(keyRetry.accepted[0]).toMatchObject({ alreadyAccepted: true, remoteRevision: 1 });
    expect(server.getState()).toMatchObject({ sequence: 1 });
    expect(server.getState().changes).toHaveLength(1);
  });

  it("advances sequential revisions once and rejects future revisions", async () => {
    const created = conformanceChange("create", "deur-1");
    await transport.push({ changes: [created] });
    const update = { ...conformanceChange("update", "deur-1"), operation: "update" as const, baseRemoteRevision: 1 };
    const accepted = await transport.push({ changes: [update] });
    const future = await transport.push({ changes: [{ ...update, operationId: "future", idempotencyKey: "future", baseRemoteRevision: 9 }] });

    expect(accepted.accepted[0].remoteRevision).toBe(2);
    expect(future.rejected[0]).toMatchObject({ operationId: "future", reason: "validation" });
    expect(server.getState().sequence).toBe(2);
  });

  it("returns an explicit stale-revision conflict preserving client and server evidence", async () => {
    const created = conformanceChange("create", "deur-1");
    await transport.push({ changes: [created] });
    const current = { ...conformanceChange("current", "deur-1"), operation: "update" as const, baseRemoteRevision: 1 };
    await transport.push({ changes: [current] });
    const stale = { ...conformanceChange("stale", "deur-1"), operation: "update" as const, baseRemoteRevision: 1 };

    const result = await transport.push({ changes: [stale] });

    expect(result.conflicts[0]).toMatchObject({ operationId: "stale", reason: "stale-local", local: stale });
    expect(result.conflicts[0].remote.operationId).toBe("current");
    expect(server.getState().changes).toHaveLength(2);
  });

  it("rejects unsupported protocols and malformed envelopes at the controller boundary", async () => {
    const unsupported = await server.handle("POST", "/deur-sync/push", { protocolVersion: 2, clientId: "x", changes: [] });
    const malformed = await server.handle("POST", "/deur-sync/push", { protocolVersion: 1, clientId: "x", changes: [{ broken: true }] });
    expect(unsupported.status).toBe(400);
    expect(malformed.status).toBe(400);
  });

  it("resets deterministic state and supports test-only failure simulations", async () => {
    await transport.push({ changes: [conformanceChange("one")] });
    server.reset();
    expect(server.getState()).toMatchObject({ sequence: 0, changes: [] });

    server.failNext("rate-limit");
    expect((await transport.pull({})).transportError).toMatchObject({ classification: "rate-limited" });
    server.failNext("server-error");
    expect((await transport.pull({})).transportError).toMatchObject({ classification: "server" });
    server.failNext("invalid-json");
    expect((await transport.pull({})).transportError).toMatchObject({ classification: "malformed-response" });
    server.failNext("protocol-mismatch");
    expect((await transport.pull({})).transportError).toMatchObject({ classification: "unsupported-protocol" });
  });
});
