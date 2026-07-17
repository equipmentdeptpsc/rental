import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { storage } from "@/core/storage";
import { deurSyncQueue as queue } from "@/features/rental/deur/offline/deurSyncQueue";
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

function enqueue(operation: DeurQueueOperation, id = `${operation}-item`, payload: unknown = { nested: { value: operation } }) {
  return queue.enqueue({
    id,
    aggregateId: "deur-1",
    aggregateType: "DEUR",
    operation,
    payload,
    createdAt: "2026-01-01T00:00:00.000Z",
  });
}

describe("DEUR offline queue", () => {
  beforeEach(() => {
    storage.remove(QUEUE_KEY);
  });

  afterEach(() => {
    storage.remove(QUEUE_KEY);
  });

  it("enqueues every supported operation with its supplied identity and immutable serialized payload", () => {
    const payload = { nested: { value: "original" } };
    const original = structuredClone(payload);
    const first = enqueue("create", "queue-1", payload);
    operations.slice(1).forEach((operation, index) => enqueue(operation, `queue-${index + 2}`));

    expect(first).toMatchObject({
      id: "queue-1",
      aggregateId: "deur-1",
      aggregateType: "DEUR",
      operation: "create",
      createdAt: "2026-01-01T00:00:00.000Z",
      retryCount: 0,
      status: "pending",
    });
    expect(first.id).not.toBe("");
    expect(new Set(queue.getAll().map((item) => item.id)).size).toBe(operations.length);
    expect(queue.getAll().map((item) => item.operation)).toEqual(operations);
    expect(() => JSON.stringify(first.payload)).not.toThrow();

    payload.nested.value = "changed by caller";
    expect(payload).not.toEqual(original);
    expect(queue.getAll()[0].payload).toEqual(original);
  });

  it("preserves FIFO reads and removes only the first processable item on dequeue", () => {
    enqueue("create", "first");
    enqueue("update", "second");
    enqueue("delete", "third");

    expect(queue.peek()?.id).toBe("first");
    expect(queue.getAll()).toHaveLength(3);
    expect(queue.dequeue()?.id).toBe("first");
    expect(queue.getAll().map((item) => item.id)).toEqual(["second", "third"]);

    queue.markFailed("second", "temporary failure");
    expect(queue.peek()?.id).toBe("second");
    expect(queue.getAll().map((item) => item.id)).toEqual(["second", "third"]);
  });

  it("applies status transitions only to the selected item and retains failures or conflicts", () => {
    enqueue("create", "one");
    enqueue("update", "two");
    enqueue("delete", "three");

    queue.markSyncing("one");
    queue.markSynced("two");
    queue.markFailed("three", "network unavailable");
    expect(queue.getAll()).toMatchObject([
      { id: "one", status: "syncing", retryCount: 0 },
      { id: "two", status: "synced", retryCount: 0 },
      { id: "three", status: "failed", retryCount: 1, error: "network unavailable" },
    ]);

    queue.markFailed("three", "still unavailable");
    queue.markConflict("one", "remote revision conflict");
    expect(queue.getAll()).toMatchObject([
      { id: "one", status: "conflict", retryCount: 0, error: "remote revision conflict" },
      { id: "two", status: "synced", retryCount: 0 },
      { id: "three", status: "failed", retryCount: 2, error: "still unavailable" },
    ]);

    const beforeMissingMark = structuredClone(queue.getAll());
    queue.markSynced("missing-item");
    expect(queue.getAll()).toEqual(beforeMissingMark);
  });

  it("counts only processable pending and failed items under the current queue contract", () => {
    expect(queue.countPending()).toBe(0);
    enqueue("create", "pending");
    enqueue("update", "syncing");
    enqueue("delete", "synced");
    enqueue("submit", "failed");
    enqueue("reject", "conflict");
    queue.markSyncing("syncing");
    queue.markSynced("synced");
    queue.markFailed("failed");
    queue.markConflict("conflict");

    expect(queue.countPending()).toBe(2);
  });

  it("clears only synced items while preserving the remaining FIFO order and statuses", () => {
    enqueue("create", "pending");
    enqueue("update", "syncing");
    enqueue("delete", "synced");
    enqueue("submit", "failed");
    enqueue("reject", "conflict");
    queue.markSyncing("syncing");
    queue.markSynced("synced");
    queue.markFailed("failed");
    queue.markConflict("conflict", "conflict");

    queue.clearSynced();
    expect(queue.getAll().map((item) => [item.id, item.status])).toEqual([
      ["pending", "pending"],
      ["syncing", "syncing"],
      ["failed", "failed"],
      ["conflict", "conflict"],
    ]);
    const remaining = structuredClone(queue.getAll());
    queue.clearSynced();
    expect(queue.getAll()).toEqual(remaining);
  });

  it("persists queue order, statuses, retry counts, and immutable values across module recreation", async () => {
    const payload = { nested: { value: "persisted" } };
    enqueue("create", "first", payload);
    enqueue("update", "second");
    queue.markFailed("second", "retry later");

    const returned = queue.getAll();
    (returned[0].payload as { nested: { value: string } }).nested.value = "mutated return value";
    returned[0].status = "synced";
    expect(queue.getAll()[0]).toMatchObject({ status: "pending", payload: { nested: { value: "persisted" } } });

    vi.resetModules();
    const { deurSyncQueue: recreated } = await import("@/features/rental/deur/offline/deurSyncQueue");
    expect(recreated.getAll()).toMatchObject([
      { id: "first", status: "pending", retryCount: 0, payload: { nested: { value: "persisted" } } },
      { id: "second", status: "failed", retryCount: 1, error: "retry later" },
    ]);
  });
});
