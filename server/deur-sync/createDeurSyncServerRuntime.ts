import { Pool } from "pg";
import { DeurSyncServerService } from "./application/DeurSyncServerService";
import type { DeurSyncServerConfig } from "./config";
import { createDeurSyncHttpServer, type DeurSyncHttpServer, type ServerLogger } from "./http/createDeurSyncHttpServer";
import { createDeurSyncLogger } from "./logger";
import { PostgresDeurSyncServerPersistence } from "./postgres/PostgresDeurSyncServerPersistence";
import { runDeurSyncPostgresMigrations } from "./postgres/runMigrations";

const requiredTables = ["deur_sync_accepted_operations", "deur_sync_entity_state", "deur_sync_change_log", "deur_sync_conflicts"];
export interface DeurSyncServerRuntime {
  http: DeurSyncHttpServer;
  service: DeurSyncServerService;
  persistence: PostgresDeurSyncServerPersistence;
  pool: Pool;
}
interface RuntimeDependencies {
  config: DeurSyncServerConfig;
  pool?: Pool;
  migrate?: typeof runDeurSyncPostgresMigrations;
  logger?: ServerLogger;
}

async function schemaAvailable(pool: Pool): Promise<boolean> {
  const result = await pool.query<{ available: boolean }>(
    `SELECT $1::text[] <@ ARRAY(
       SELECT relname::text FROM pg_class WHERE relkind = 'r' AND relnamespace = current_schema()::regnamespace
     ) AS available`, [requiredTables],
  );
  return result.rows[0]?.available === true;
}

export async function createDeurSyncServerRuntime(dependencies: RuntimeDependencies): Promise<DeurSyncServerRuntime> {
  const { config } = dependencies;
  const pool = dependencies.pool ?? new Pool({ connectionString: config.postgresUrl });
  const logger = dependencies.logger ?? createDeurSyncLogger(config.logLevel);
  try {
    if (config.runMigrations) await (dependencies.migrate ?? runDeurSyncPostgresMigrations)(pool);
  } catch (error) {
    await pool.end();
    logger.error({ event: "migration_failed" });
    throw new Error("DEUR synchronization database migration failed.", { cause: error });
  }
  const persistence = new PostgresDeurSyncServerPersistence(pool);
  const service = new DeurSyncServerService(persistence);
  try { await schemaAvailable(pool); }
  catch { logger.error({ event: "startup_schema_verification_failed" }); }
  const checkReady = async () => {
    try { await pool.query("SELECT 1"); return await schemaAvailable(pool); }
    catch { logger.error({ event: "readiness_failed" }); return false; }
  };
  const http = createDeurSyncHttpServer({
    host: config.host, port: config.port, bodyLimitBytes: config.bodyLimitBytes, service, checkReady,
    closePersistence: () => pool.end(), logger,
  });
  return { http, service, persistence, pool };
}
