// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import type { Pool, PoolClient } from "pg";

import { conformanceChange } from "./server/deurSyncConformance";
import { PostgresDeurSyncServerPersistence } from "./server/postgres/PostgresDeurSyncServerPersistence";

function scriptedPool() {
  const calls: Array<{ text: string; values?: unknown[] }> = [];
  const query = vi.fn(async (text: string, values?: unknown[]) => {
    calls.push({ text, values });
    return { rows: [], rowCount: 0 };
  });
  const release = vi.fn();
  const client = { query, release } as unknown as PoolClient;
  const pool = { connect: vi.fn(async () => client), query: vi.fn(async () => ({ rows: [], rowCount: 0 })) } as unknown as Pool;
  return { pool, calls, release };
}

describe("PostgreSQL DEUR persistence adapter transaction", () => {
  it("uses one parameterized transaction for every acceptance invariant", async () => {
    const fake = scriptedPool();
    const adapter = new PostgresDeurSyncServerPersistence(fake.pool);
    const change = conformanceChange("operation-1", "deur-1");
    change.payload = { id:"deur-1",evidenceMode:"ODOMETER_TRIP",odometerTripEvidence:{checkpoints:[{id:"a",location:"Plant",odometerReading:100}],segments:[],totalDistance:0,tripCount:0} };

    expect(await adapter.accept({ change, expectedRevision: 0 })).toMatchObject({ kind: "accepted", accepted: { remoteRevision: 1 } });

    expect(fake.calls[0].text).toBe("BEGIN");
    expect(fake.calls.at(-1)?.text).toBe("COMMIT");
    expect(fake.calls.some((call) => call.text.includes("pg_advisory_xact_lock"))).toBe(true);
    expect(fake.calls.some((call) => call.text.includes("INSERT INTO deur_sync_accepted_operations"))).toBe(true);
    expect(fake.calls.some((call) => call.text.includes("INSERT INTO deur_sync_entity_state"))).toBe(true);
    expect(fake.calls.some((call) => call.text.includes("INSERT INTO deur_sync_change_log"))).toBe(true);
    expect(fake.calls.filter((call) => call.text.includes("operation-1") || call.text.includes("deur-1"))).toEqual([]);
    expect(fake.calls.some((call) => call.values?.includes("operation-1"))).toBe(true);
    expect(fake.calls.some((call)=>call.values?.some(value=>typeof value==="string"&&value.includes("ODOMETER_TRIP")))).toBe(true);
    expect(fake.release).toHaveBeenCalledOnce();
  });

  it("rolls back and releases the client after an injected pre-commit failure", async () => {
    const fake = scriptedPool();
    const adapter = new PostgresDeurSyncServerPersistence(fake.pool);
    adapter.failNextAcceptance();

    await expect(adapter.accept({ change: conformanceChange("failed", "deur-1"), expectedRevision: 0 })).rejects.toThrow("Simulated PostgreSQL acceptance failure");

    expect(fake.calls.some((call) => call.text === "ROLLBACK")).toBe(true);
    expect(fake.calls.some((call) => call.text === "COMMIT")).toBe(false);
    expect(fake.release).toHaveBeenCalledOnce();
  });
});
