import { describe, expect, it, vi } from "vitest";

import { HttpDeurSyncTransport } from "@/features/rental/deur/synchronization/http/HttpDeurSyncTransport";
import type { DeurSyncChangeEnvelope } from "@/features/rental/deur/synchronization/types";

function change(id = "operation-1"): DeurSyncChangeEnvelope {
  return {
    schemaVersion: 1, entity: { type: "DEUR", id: "deur-1" }, operation: "update",
    operationId: id, idempotencyKey: id, localRevision: 1, baseRemoteRevision: 0,
    occurredAt: "2026-07-19T08:00:00.000Z", payload: { id: "deur-1", logs: [] },
  };
}

function httpResponse(status: number, body: unknown, raw = false): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    text: async () => raw ? String(body) : JSON.stringify(body),
  } as Response;
}

function pushBody(overrides: Record<string, unknown> = {}) {
  return {
    protocolVersion: 1, accepted: [], rejected: [], conflicts: [], cursor: "1",
    serverTimestamp: "2026-07-19T08:01:00.000Z", ...overrides,
  };
}

function pullBody(overrides: Record<string, unknown> = {}) {
  return {
    protocolVersion: 1, changes: [], cursor: "0", hasMore: false,
    serverTimestamp: "2026-07-19T08:01:00.000Z", ...overrides,
  };
}

function adapter(fetchImplementation: typeof fetch, options: Record<string, unknown> = {}) {
  return new HttpDeurSyncTransport({
    baseUrl: "https://sync.example.test/api/", clientId: "installation-1", fetch: fetchImplementation,
    ...options,
  });
}

describe("HTTP DEUR synchronization transport", () => {
  it("serializes an immutable versioned push request and maps accepted/idempotent results", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const fetchMock = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ url: String(url), init });
      return httpResponse(200, pushBody({ accepted: [
        { operationId: "operation-1", idempotencyKey: "operation-1", remoteRevision: 4, alreadyAccepted: false },
      ] }));
    });
    const fetchImplementation = fetchMock as unknown as typeof fetch;
    const transport = adapter(fetchImplementation);
    const request = { changes: [change()], cursor: "3" };
    const original = structuredClone(request);

    const accepted = await transport.push(request);

    expect(request).toEqual(original);
    expect(requests[0].url).toBe("https://sync.example.test/api/deur-sync/push");
    expect(JSON.parse(String(requests[0].init?.body))).toEqual({ protocolVersion: 1, clientId: "installation-1", cursor: "3", changes: request.changes });
    expect(accepted.accepted[0]).toMatchObject({ operationId: "operation-1", remoteRevision: 4, alreadyAccepted: false });

    fetchMock.mockResolvedValueOnce(httpResponse(200, pushBody({ accepted: [
      { operationId: "operation-1", idempotencyKey: "operation-1", remoteRevision: 4, alreadyAccepted: true },
    ] })));
    expect((await transport.push(request)).accepted[0].alreadyAccepted).toBe(true);
  });

  it("maps rejected and conflicted push operations without discarding envelope evidence", async () => {
    const local = change("local");
    const remote = { ...change("remote"), remoteRevision: 2 };
    const transport = adapter(vi.fn(async () => httpResponse(409, pushBody({
      rejected: [{ operationId: "rejected", reason: "validation", message: "invalid" }],
      conflicts: [{ operationId: "local", reason: "competing-activity-edit", message: "conflict", local, remote }],
    }))) as typeof fetch);

    const result = await transport.push({ changes: [local] });

    expect(result.rejected[0]).toMatchObject({ operationId: "rejected", reason: "validation" });
    expect(result.conflicts[0]).toMatchObject({ reason: "competing-activity-edit", local, remote });
  });

  it("sends the pull cursor and maps ordered changes, cursor, empty pages, and pagination", async () => {
    const calls: RequestInit[] = [];
    const first = change("first");
    const second = change("second");
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      calls.push(init ?? {});
      return httpResponse(200, pullBody({ changes: [first, second], cursor: "12", hasMore: true }));
    });
    const fetchImplementation = fetchMock as unknown as typeof fetch;
    const transport = adapter(fetchImplementation);

    const page = await transport.pull({ cursor: "10", limit: 2 });
    expect(JSON.parse(String(calls[0].body))).toEqual({ protocolVersion: 1, clientId: "installation-1", cursor: "10", limit: 2 });
    expect(page).toMatchObject({ cursor: "12", hasMore: true });
    expect(page.changes.map((item) => item.operationId)).toEqual(["first", "second"]);
    page.changes[0].operationId = "caller-mutation";
    expect(first.operationId).toBe("first");

    fetchMock.mockResolvedValueOnce(httpResponse(200, pullBody({ cursor: "12" })));
    expect(await transport.pull({ cursor: "12" })).toMatchObject({ changes: [], cursor: "12", hasMore: false });
  });

  it("classifies network, timeout, and independent abort failures", async () => {
    const network = adapter(vi.fn(async () => { throw new TypeError("fetch failed"); }) as typeof fetch);
    expect((await network.pull({})).transportError).toMatchObject({ classification: "network", retryable: true });

    const timeoutFetch = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      if (init?.signal?.aborted) throw new DOMException("aborted", "AbortError");
      throw new Error("expected timeout abort");
    }) as typeof fetch;
    const timeout = adapter(timeoutFetch, {
      timers: { setTimeout: (callback: () => void) => { callback(); return 1; }, clearTimeout: () => undefined },
    });
    expect((await timeout.pull({})).transportError).toMatchObject({ classification: "timeout", retryable: true });

    const aborted = adapter(vi.fn(async () => { throw new DOMException("cancelled", "AbortError"); }) as typeof fetch);
    expect((await aborted.pull({})).transportError).toMatchObject({ classification: "aborted", retryable: false });
  });

  it.each([
    [400, "validation", false],
    [401, "unauthenticated", false],
    [403, "unauthorized", false],
    [404, "unavailable", false],
    [429, "rate-limited", true],
    [500, "server", true],
    [503, "server", true],
  ] as const)("classifies HTTP %i as %s with retryable=%s", async (status, classification, retryable) => {
    const transport = adapter(vi.fn(async () => httpResponse(status, { message: "request failed" })) as typeof fetch);
    expect((await transport.pull({})).transportError).toMatchObject({ classification, retryable });
  });

  it("rejects malformed JSON, unsupported protocol versions, and invalid response schemas", async () => {
    const malformed = adapter(vi.fn(async () => httpResponse(200, "{bad", true)) as typeof fetch);
    expect((await malformed.pull({})).transportError).toMatchObject({ classification: "malformed-response", retryable: false });

    const unsupported = adapter(vi.fn(async () => httpResponse(200, pullBody({ protocolVersion: 2 }))) as typeof fetch);
    expect((await unsupported.pull({})).transportError).toMatchObject({ classification: "unsupported-protocol", retryable: false });

    const invalid = adapter(vi.fn(async () => httpResponse(200, pullBody({ changes: [{ broken: true }] }))) as typeof fetch);
    expect((await invalid.pull({})).transportError).toMatchObject({ classification: "invalid-response", retryable: false });
  });
});
