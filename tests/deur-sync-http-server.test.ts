// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

import { parseDeurSyncServerConfig } from "../server/deur-sync/config";
import { createDeurSyncHttpServer, type DeurSyncHttpServer } from "../server/deur-sync/http/createDeurSyncHttpServer";
import type { DeurSyncServerApplication } from "../server/deur-sync/application/types";
import { DeurSyncServerService } from "../server/deur-sync/application/DeurSyncServerService";
import { InMemoryDeurSyncServerPersistence } from "../server/deur-sync/persistence/InMemoryDeurSyncServerPersistence";
import { conformanceChange } from "./server/deurSyncConformance";

const resultTime = "2026-07-19T10:00:00.000Z";
const service: DeurSyncServerApplication = {
  push: vi.fn(async () => ({ accepted: [], rejected: [], conflicts: [], cursor: "0", serverTimestamp: resultTime })),
  pull: vi.fn(async () => ({ changes: [], cursor: "0", hasMore: false, serverTimestamp: resultTime })),
};

describe("DEUR sync server configuration", () => {
  it("requires PostgreSQL and validates ports without exposing credentials", () => {
    expect(() => parseDeurSyncServerConfig({})).toThrow("DEUR_SYNC_POSTGRES_URL");
    expect(() => parseDeurSyncServerConfig({ DEUR_SYNC_POSTGRES_URL: "postgres://user:secret@localhost/test", DEUR_SYNC_SERVER_PORT: "0" })).toThrow("port");
    expect(() => parseDeurSyncServerConfig({ DEUR_SYNC_POSTGRES_URL: "postgres://localhost/test", DEUR_SYNC_RUN_MIGRATIONS: "yes" })).toThrow("migration");
    try { parseDeurSyncServerConfig({ DEUR_SYNC_POSTGRES_URL: "postgres://user:secret@localhost/test", DEUR_SYNC_SERVER_PORT: "70000" }); }
    catch (error) { expect((error as Error).message).not.toContain("secret"); }
  });
});

describe("Node HTTP DEUR sync routes", () => {
  let server: DeurSyncHttpServer | undefined;
  afterEach(async () => { await server?.stop(); server = undefined; vi.clearAllMocks(); });

  async function start(options: { ready?: () => Promise<boolean>; bodyLimitBytes?: number; application?: DeurSyncServerApplication; close?: () => Promise<void> } = {}) {
    server = createDeurSyncHttpServer({
      host: "127.0.0.1", port: 0, bodyLimitBytes: options.bodyLimitBytes ?? 1024,
      service: options.application ?? service, checkReady: options.ready ?? (async () => true), closePersistence: options.close,
      logger: { info: vi.fn(), error: vi.fn() },
    });
    return server.start();
  }

  it("binds an ephemeral port; health is database-independent and ready reflects schema health", async () => {
    const ready = vi.fn(async () => false);
    const address = await start({ ready });
    const health = await fetch(`${address.url}/health`);
    expect(health.status).toBe(200);
    expect(await health.json()).toEqual({ status: "ok", service: "deur-sync" });
    expect(ready).not.toHaveBeenCalled();
    expect((await fetch(`${address.url}/ready`)).status).toBe(503);
    ready.mockResolvedValue(true);
    expect((await fetch(`${address.url}/ready`)).status).toBe(200);
  });

  it("maps push, pull, malformed protocol, routes, methods, and body limits safely", async () => {
    const address = await start({ bodyLimitBytes: 256 });
    const post = (path: string, body: string, contentType = "application/json") => fetch(`${address.url}${path}`, { method: "POST", headers: { "content-type": contentType }, body });
    expect((await post("/deur-sync/push", JSON.stringify({ protocolVersion: 1, clientId: "a", changes: [] }))).status).toBe(200);
    expect((await post("/deur-sync/pull", JSON.stringify({ protocolVersion: 1, clientId: "b", cursor: "0" }))).status).toBe(200);
    expect((await post("/deur-sync/push", "{bad")).status).toBe(400);
    expect((await post("/deur-sync/push", JSON.stringify({ protocolVersion: 2, clientId: "a", changes: [] }))).status).toBe(400);
    expect((await post("/deur-sync/push", "{}", "text/plain")).status).toBe(415);
    expect((await post("/missing", "{}")).status).toBe(404);
    expect((await fetch(`${address.url}/deur-sync/push`)).status).toBe(405);
    expect((await post("/deur-sync/push", JSON.stringify({ padding: "x".repeat(300) }))).status).toBe(413);
  });

  it("preserves acceptance, replay, paging, stale conflict, and future rejection over a real socket", async () => {
    const application = new DeurSyncServerService(new InMemoryDeurSyncServerPersistence(), () => new Date(resultTime));
    const address = await start({ application });
    const post = (path: string, body: unknown) => fetch(`${address.url}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const change = conformanceChange("socket-one", "socket-deur");
    const accepted = await post("/deur-sync/push", { protocolVersion: 1, clientId: "a", changes: [change] });
    expect(await accepted.json()).toMatchObject({ accepted: [{ remoteRevision: 1, alreadyAccepted: false }] });
    expect(await (await post("/deur-sync/push", { protocolVersion: 1, clientId: "a", changes: [change] })).json()).toMatchObject({ accepted: [{ alreadyAccepted: true }] });
    await post("/deur-sync/push", { protocolVersion: 1, clientId: "a", changes: [conformanceChange("socket-two", "other-deur")] });
    expect(await (await post("/deur-sync/pull", { protocolVersion: 1, clientId: "b", cursor: "0", limit: 1 })).json()).toMatchObject({ cursor: "1", hasMore: true });
    const stale = { ...conformanceChange("socket-stale", "socket-deur"), operation: "update", baseRemoteRevision: 0 };
    expect((await post("/deur-sync/push", { protocolVersion: 1, clientId: "b", changes: [stale] })).status).toBe(409);
    const future = { ...conformanceChange("socket-future", "socket-deur"), operation: "update", baseRemoteRevision: 9 };
    expect(await (await post("/deur-sync/push", { protocolVersion: 1, clientId: "b", changes: [future] })).json()).toMatchObject({ rejected: [{ reason: "validation" }] });
  });

  it("sanitizes unexpected errors and makes repeated shutdown safe", async () => {
    const close = vi.fn(async () => undefined);
    const failing: DeurSyncServerApplication = { ...service, push: vi.fn(async () => { throw new Error("SQL secret stack"); }) };
    const address = await start({ application: failing, close });
    const response = await fetch(`${address.url}/deur-sync/push`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ protocolVersion: 1, clientId: "a", changes: [] }) });
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("SQL secret stack");
    await server!.stop();
    await server!.stop();
    expect(close).toHaveBeenCalledOnce();
    await expect(fetch(`${address.url}/health`)).rejects.toThrow();
  });
});
