import { DeurSyncServerService } from "./application/DeurSyncServerService";
import type { DeurSyncServerApplication } from "./application/types";
import { InMemoryDeurSyncServerPersistence, type InMemoryServerSnapshot } from "./persistence/InMemoryDeurSyncServerPersistence";
import { handleDeurSyncRequest } from "../../server/deur-sync/http/controller";

type FailureMode = "server-error" | "rate-limit" | "invalid-json" | "protocol-mismatch";
interface ReferenceServerOptions {
  now?: () => Date;
  service?: DeurSyncServerApplication;
  persistence?: InMemoryDeurSyncServerPersistence;
}

function response(status: number, body: unknown, raw = false): Response {
  return { status, ok: status >= 200 && status < 300, text: async () => raw ? String(body) : JSON.stringify(body) } as Response;
}

export class ReferenceDeurSyncServer {
  private readonly persistence?: InMemoryDeurSyncServerPersistence;
  private readonly service: DeurSyncServerApplication;
  private readonly now: () => Date;
  private nextFailure?: FailureMode;

  constructor(options: ReferenceServerOptions = {}) {
    this.now = options.now ?? (() => new Date("2026-07-19T10:00:00.000Z"));
    this.persistence = options.service ? options.persistence : options.persistence ?? new InMemoryDeurSyncServerPersistence();
    this.service = options.service ?? new DeurSyncServerService(this.persistence!, this.now);
  }

  readonly fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const failure = this.nextFailure; this.nextFailure = undefined;
    if (failure === "server-error") return response(500, { message: "Simulated server failure." });
    if (failure === "rate-limit") return response(429, { message: "Simulated rate limit." });
    if (failure === "invalid-json") return response(200, "{invalid", true);
    if (failure === "protocol-mismatch") {
      const pull = new URL(String(input)).pathname.endsWith("pull");
      return response(200, pull
        ? { protocolVersion: 2, changes: [], cursor: "0", hasMore: false, serverTimestamp: this.now().toISOString() }
        : { protocolVersion: 2, accepted: [], rejected: [], conflicts: [], cursor: "0", serverTimestamp: this.now().toISOString() });
    }
    let body: unknown;
    try { body = init?.body ? JSON.parse(String(init.body)) as unknown : undefined; }
    catch { return response(400, { message: "Malformed request JSON." }); }
    const handled = await this.handle(init?.method ?? "GET", new URL(String(input)).pathname, body);
    return response(handled.status, handled.body);
  };

  async handle(method: string, path: string, value: unknown) { return handleDeurSyncRequest(this.service, method, path, value); }

  reset(): void { this.persistence?.reset(); this.nextFailure = undefined; }
  failNext(mode: FailureMode): void { this.nextFailure = mode; }
  getState(): InMemoryServerSnapshot {
    if (!this.persistence) throw new Error("State inspection requires the in-memory persistence adapter.");
    return this.persistence.snapshot();
  }
}
