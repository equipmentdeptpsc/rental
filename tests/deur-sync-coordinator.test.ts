import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { storage } from "@/core/storage";
import { deurSyncQueue as queue } from "@/features/rental/deur/offline/deurSyncQueue";
import { NoopDeurSyncTransport, type DeurSyncTransport } from "@/features/rental/deur/offline/deurSyncTransport";
import { processDeurSyncQueue } from "@/features/rental/deur/offline/syncCoordinator";
import type { DeurQueueOperation } from "@/features/rental/deur/offline/types";

const QUEUE_KEY = "equipment-rental-deur-sync-queue";
const operations: DeurQueueOperation[] = [
  "create",
  "update",
  "delete",
  "submit",
  "acknowledge",
  "reject",
  "reopen",
];

function enqueue(operation: DeurQueueOperation, id: string = operation) {
  queue.enqueue({
    id,
    aggregateId: "deur-1",
    aggregateType: "DEUR",
    operation,
    payload: { operation },
    createdAt: "2026-01-01T00:00:00.000Z",
  });
}

describe("DEUR sync coordinator", () => {
  beforeEach(() => {
    storage.remove(QUEUE_KEY);
  });

  afterEach(() => {
    storage.remove(QUEUE_KEY);
  });

  it("exits safely without invoking transport for an empty queue", async () => {
    const push = vi.fn();
    const result = await processDeurSyncQueue({ push });

    expect(result).toEqual({ processed: 0 });
    expect(push).not.toHaveBeenCalled();
    expect(queue.getAll()).toEqual([]);
  });

  it("processes pending items FIFO, marks each syncing before push, then synced", async () => {
    enqueue("create", "first");
    enqueue("update", "second");
    const seen: Array<{ id: string; operation: DeurQueueOperation; status: string }> = [];
    const transport: DeurSyncTransport = {
      async push(item) {
        seen.push({ id: item.id, operation: item.operation, status: queue.getAll().find((queued) => queued.id === item.id)?.status ?? "missing" });
        return { success: true };
      },
    };

    expect(await processDeurSyncQueue(transport)).toEqual({ processed: 2 });
    expect(seen).toEqual([
      { id: "first", operation: "create", status: "syncing" },
      { id: "second", operation: "update", status: "syncing" },
    ]);
    expect(queue.getAll().map((item) => [item.id, item.status])).toEqual([
      ["first", "synced"],
      ["second", "synced"],
    ]);
  });

  it("dispatches every supported operation through the transport boundary", async () => {
    operations.forEach((operation) => enqueue(operation));
    const dispatched: DeurQueueOperation[] = [];
    const transport: DeurSyncTransport = {
      async push(item) {
        dispatched.push(item.operation);
        return { success: true };
      },
    };

    expect(await processDeurSyncQueue(transport)).toEqual({ processed: operations.length });
    expect(dispatched).toEqual(operations);
    expect(queue.getAll().every((item) => item.status === "synced")).toBe(true);
  });

  it("marks a failed item once, increments its retry count, and stops without changing later items", async () => {
    enqueue("create", "first");
    enqueue("update", "later");
    const transport: DeurSyncTransport = { push: async () => ({ success: false, error: "offline" }) };

    expect(await processDeurSyncQueue(transport)).toEqual({ processed: 0 });
    expect(queue.getAll()).toMatchObject([
      { id: "first", status: "failed", retryCount: 1, error: "offline" },
      { id: "later", status: "pending", retryCount: 0 },
    ]);
  });

  it("marks a conflict without syncing it and keeps later queue items intact", async () => {
    enqueue("submit", "conflict-item");
    enqueue("acknowledge", "later");
    const transport: DeurSyncTransport = { push: async () => ({ success: false, conflict: true, error: "revision conflict" }) };

    expect(await processDeurSyncQueue(transport)).toEqual({ processed: 0 });
    expect(queue.getAll()).toMatchObject([
      { id: "conflict-item", status: "conflict", retryCount: 0, error: "revision conflict" },
      { id: "later", status: "pending", retryCount: 0 },
    ]);
  });

  it("uses the no-op transport successfully for every operation without networking", async () => {
    operations.forEach((operation) => enqueue(operation));

    expect(await processDeurSyncQueue(NoopDeurSyncTransport)).toEqual({ processed: operations.length });
    expect(queue.getAll().map((item) => item.status)).toEqual(operations.map(() => "synced"));
  });

  it("does not persist mutations made by the transport to a processed queue item", async () => {
    enqueue("create", "immutable-item");
    const transport: DeurSyncTransport = {
      async push(item) {
        (item.payload as { operation: string }).operation = "mutated-by-transport";
        item.aggregateId = "mutated-aggregate";
        return { success: true };
      },
    };

    await processDeurSyncQueue(transport);
    expect(queue.getAll()[0]).toMatchObject({
      id: "immutable-item",
      aggregateId: "deur-1",
      payload: { operation: "create" },
      status: "synced",
    });
    expect(() => JSON.stringify(queue.getAll()[0])).not.toThrow();
  });
});
