import { beforeEach, describe, expect, it } from "vitest";

import { storage } from "@/core/storage";
import { deurSyncQueue } from "@/features/rental/deur/offline/deurSyncQueue";
import { processDeurSyncQueue } from "@/features/rental/deur/offline/syncCoordinator";
import { createQueueTransportAdapter } from "@/features/rental/deur/synchronization/createQueueTransportAdapter";
import type { DeurSyncChangeEnvelope } from "@/features/rental/deur/synchronization/types";
import { InMemoryDeurSyncTransport } from "./fakes/InMemoryDeurSyncTransport";

const QUEUE_KEY = "equipment-rental-deur-sync-queue";

function change(id: string, revision = 1): DeurSyncChangeEnvelope {
  return {
    schemaVersion: 1,
    entity: { type: "DEUR", id: "deur-1" },
    operation: "update",
    operationId: id,
    idempotencyKey: id,
    localRevision: revision,
    baseRemoteRevision: 0,
    occurredAt: "2026-07-19T08:00:00.000Z",
    payload: { id: "deur-1", logs: [] },
  };
}

describe("backend-independent DEUR transport", () => {
  beforeEach(() => storage.remove(QUEUE_KEY));

  it("accepts a push once and makes an idempotent retry observable without duplication", async () => {
    const transport = new InMemoryDeurSyncTransport();
    const envelope = change("operation-1");
    const original = structuredClone(envelope);

    const first = await transport.push({ changes: [envelope] });
    const retry = await transport.push({ changes: [structuredClone(envelope)] });

    expect(first.accepted).toHaveLength(1);
    expect(retry.accepted).toHaveLength(1);
    expect(retry.accepted[0].alreadyAccepted).toBe(true);
    expect(transport.getStoredChanges()).toHaveLength(1);
    expect(envelope).toEqual(original);
  });

  it("pulls only changes after a deterministic advancing cursor", async () => {
    const transport = new InMemoryDeurSyncTransport();
    await transport.push({ changes: [change("one")] });
    const first = await transport.pull({ cursor: undefined });
    await transport.push({ changes: [change("two", 2)] });
    const second = await transport.pull({ cursor: first.cursor });

    expect(first.changes.map((item) => item.operationId)).toEqual(["one"]);
    expect(first.cursor).toBe("1");
    expect(second.changes.map((item) => item.operationId)).toEqual(["two"]);
    expect(second.cursor).toBe("2");
  });

  it("supports simulated remote changes, conflicts, and temporary failures", async () => {
    const transport = new InMemoryDeurSyncTransport();
    transport.simulateRemoteChange(change("remote"));
    expect((await transport.pull({})).changes).toHaveLength(1);

    transport.simulateConflict(change("remote-conflict", 2));
    const conflict = await transport.push({ changes: [change("local-conflict")] });
    expect(conflict.conflicts).toHaveLength(1);

    transport.failNext("network", "temporarily offline");
    const failure = await transport.push({ changes: [change("later")] });
    expect(failure.transportError).toMatchObject({ classification: "network", retryable: true });
  });

  it("keeps a queue item pending for retry after temporary failure and marks only acceptance synced", async () => {
    const transport = new InMemoryDeurSyncTransport();
    const adapter = createQueueTransportAdapter(transport);
    deurSyncQueue.enqueue({
      id: "queue-operation",
      aggregateId: "deur-1",
      aggregateType: "DEUR",
      operation: "update",
      payload: { id: "deur-1", logs: [] },
      createdAt: "2026-07-19T08:00:00.000Z",
    });

    transport.failNext("timeout", "try again");
    expect(await processDeurSyncQueue(adapter)).toEqual({ processed: 0 });
    expect(deurSyncQueue.getAll()[0]).toMatchObject({ status: "failed", retryCount: 1 });

    expect(await processDeurSyncQueue(adapter)).toEqual({ processed: 1 });
    expect(deurSyncQueue.getAll()[0]).toMatchObject({ status: "synced", retryCount: 1 });
    expect(transport.getStoredChanges()).toHaveLength(1);
  });
});
