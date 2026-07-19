// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import { createDeurSyncServerRuntime } from "../server/deur-sync/createDeurSyncServerRuntime";

describe("DEUR sync server runtime composition", () => {
  it("runs optional migrations, verifies schema, composes persistence, and closes the pool", async () => {
    const query = vi.fn(async () => ({ rows: [{ available: true }] }));
    const end = vi.fn(async () => undefined);
    const migrate = vi.fn(async () => undefined);
    const runtime = await createDeurSyncServerRuntime({
      config: { host: "127.0.0.1", port: 0, postgresUrl: "postgres://local/test", runMigrations: true, logLevel: "silent", bodyLimitBytes: 1024 },
      pool: { query, end } as never, migrate, logger: { info: vi.fn(), error: vi.fn() },
    });

    expect(migrate).toHaveBeenCalledOnce();
    expect(runtime.persistence.constructor.name).toBe("PostgresDeurSyncServerPersistence");
    const address = await runtime.http.start();
    expect((await fetch(`${address.url}/ready`)).status).toBe(200);
    await runtime.http.stop();
    expect(end).toHaveBeenCalledOnce();
  });

  it("does not migrate when disabled and reports missing schema as not ready", async () => {
    const migrate = vi.fn(async () => undefined);
    const runtime = await createDeurSyncServerRuntime({
      config: { host: "127.0.0.1", port: 0, postgresUrl: "postgres://local/test", runMigrations: false, logLevel: "silent", bodyLimitBytes: 1024 },
      pool: { query: vi.fn(async () => ({ rows: [{ available: false }] })), end: vi.fn(async () => undefined) } as never,
      migrate, logger: { info: vi.fn(), error: vi.fn() },
    });
    expect(migrate).not.toHaveBeenCalled();
    const address = await runtime.http.start();
    expect((await fetch(`${address.url}/ready`)).status).toBe(503);
    await runtime.http.stop();
  });
});
