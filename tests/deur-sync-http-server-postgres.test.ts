// @vitest-environment node
import { Pool } from "pg";
import { describe, expect, it } from "vitest";

import { HttpDeurSyncTransport } from "@/features/rental/deur/synchronization/http/HttpDeurSyncTransport";
import { createDeurSyncServerRuntime } from "../server/deur-sync/createDeurSyncServerRuntime";
import { PostgresDeurSyncServerPersistence } from "../server/deur-sync/postgres/PostgresDeurSyncServerPersistence";
import { runDeurSyncPostgresMigrations } from "../server/deur-sync/postgres/runMigrations";
import { conformanceChange } from "./server/deurSyncConformance";
import { assertSafePostgresTestReset } from "./server/postgres/postgresTestSafety";

const connectionString = process.env.DEUR_SYNC_POSTGRES_TEST_URL;
const allowReset = process.env.DEUR_SYNC_ALLOW_POSTGRES_TEST_RESET === "true";
const live = connectionString ? describe : describe.skip;

live("real-socket PostgreSQL DEUR synchronization", () => {
  it("conforms through HTTP and preserves state across a service restart", async () => {
    assertSafePostgresTestReset(connectionString!, allowReset);
    const logger = { info() {}, error() {} };
    const config = { host: "127.0.0.1", port: 0, postgresUrl: connectionString!, runMigrations: true, logLevel: "silent" as const, bodyLimitBytes: 1_048_576 };
    const pool = new Pool({ connectionString });
    await runDeurSyncPostgresMigrations(pool);
    await new PostgresDeurSyncServerPersistence(pool, { allowDestructiveReset: true }).reset();
    const firstRuntime = await createDeurSyncServerRuntime({ config, pool, logger });
    const firstAddress = await firstRuntime.http.start();
    const clientA = new HttpDeurSyncTransport({ baseUrl: firstAddress.url, clientId: "client-a" });
    const clientB = new HttpDeurSyncTransport({ baseUrl: firstAddress.url, clientId: "client-b" });
    const first = conformanceChange("socket-operation", "socket-deur");
    const second = conformanceChange("socket-second", "socket-second-deur");

    expect((await clientA.push({ changes: [first] })).accepted[0]).toMatchObject({ remoteRevision: 1, alreadyAccepted: false });
    expect((await clientA.push({ changes: [structuredClone(first)] })).accepted[0]).toMatchObject({ remoteRevision: 1, alreadyAccepted: true });
    await clientA.push({ changes: [second] });
    const page = await clientB.pull({ cursor: "0", limit: 1 });
    expect(page).toMatchObject({ cursor: "1", hasMore: true });
    expect(page.changes[0]).toMatchObject({ operationId: "socket-operation", remoteRevision: 1 });
    expect((await pool.query("SELECT 1 FROM deur_sync_accepted_operations WHERE operation_id = $1", [first.operationId])).rowCount).toBe(1);
    expect((await pool.query("SELECT 1 FROM deur_sync_change_log WHERE operation_id = $1", [first.operationId])).rowCount).toBe(1);
    expect((await fetch(`${firstAddress.url}/ready`)).status).toBe(200);
    await firstRuntime.http.stop();

    const secondPool = new Pool({ connectionString });
    const secondRuntime = await createDeurSyncServerRuntime({ config: { ...config, runMigrations: false }, pool: secondPool, logger });
    const secondAddress = await secondRuntime.http.start();
    const restartedClient = new HttpDeurSyncTransport({ baseUrl: secondAddress.url, clientId: "client-c" });
    const restored = await restartedClient.pull({ cursor: "0", limit: 10 });
    expect(restored.changes.map((change) => change.operationId)).toEqual(["socket-operation", "socket-second"]);
    await secondRuntime.http.stop();
  });
});
