import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migrationPath = resolve("tests/server/postgres/migrations/001_deur_sync.sql");

describe("PostgreSQL DEUR synchronization schema", () => {
  it("defines durable invariant tables, uniqueness, JSONB evidence, and ordered cursors", () => {
    const sql = readFileSync(migrationPath, "utf8");

    expect(sql).toContain("CREATE TABLE IF NOT EXISTS deur_sync_accepted_operations");
    expect(sql).toContain("operation_id text PRIMARY KEY");
    expect(sql).toContain("idempotency_key text NOT NULL UNIQUE");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS deur_sync_entity_state");
    expect(sql).toContain("entity_id text PRIMARY KEY");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS deur_sync_change_log");
    expect(sql).toContain("GENERATED ALWAYS AS IDENTITY");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS deur_sync_conflicts");
    expect(sql.match(/jsonb/g)?.length).toBeGreaterThanOrEqual(5);
    expect(sql).not.toMatch(/password|postgres:\/\//i);
  });
});
