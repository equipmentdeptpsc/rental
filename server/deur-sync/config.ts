export interface DeurSyncServerConfig {
  host: string;
  port: number;
  postgresUrl: string;
  runMigrations: boolean;
  logLevel: "silent" | "info";
  bodyLimitBytes: number;
}

function integer(value: string | undefined, fallback: number, label: string, minimum: number, maximum: number): number {
  const parsed = value === undefined ? fallback : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) throw new Error(`Invalid DEUR synchronization server ${label}.`);
  return parsed;
}

export function parseDeurSyncServerConfig(environment: Record<string, string | undefined>): DeurSyncServerConfig {
  const postgresUrl = environment.DEUR_SYNC_POSTGRES_URL?.trim();
  if (!postgresUrl) throw new Error("DEUR_SYNC_POSTGRES_URL is required for the local DEUR synchronization server.");
  try {
    const url = new URL(postgresUrl);
    if (!["postgres:", "postgresql:"].includes(url.protocol)) throw new Error();
  } catch { throw new Error("DEUR_SYNC_POSTGRES_URL must be a valid PostgreSQL URL."); }
  const host = environment.DEUR_SYNC_SERVER_HOST?.trim() || "127.0.0.1";
  if (/\s|\//.test(host)) throw new Error("Invalid DEUR synchronization server host.");
  const logLevel = environment.DEUR_SYNC_LOG_LEVEL ?? "info";
  if (logLevel !== "info" && logLevel !== "silent") throw new Error("Invalid DEUR synchronization log level.");
  const migrationSetting = environment.DEUR_SYNC_RUN_MIGRATIONS;
  if (migrationSetting !== undefined && migrationSetting !== "true" && migrationSetting !== "false") throw new Error("Invalid DEUR synchronization migration setting.");
  return {
    host,
    port: integer(environment.DEUR_SYNC_SERVER_PORT, 8787, "port", 1, 65_535),
    postgresUrl,
    runMigrations: migrationSetting === "true",
    logLevel,
    bodyLimitBytes: integer(environment.DEUR_SYNC_BODY_LIMIT_BYTES, 1_048_576, "body limit", 1_024, 10_485_760),
  };
}
