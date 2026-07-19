import { readFile } from "node:fs/promises";
import type { Pool } from "pg";

export async function runDeurSyncPostgresMigrations(pool: Pool): Promise<void> {
  const migration = await readFile(new URL("./migrations/001_deur_sync.sql", import.meta.url), "utf8");
  await pool.query(migration);
}
