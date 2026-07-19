import { isDeurSyncEnvelope } from "@/features/rental/deur/synchronization/http/validation";
import { DEUR_SYNC_PROTOCOL_VERSION } from "@/features/rental/deur/synchronization/http/types";
import type {
  DeurAcceptedChange,
  DeurConflictResult,
  DeurRejectedChange,
  DeurSyncChangeEnvelope,
} from "@/features/rental/deur/synchronization/types";

type FailureMode = "server-error" | "rate-limit" | "invalid-json" | "protocol-mismatch";

interface ReferenceServerOptions { now?: () => Date }
interface ControllerResponse { status: number; body: unknown; raw?: boolean }

interface AcceptedRegistryEntry {
  remoteRevision: number;
  change: DeurSyncChangeEnvelope;
}

export interface ReferenceDeurSyncServerState {
  changes: DeurSyncChangeEnvelope[];
  sequence: number;
  operationIds: string[];
  idempotencyKeys: string[];
  entityRevisions: Record<string, number>;
  conflicts: DeurConflictResult[];
}

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function response(status: number, body: unknown, raw = false): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    text: async () => raw ? String(body) : JSON.stringify(body),
  } as Response;
}

export class ReferenceDeurSyncServer {
  private readonly now: () => Date;
  private changes: DeurSyncChangeEnvelope[] = [];
  private operationRegistry = new Map<string, AcceptedRegistryEntry>();
  private idempotencyRegistry = new Map<string, AcceptedRegistryEntry>();
  private entityRevisions = new Map<string, number>();
  private entityChanges = new Map<string, DeurSyncChangeEnvelope>();
  private conflicts: DeurConflictResult[] = [];
  private nextFailure?: FailureMode;

  constructor(options: ReferenceServerOptions = {}) {
    this.now = options.now ?? (() => new Date("2026-07-19T10:00:00.000Z"));
  }

  readonly fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const failure = this.nextFailure;
    this.nextFailure = undefined;
    if (failure === "server-error") return response(500, { message: "Simulated server failure." });
    if (failure === "rate-limit") return response(429, { message: "Simulated rate limit." });
    if (failure === "invalid-json") return response(200, "{invalid", true);
    if (failure === "protocol-mismatch") {
      const path = new URL(String(input)).pathname;
      return response(200, path.endsWith("pull")
        ? { protocolVersion: 2, changes: [], cursor: "0", hasMore: false, serverTimestamp: this.now().toISOString() }
        : { protocolVersion: 2, accepted: [], rejected: [], conflicts: [], cursor: "0", serverTimestamp: this.now().toISOString() });
    }

    let body: unknown;
    try { body = init?.body ? JSON.parse(String(init.body)) as unknown : undefined; }
    catch { return response(400, { message: "Malformed request JSON." }); }
    const handled = await this.handle(init?.method ?? "GET", new URL(String(input)).pathname, body);
    return response(handled.status, handled.body, handled.raw);
  };

  async handle(method: string, path: string, body: unknown): Promise<ControllerResponse> {
    if (method !== "POST") return { status: 405, body: { message: "Method not allowed." } };
    if (path === "/deur-sync/push") return this.push(body);
    if (path === "/deur-sync/pull") return this.pull(body);
    return { status: 404, body: { message: "Endpoint not found." } };
  }

  reset(): void {
    this.changes = [];
    this.operationRegistry.clear();
    this.idempotencyRegistry.clear();
    this.entityRevisions.clear();
    this.entityChanges.clear();
    this.conflicts = [];
    this.nextFailure = undefined;
  }

  failNext(mode: FailureMode): void { this.nextFailure = mode; }

  getState(): ReferenceDeurSyncServerState {
    return {
      changes: structuredClone(this.changes),
      sequence: this.changes.length,
      operationIds: [...this.operationRegistry.keys()],
      idempotencyKeys: [...this.idempotencyRegistry.keys()],
      entityRevisions: Object.fromEntries(this.entityRevisions),
      conflicts: structuredClone(this.conflicts),
    };
  }

  private push(value: unknown): ControllerResponse {
    if (!object(value) || value.protocolVersion !== DEUR_SYNC_PROTOCOL_VERSION || typeof value.clientId !== "string" || !Array.isArray(value.changes)) {
      return { status: 400, body: { message: "Invalid push request." } };
    }
    if (!value.changes.every(isDeurSyncEnvelope)) return { status: 400, body: { message: "Malformed DEUR envelope." } };

    const accepted: DeurAcceptedChange[] = [];
    const rejected: DeurRejectedChange[] = [];
    const conflicts: DeurConflictResult[] = [];
    for (const input of value.changes) {
      const change = structuredClone(input);
      const prior = this.operationRegistry.get(change.operationId) ?? this.idempotencyRegistry.get(change.idempotencyKey);
      if (prior) {
        accepted.push({
          operationId: change.operationId,
          idempotencyKey: change.idempotencyKey,
          remoteRevision: prior.remoteRevision,
          alreadyAccepted: true,
        });
        continue;
      }

      const currentRevision = this.entityRevisions.get(change.entity.id) ?? 0;
      if (change.baseRemoteRevision > currentRevision) {
        rejected.push({ operationId: change.operationId, reason: "validation", message: "The base remote revision is in the future." });
        continue;
      }
      if (change.baseRemoteRevision < currentRevision) {
        const remote = this.entityChanges.get(change.entity.id);
        if (!remote) {
          rejected.push({ operationId: change.operationId, reason: "validation", message: "Server revision evidence is unavailable." });
          continue;
        }
        const conflict: DeurConflictResult = {
          operationId: change.operationId,
          reason: "stale-local",
          message: "The submitted DEUR revision is stale.",
          local: change,
          remote: structuredClone(remote),
        };
        conflicts.push(conflict);
        this.conflicts.push(structuredClone(conflict));
        continue;
      }

      const remoteRevision = currentRevision + 1;
      const stored = { ...change, remoteRevision };
      const registry = { remoteRevision, change: structuredClone(stored) };
      this.changes.push(structuredClone(stored));
      this.operationRegistry.set(change.operationId, registry);
      this.idempotencyRegistry.set(change.idempotencyKey, registry);
      this.entityRevisions.set(change.entity.id, remoteRevision);
      this.entityChanges.set(change.entity.id, structuredClone(stored));
      accepted.push({ operationId: change.operationId, idempotencyKey: change.idempotencyKey, remoteRevision, alreadyAccepted: false });
    }

    return {
      status: conflicts.length > 0 && accepted.length === 0 ? 409 : 200,
      body: {
        protocolVersion: DEUR_SYNC_PROTOCOL_VERSION,
        accepted,
        rejected,
        conflicts,
        cursor: String(this.changes.length),
        serverTimestamp: this.now().toISOString(),
      },
    };
  }

  private pull(value: unknown): ControllerResponse {
    if (!object(value) || value.protocolVersion !== DEUR_SYNC_PROTOCOL_VERSION || typeof value.clientId !== "string") {
      return { status: 400, body: { message: "Invalid pull request." } };
    }
    const rawCursor = value.cursor ?? "0";
    if (typeof rawCursor !== "string" || !/^\d+$/.test(rawCursor)) return { status: 400, body: { message: "Invalid synchronization cursor." } };
    const cursor = Number(rawCursor);
    if (!Number.isSafeInteger(cursor) || cursor < 0 || cursor > this.changes.length) return { status: 400, body: { message: "Invalid synchronization cursor." } };
    const rawLimit = value.limit ?? this.changes.length;
    if (typeof rawLimit !== "number" || !Number.isSafeInteger(rawLimit) || rawLimit < 0) return { status: 400, body: { message: "Invalid pull limit." } };
    const changes = this.changes.slice(cursor, cursor + rawLimit).map((change) => structuredClone(change));
    const nextCursor = cursor + changes.length;
    return {
      status: 200,
      body: {
        protocolVersion: DEUR_SYNC_PROTOCOL_VERSION,
        changes,
        cursor: String(nextCursor),
        hasMore: nextCursor < this.changes.length,
        serverTimestamp: this.now().toISOString(),
      },
    };
  }
}
