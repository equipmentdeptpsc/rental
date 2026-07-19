import { parseDeurSyncServerConfig } from "./deur-sync/config";
import { createDeurSyncServerRuntime } from "./deur-sync/createDeurSyncServerRuntime";
import { createDeurSyncLogger } from "./deur-sync/logger";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export async function runLocalDeurSyncServer(environment: NodeJS.ProcessEnv = process.env): Promise<() => Promise<void>> {
  const config = parseDeurSyncServerConfig(environment);
  const logger = createDeurSyncLogger(config.logLevel);
  const runtime = await createDeurSyncServerRuntime({ config, logger });
  const address = await runtime.http.start();
  logger.info({ event: "startup", service: "deur-sync", mode: "local-development", host: address.host, port: address.port });
  let stopping: Promise<void> | undefined;
  return () => stopping ??= runtime.http.stop().then(() => { logger.info({ event: "shutdown", service: "deur-sync" }); });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const stop = await runLocalDeurSyncServer();
  const shutdown = () => { void stop().then(() => { process.exitCode = 0; }); };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}
