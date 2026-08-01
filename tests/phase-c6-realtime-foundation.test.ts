import { describe, expect, it, vi } from "vitest";
import {
  InMemoryOperationalEventRepository,
  OperationalEventStream,
  OperatorSynchronizationService,
  PollingOperationalEventTransport,
  RunningTimerEngine,
  WorkspaceSynchronization,
  applyOperationalEvent,
  type OperationalEvent,
} from "@/features/rental/realtime";
import { SupabaseOperationalEventRepository } from "@/integrations/supabase/SupabaseOperationalEventRepository";
import type { SupabaseClient } from "@supabase/supabase-js";

class ManualPollingTimers {
  readonly callbacks = new Set<() => void>();
  setInterval(callback: () => void): unknown {
    this.callbacks.add(callback);
    return callback;
  }
  clearInterval(handle: unknown): void {
    this.callbacks.delete(handle as () => void);
  }
  async tick(): Promise<void> {
    this.callbacks.forEach((callback) => callback());
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

const event = (
  eventId: string,
  type: OperationalEvent["type"],
  options: Partial<OperationalEvent> = {},
): OperationalEvent => ({
  eventId,
  tenantId: "TENANT-A",
  rentalId: "RENTAL-1",
  rentalLineId: "LINE-A",
  equipmentId: "EQ-A",
  operatorId: "OP-A",
  type,
  occurredAt: "2026-07-30T00:00:00.000Z",
  sequence: 1,
  aggregateVersion: 1,
  payload: {},
  ...options,
});

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("Phase C6 provider-neutral real-time operations foundation", () => {
  it("orders same-timestamp events by sequence and event identity", async () => {
    const repository = new InMemoryOperationalEventRepository();
    await repository.append(event("C", "OperationStopped", { sequence: 3 }));
    await repository.append(event("A", "OperationStarted", { sequence: 1 }));
    await repository.append(event("B", "OperationPaused", { sequence: 2 }));
    const page = await repository.listAfter({ tenantId: "TENANT-A", rentalId: "RENTAL-1" });
    expect(page.events.map((item) => item.eventId)).toEqual(["A", "B", "C"]);
  });

  it("suppresses event-id and semantic duplicates without losing distinct meter updates", async () => {
    const repository = new InMemoryOperationalEventRepository();
    expect(await repository.append(event("A", "MeterUpdated", { payload: { value: 100 } })))
      .toBe("APPENDED");
    expect(await repository.append(event("A", "MeterUpdated", { payload: { value: 100 } })))
      .toBe("DUPLICATE");
    expect(await repository.append(event("B", "MeterUpdated", { payload: { value: 100 } })))
      .toBe("DUPLICATE");
    expect(await repository.append(event("C", "MeterUpdated", {
      payload: { value: 101 },
      aggregateVersion: 2,
    }))).toBe("APPENDED");
  });

  it("restores a server-authoritative running timer across refresh and corrects client drift", () => {
    const started = applyOperationalEvent(undefined, event("START", "OperationStarted", {
      occurredAt: "2026-07-30T08:00:00.000Z",
    }));
    const first = new RunningTimerEngine();
    first.synchronizeClock("2026-07-30T08:10:00.000Z", Date.parse("2026-07-30T08:09:55.000Z"));
    expect(first.project(started, Date.parse("2026-07-30T08:09:55.000Z"))).toMatchObject({
      elapsedOperationMs: 600_000,
      running: true,
      driftMs: 5_000,
    });
    const refreshed = new RunningTimerEngine();
    refreshed.synchronizeClock("2026-07-30T08:15:00.000Z", Date.parse("2026-07-30T08:15:04.000Z"));
    expect(refreshed.project(started, Date.parse("2026-07-30T08:15:04.000Z"))).toMatchObject({
      elapsedOperationMs: 900_000,
      running: true,
      driftMs: -4_000,
    });
  });

  it("cleans polling and line subscriptions without later callbacks", async () => {
    const repository = new InMemoryOperationalEventRepository();
    const timers = new ManualPollingTimers();
    const stream = new OperationalEventStream(new PollingOperationalEventTransport(repository, timers));
    const workspace = new WorkspaceSynchronization(stream);
    const stopRental = workspace.subscribeRental("TENANT-A", "RENTAL-1");
    let calls = 0;
    const stopLine = workspace.subscribeLine("LINE-A", () => { calls += 1; });
    await stream.publish(event("START", "OperationStarted"));
    await timers.tick();
    expect(calls).toBe(1);
    stopLine();
    stopRental();
    await stream.publish(event("PAUSE", "OperationPaused", {
      occurredAt: "2026-07-30T00:01:00.000Z",
      sequence: 2,
      aggregateVersion: 2,
    }));
    await timers.tick();
    expect(calls).toBe(1);
    expect(timers.callbacks.size).toBe(0);
  });

  it("refreshes only the affected equipment-line subscriber", async () => {
    const repository = new InMemoryOperationalEventRepository();
    const timers = new ManualPollingTimers();
    const stream = new OperationalEventStream(new PollingOperationalEventTransport(repository, timers));
    const workspace = new WorkspaceSynchronization(stream);
    workspace.subscribeRental("TENANT-A", "RENTAL-1");
    let lineA = 0;
    let lineB = 0;
    workspace.subscribeLine("LINE-A", () => { lineA += 1; });
    workspace.subscribeLine("LINE-B", () => { lineB += 1; });
    await stream.publish(event("A", "OperationStarted"));
    await timers.tick();
    expect({ lineA, lineB }).toEqual({ lineA: 1, lineB: 0 });
    await stream.publish(event("B", "OperationStarted", {
      rentalLineId: "LINE-B", equipmentId: "EQ-B", operatorId: "OP-B",
    }));
    await timers.tick();
    expect({ lineA, lineB }).toEqual({ lineA: 1, lineB: 1 });
  });

  it("does not retain the removed memory-only offline event queue", async () => {
    const repository = new InMemoryOperationalEventRepository();
    const stream = new OperationalEventStream(new PollingOperationalEventTransport(repository));
    const operator = new OperatorSynchronizationService(stream);
    operator.setOnline(false);
    await expect(operator.publish(event("OFFLINE-START", "OperationStarted"))).rejects.toThrow("durable replay must occur through the authorized command queue");
    expect(operator.pendingCount()).toBe(0);
    expect(await operator.reconnect()).toEqual({ published: 0, duplicates: 0, pending: 0 });
    expect((await repository.listAfter({ tenantId: "TENANT-A" })).events).toHaveLength(0);
  });

  it("restores missed state to a reconnecting workspace subscriber", async () => {
    const repository = new InMemoryOperationalEventRepository();
    const timers = new ManualPollingTimers();
    const stream = new OperationalEventStream(new PollingOperationalEventTransport(repository, timers));
    const operator = new OperatorSynchronizationService(stream);
    await operator.publish(event("START", "OperationStarted"));
    await operator.publish(event("PAUSE", "OperationPaused", {
      occurredAt: "2026-07-30T00:05:00.000Z", sequence: 2, aggregateVersion: 2,
    }));
    const workspace = new WorkspaceSynchronization(stream);
    workspace.subscribeRental("TENANT-A", "RENTAL-1");
    await settle();
    expect(workspace.getLineState("LINE-A")).toMatchObject({
      phase: "paused",
      accumulatedOperationMs: 300_000,
    });
  });

  it("serializes parallel Start clicks into one semantic event", async () => {
    const repository = new InMemoryOperationalEventRepository();
    const streamA = new OperationalEventStream(new PollingOperationalEventTransport(repository));
    const streamB = new OperationalEventStream(new PollingOperationalEventTransport(repository));
    const [left, right] = await Promise.all([
      streamA.publish(event("DEVICE-A-START", "OperationStarted")),
      streamB.publish(event("DEVICE-B-START", "OperationStarted")),
    ]);
    expect([left, right].sort()).toEqual(["DUPLICATE", "PUBLISHED"]);
    const events = (await repository.listAfter({ tenantId: "TENANT-A" })).events;
    expect(events).toHaveLength(1);
    expect(applyOperationalEvent(undefined, events[0])).toMatchObject({ phase: "running" });
  });

  it("keeps multi-equipment running states independent across devices", async () => {
    const repository = new InMemoryOperationalEventRepository();
    const timers = new ManualPollingTimers();
    const transport = new PollingOperationalEventTransport(repository, timers);
    const workspace = new WorkspaceSynchronization(new OperationalEventStream(transport));
    workspace.subscribeRental("TENANT-A", "RENTAL-1");
    const deviceA = new OperatorSynchronizationService(new OperationalEventStream(transport));
    const deviceB = new OperatorSynchronizationService(new OperationalEventStream(transport));
    await deviceA.publish(event("A-START", "OperationStarted"));
    await deviceB.publish(event("B-START", "OperationStarted", {
      rentalLineId: "LINE-B", equipmentId: "EQ-B", operatorId: "OP-B",
    }));
    await deviceB.publish(event("B-PAUSE", "OperationPaused", {
      rentalLineId: "LINE-B", equipmentId: "EQ-B", operatorId: "OP-B",
      occurredAt: "2026-07-30T00:02:00.000Z", sequence: 2, aggregateVersion: 2,
    }));
    await deviceA.publish(event("A-PAUSE", "OperationPaused", {
      occurredAt: "2026-07-30T00:03:00.000Z", sequence: 2, aggregateVersion: 2,
    }));
    await deviceA.publish(event("A-RESUME", "OperationResumed", {
      occurredAt: "2026-07-30T00:04:00.000Z", sequence: 3, aggregateVersion: 3,
    }));
    await timers.tick();
    expect(workspace.getLineState("LINE-A")).toMatchObject({ phase: "running", operatorId: "OP-A" });
    expect(workspace.getLineState("LINE-B")).toMatchObject({ phase: "paused", operatorId: "OP-B" });
  });

  it("enforces tenant isolation at repository and subscription boundaries", async () => {
    const repository = new InMemoryOperationalEventRepository();
    const timers = new ManualPollingTimers();
    const stream = new OperationalEventStream(new PollingOperationalEventTransport(repository, timers));
    const received: OperationalEvent[] = [];
    stream.subscribe({ tenantId: "TENANT-A", rentalId: "RENTAL-1" }, (item) => received.push(item));
    await stream.publish(event("A", "OperationStarted"));
    await stream.publish(event("B", "OperationStarted", { tenantId: "TENANT-B" }));
    await timers.tick();
    expect(received.map((item) => item.tenantId)).toEqual(["TENANT-A"]);
    expect((await repository.listAfter({ tenantId: "TENANT-B" })).events).toHaveLength(1);
  });

  it("rejects invalid transitions and late arrivals without corrupting the line state", () => {
    const started = applyOperationalEvent(undefined, event("START", "OperationStarted"));
    const stopped = applyOperationalEvent(started, event("STOP", "OperationStopped", {
      occurredAt: "2026-07-30T00:10:00.000Z", sequence: 2, aggregateVersion: 2,
    }));
    const invalidPause = applyOperationalEvent(stopped, event("LATE-PAUSE", "OperationPaused", {
      occurredAt: "2026-07-30T00:11:00.000Z", sequence: 3, aggregateVersion: 3,
    }));
    const lateMeter = applyOperationalEvent(invalidPause, event("LATE-METER", "MeterUpdated", {
      occurredAt: "2026-07-30T00:09:00.000Z", sequence: 4, aggregateVersion: 4,
      payload: { value: 999 },
    }));
    expect(invalidPause).toMatchObject({ phase: "stopped", accumulatedOperationMs: 600_000 });
    expect(lateMeter).toBe(invalidPause);
    expect(lateMeter.meter).toBeUndefined();
  });

  it("maps RLS-filtered Supabase DEUR events through the read-only polling adapter", async () => {
    const rows = [
      {
        id: "REMOTE-1", activity_type: "operation", action: "start",
        occurred_at: "2026-07-30T08:00:00.000Z", sequence: 2, company_id: "HIDDEN",
        deurs: {
          rental_id: "RENTAL-1", rental_equipment_line_id: "LINE-A",
          equipment_id: "EQ-A", operator_id: "OP-A", row_version: 4,
        },
      },
      {
        id: "REMOTE-2", activity_type: "operation", action: "end",
        occurred_at: "2026-07-30T09:00:00.000Z", sequence: 3, company_id: "HIDDEN",
        deurs: {
          rental_id: "RENTAL-1", rental_equipment_line_id: "LINE-A",
          equipment_id: "EQ-A", operator_id: "OP-A", row_version: 5,
        },
      },
    ];
    const eq = vi.fn().mockReturnThis();
    const query: any = {
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      eq,
      then: (resolve: (value: unknown) => void) => resolve({ data: rows, error: null }),
    };
    const client = {
      schema: vi.fn(() => ({ from: vi.fn(() => query) })),
    } as unknown as SupabaseClient;
    const repository = new SupabaseOperationalEventRepository(client);
    const page = await repository.listAfter({
      tenantId: "AUTHENTICATED_TENANT",
      rentalId: "RENTAL-1",
      rentalLineId: "LINE-A",
    });
    expect(page.events.map((item) => item.type)).toEqual(["OperationStarted", "OperationPaused"]);
    expect(page.events.every((item) => item.tenantId === "AUTHENTICATED_TENANT")).toBe(true);
    expect(eq).toHaveBeenCalledWith("deurs.rental_id", "RENTAL-1");
    expect(eq).toHaveBeenCalledWith("deurs.rental_equipment_line_id", "LINE-A");
    await expect(repository.append(event("REMOTE-WRITE", "OperationStarted")))
      .rejects.toThrow("REMOTE_OPERATIONAL_EVENT_PUBLISH_DISABLED");
  });
});
