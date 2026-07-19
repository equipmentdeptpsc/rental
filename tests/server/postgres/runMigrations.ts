import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Pool } from "pg";

export async function runDeurSyncPostgresMigrations(pool: Pool): Promise<void> {
  const migration = await readFile(resolve("tests/server/postgres/migrations/001_deur_sync.sql"), "utf8");
  await pool.query(migration);
}
