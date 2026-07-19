import type { ServerLogger } from "./http/createDeurSyncHttpServer";

export function createDeurSyncLogger(level: "silent" | "info"): ServerLogger {
  return {
    info(event) { if (level === "info") console.info(JSON.stringify(event)); },
    error(event) { if (level === "info") console.error(JSON.stringify(event)); },
  };
}
