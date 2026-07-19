import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { performance } from "node:perf_hooks";
import type { DeurSyncServerApplication } from "../application/types";
import { handleDeurSyncRequest } from "./controller";

export interface ServerLogger { info(event: Record<string, unknown>): void; error(event: Record<string, unknown>): void }
export interface DeurSyncHttpServerOptions {
  host: string; port: number; bodyLimitBytes: number; service: DeurSyncServerApplication;
  checkReady(): Promise<boolean>; closePersistence?: () => Promise<void>; logger: ServerLogger;
}
export interface StartedServerAddress { host: string; port: number; url: string }
export interface DeurSyncHttpServer { start(): Promise<StartedServerAddress>; stop(): Promise<void> }

class PayloadTooLargeError extends Error {}
function json(response: ServerResponse, status: number, body: unknown): void {
  const value = JSON.stringify(body);
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "content-length": Buffer.byteLength(value) });
  response.end(value);
}
async function readJson(request: IncomingMessage, limit: number): Promise<unknown> {
  const chunks: Buffer[] = []; let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
    size += buffer.length;
    if (size > limit) throw new PayloadTooLargeError();
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export function createDeurSyncHttpServer(options: DeurSyncHttpServerOptions): DeurSyncHttpServer {
  let server: Server | undefined; let started = false; let stopPromise: Promise<void> | undefined;
  const handle = async (request: IncomingMessage, response: ServerResponse) => {
    const began = performance.now(); const method = request.method ?? "GET"; const path = new URL(request.url ?? "/", "http://localhost").pathname;
    let status = 500;
    try {
      if (path === "/health") { status = method === "GET" ? 200 : 405; json(response, status, status === 200 ? { status: "ok", service: "deur-sync" } : { message: "Method not allowed." }); return; }
      if (path === "/ready") {
        if (method !== "GET") { status = 405; json(response, status, { message: "Method not allowed." }); return; }
        const ready = started && await options.checkReady(); status = ready ? 200 : 503;
        json(response, status, ready ? { status: "ready", service: "deur-sync" } : { status: "unavailable", service: "deur-sync" }); return;
      }
      if (path !== "/deur-sync/push" && path !== "/deur-sync/pull") { status = 404; json(response, status, { message: "Endpoint not found." }); return; }
      if (method !== "POST") { status = 405; json(response, status, { message: "Method not allowed." }); return; }
      if (!(request.headers["content-type"] ?? "").toLowerCase().startsWith("application/json")) { status = 415; json(response, status, { message: "Content-Type must be application/json." }); return; }
      const body = await readJson(request, options.bodyLimitBytes);
      const handled = await handleDeurSyncRequest(options.service, method, path, body); status = handled.status; json(response, status, handled.body);
    } catch (error) {
      if (error instanceof PayloadTooLargeError) { status = 413; json(response, status, { message: "Synchronization request body is too large." }); }
      else if (error instanceof SyntaxError) { status = 400; json(response, status, { message: "Malformed request JSON." }); }
      else { status = 500; options.logger.error({ event: "request_error", method, path }); json(response, status, { message: "The synchronization service failed." }); }
    } finally { options.logger.info({ event: "request", method, path, status, durationMs: Math.round(performance.now() - began) }); }
  };
  return {
    async start() {
      if (server) throw new Error("DEUR synchronization server is already started.");
      server = createServer((request, response) => { void handle(request, response); });
      await new Promise<void>((resolve, reject) => { server!.once("error", reject); server!.listen(options.port, options.host, () => { server!.off("error", reject); resolve(); }); });
      started = true;
      const address = server.address(); if (!address || typeof address === "string") throw new Error("Unable to resolve DEUR synchronization server address.");
      return { host: options.host, port: address.port, url: `http://${options.host}:${address.port}` };
    },
    stop() {
      if (stopPromise) return stopPromise;
      stopPromise = (async () => {
        started = false;
        if (server) await new Promise<void>((resolve, reject) => server!.close((error) => error ? reject(error) : resolve()));
        await options.closePersistence?.();
      })();
      return stopPromise;
    },
  };
}
