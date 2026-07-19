import { isDeurSyncEnvelope } from "@/features/rental/deur/synchronization/http/validation";
import { DEUR_SYNC_PROTOCOL_VERSION } from "@/features/rental/deur/synchronization/http/types";
import { DeurSyncServerService, DeurSyncServerValidationError } from "./application/DeurSyncServerService";
import type { DeurSyncServerApplication } from "./application/types";
import { InMemoryDeurSyncServerPersistence, type InMemoryServerSnapshot } from "./persistence/InMemoryDeurSyncServerPersistence";

type FailureMode = "server-error" | "rate-limit" | "invalid-json" | "protocol-mismatch";
interface ControllerResponse { status: number; body: unknown; raw?: boolean }
interface ReferenceServerOptions {
  now?: () => Date;
  service?: DeurSyncServerApplication;
  persistence?: InMemoryDeurSyncServerPersistence;
}

function object(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
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
    return response(handled.status, handled.body, handled.raw);
  };

  async handle(method: string, path: string, value: unknown): Promise<ControllerResponse> {
    if (method !== "POST") return { status: 405, body: { message: "Method not allowed." } };
    if (path !== "/deur-sync/push" && path !== "/deur-sync/pull") return { status: 404, body: { message: "Endpoint not found." } };
    if (!object(value) || value.protocolVersion !== DEUR_SYNC_PROTOCOL_VERSION || typeof value.clientId !== "string") return { status: 400, body: { message: "Invalid synchronization request." } };
    try {
      if (path === "/deur-sync/push") {
        if (!Array.isArray(value.changes) || !value.changes.every(isDeurSyncEnvelope) || (value.cursor !== undefined && typeof value.cursor !== "string")) return { status: 400, body: { message: "Malformed DEUR push request." } };
        const result = await this.service.push({ clientId: value.clientId, changes: structuredClone(value.changes), cursor: value.cursor as string | undefined });
        return { status: result.conflicts.length > 0 && result.accepted.length === 0 ? 409 : 200, body: { protocolVersion: 1, ...result } };
      }
      if ((value.cursor !== undefined && typeof value.cursor !== "string") || (value.limit !== undefined && typeof value.limit !== "number")) return { status: 400, body: { message: "Malformed DEUR pull request." } };
      const result = await this.service.pull({ clientId: value.clientId, cursor: value.cursor as string | undefined, limit: value.limit as number | undefined });
      return { status: 200, body: { protocolVersion: 1, ...result } };
    } catch (error) {
      if (error instanceof DeurSyncServerValidationError) return { status: 400, body: { message: error.message } };
      throw error;
    }
  }

  reset(): void { this.persistence?.reset(); this.nextFailure = undefined; }
  failNext(mode: FailureMode): void { this.nextFailure = mode; }
  getState(): InMemoryServerSnapshot {
    if (!this.persistence) throw new Error("State inspection requires the in-memory persistence adapter.");
    return this.persistence.snapshot();
  }
}
