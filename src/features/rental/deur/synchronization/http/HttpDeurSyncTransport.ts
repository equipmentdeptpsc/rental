import type {
  DeurPullRequest,
  DeurPullResult,
  DeurPushRequest,
  DeurPushResult,
  DeurRemoteSyncTransport,
  DeurTransportError,
  DeurTransportErrorClassification,
} from "../types";
import { DEUR_SYNC_PROTOCOL_VERSION, type DeurHttpPullRequest, type DeurHttpPushRequest } from "./types";
import { validatePullResponse, validatePushResponse } from "./validation";

interface TimeoutPort {
  setTimeout(callback: () => void, milliseconds: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface HttpDeurSyncTransportOptions {
  baseUrl: string;
  clientId: string;
  fetch?: typeof fetch;
  timeoutMilliseconds?: number;
  pushPath?: string;
  pullPath?: string;
  timers?: TimeoutPort;
}

type JsonRequestResult =
  | { success: true; status: number; value: unknown }
  | { success: false; error: DeurTransportError };

function error(classification: DeurTransportErrorClassification, message: string, retryable: boolean): DeurTransportError {
  return { classification, message, retryable };
}

function httpError(status: number): DeurTransportError {
  if (status === 400) return error("validation", "The synchronization request was rejected.", false);
  if (status === 401) return error("unauthenticated", "Synchronization authentication is required.", false);
  if (status === 403) return error("unauthorized", "Synchronization access was denied.", false);
  if (status === 404) return error("unavailable", "The synchronization endpoint is unavailable.", false);
  if (status === 409) return error("conflict", "The synchronization request conflicted with remote state.", false);
  if (status === 429) return error("rate-limited", "The synchronization service is rate limited.", true);
  if (status >= 500 && status <= 599) return error("server", "The synchronization service failed.", true);
  return error("unknown", `Synchronization failed with HTTP ${status}.`, false);
}

function isAbortError(value: unknown): boolean {
  return typeof value === "object" && value !== null && "name" in value && value.name === "AbortError";
}

export class HttpDeurSyncTransport implements DeurRemoteSyncTransport {
  private readonly fetchImplementation: typeof fetch;
  private readonly timers: TimeoutPort;
  private readonly baseUrl: string;
  private readonly timeoutMilliseconds: number;
  private readonly pushPath: string;
  private readonly pullPath: string;

  constructor(private readonly options: HttpDeurSyncTransportOptions) {
    if (!options.baseUrl.trim()) throw new Error("A DEUR synchronization base URL is required.");
    if (!options.clientId.trim()) throw new Error("A DEUR synchronization client ID is required.");
    this.fetchImplementation = options.fetch ?? fetch;
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.timeoutMilliseconds = options.timeoutMilliseconds ?? 10_000;
    this.pushPath = options.pushPath ?? "/deur-sync/push";
    this.pullPath = options.pullPath ?? "/deur-sync/pull";
    this.timers = options.timers ?? {
      setTimeout: (callback, milliseconds) => globalThis.setTimeout(callback, milliseconds),
      clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
    };
  }

  async push(request: DeurPushRequest): Promise<DeurPushResult> {
    const wireRequest: DeurHttpPushRequest = {
      protocolVersion: DEUR_SYNC_PROTOCOL_VERSION,
      clientId: this.options.clientId,
      cursor: request.cursor,
      changes: structuredClone(request.changes),
    };
    const response = await this.request(this.pushPath, wireRequest);
    const fallbackCursor = request.cursor ?? "0";
    if (!response.success) return { accepted: [], rejected: [], conflicts: [], cursor: fallbackCursor, transportError: response.error };
    const validated = validatePushResponse(response.value);
    if (!validated) {
      const classification = this.protocolClassification(response.value);
      return { accepted: [], rejected: [], conflicts: [], cursor: fallbackCursor, transportError: classification };
    }
    if (!response.status.toString().startsWith("2") && response.status !== 409) {
      return { accepted: [], rejected: [], conflicts: [], cursor: fallbackCursor, transportError: httpError(response.status) };
    }
    return {
      accepted: structuredClone(validated.accepted), rejected: structuredClone(validated.rejected),
      conflicts: structuredClone(validated.conflicts), cursor: validated.cursor ?? fallbackCursor,
    };
  }

  async pull(request: DeurPullRequest): Promise<DeurPullResult> {
    const wireRequest: DeurHttpPullRequest = {
      protocolVersion: DEUR_SYNC_PROTOCOL_VERSION,
      clientId: this.options.clientId,
      cursor: request.cursor,
      limit: request.limit,
    };
    const response = await this.request(this.pullPath, wireRequest);
    const fallbackCursor = request.cursor ?? "0";
    if (!response.success) return { changes: [], cursor: fallbackCursor, hasMore: false, transportError: response.error };
    if (!response.status.toString().startsWith("2")) return { changes: [], cursor: fallbackCursor, hasMore: false, transportError: httpError(response.status) };
    const validated = validatePullResponse(response.value);
    if (!validated) return { changes: [], cursor: fallbackCursor, hasMore: false, transportError: this.protocolClassification(response.value) };
    return { changes: structuredClone(validated.changes), cursor: validated.cursor, hasMore: validated.hasMore };
  }

  private protocolClassification(value: unknown): DeurTransportError {
    if (typeof value === "object" && value !== null && "protocolVersion" in value && typeof value.protocolVersion === "number" && value.protocolVersion !== DEUR_SYNC_PROTOCOL_VERSION) {
      return error("unsupported-protocol", "The synchronization protocol version is unsupported.", false);
    }
    return error("invalid-response", "The synchronization response schema is invalid.", false);
  }

  private async request(path: string, body: DeurHttpPushRequest | DeurHttpPullRequest): Promise<JsonRequestResult> {
    const controller = new AbortController();
    let timedOut = false;
    const timeout = this.timers.setTimeout(() => { timedOut = true; controller.abort(); }, this.timeoutMilliseconds);
    try {
      const response = await this.fetchImplementation(`${this.baseUrl}${path.startsWith("/") ? path : `/${path}`}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(structuredClone(body)),
        signal: controller.signal,
      });
      const text = await response.text();
      let value: unknown;
      try { value = text ? JSON.parse(text) as unknown : {}; }
      catch { return { success: false, error: error("malformed-response", "The synchronization service returned malformed JSON.", false) }; }
      if (!response.ok && response.status !== 409) return { success: false, error: httpError(response.status) };
      return { success: true, status: response.status, value };
    } catch (caught) {
      if (isAbortError(caught)) return { success: false, error: timedOut
        ? error("timeout", "The synchronization request timed out.", true)
        : error("aborted", "The synchronization request was aborted.", false) };
      return { success: false, error: error("network", caught instanceof Error ? caught.message : "The synchronization network request failed.", true) };
    } finally {
      this.timers.clearTimeout(timeout);
    }
  }
}
