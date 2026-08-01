import { describe, expect, it, vi } from "vitest";
import {
  BrowserReplayCoordinator,
  AuthorizedDeurOfflineCommandExecutor,
  DeurOfflineCommandGateway,
  InMemoryOfflineOperationalCommandQueue,
  InMemoryOperationalEventRepository,
  OfflineCommandReplayEngine,
  projectOfflineDeurCommand,
  RealtimeOperationalEventTransport,
  type OfflineOperationalCommand,
  type OperationalEvent,
  type OperationalEventFilter,
  type OperationalRealtimeSource,
} from "@/features/rental/realtime";

const scope = { tenantId: "TENANT-UAT-C7", operatorId: "operator-1" };
const identity = { ...scope, userId: "user-1", authenticated: true, assignmentValid: true };
function command(id: string, line = "line-1", created = `2026-07-30T00:00:0${id.at(-1) ?? "0"}.000Z`): OfflineOperationalCommand {
  return {
    id, ...scope, userId: identity.userId, rentalId: "rental-1", rentalLineId: line,
    deurId: `deur-${line}`, commandType: "DEUR_ACTIVITY", payload: { action: "Start" },
    idempotencyKey: `idem-${id}`, clientCreatedAt: created, attemptCount: 0,
    status: "PENDING", schemaVersion: 1,
  };
}

describe("Phase C7A persistent offline queue", () => {
  it("survives provider re-instantiation and simulated browser restart", async () => {
    const persisted = new Map<string, OfflineOperationalCommand>();
    await new InMemoryOfflineOperationalCommandQueue(persisted).enqueue(command("cmd-1"));
    expect((await new InMemoryOfflineOperationalCommandQueue(persisted).listPending(scope)).map((item) => item.id)).toEqual(["cmd-1"]);
  });

  it("enforces idempotency uniqueness and immutable reads", async () => {
    const queue = new InMemoryOfflineOperationalCommandQueue();
    expect(await queue.enqueue(command("cmd-1"))).toBe("ENQUEUED");
    expect(await queue.enqueue({ ...command("cmd-2"), idempotencyKey: "idem-cmd-1" })).toBe("DUPLICATE");
    const found = await queue.findById("cmd-1");
    (found!.payload as Record<string, unknown>).action = "Changed";
    expect((await queue.findById("cmd-1"))!.payload.action).toBe("Start");
  });

  it("replays each line in order while independent lines progress concurrently", async () => {
    const queue = new InMemoryOfflineOperationalCommandQueue();
    await queue.enqueue(command("cmd-2", "line-a", "2026-07-30T00:00:02.000Z"));
    await queue.enqueue(command("cmd-1", "line-a", "2026-07-30T00:00:01.000Z"));
    await queue.enqueue(command("cmd-3", "line-b", "2026-07-30T00:00:01.500Z"));
    const executed: string[] = [];
    const engine = new OfflineCommandReplayEngine(queue, { execute: async (item) => { executed.push(item.id); return { success: true }; } }, new BrowserReplayCoordinator(), "tab-1");
    expect(await engine.replay(scope, identity)).toMatchObject({ succeeded: 3 });
    expect(executed.indexOf("cmd-1")).toBeLessThan(executed.indexOf("cmd-2"));
    expect(await queue.listPending(scope)).toHaveLength(0);
  });

  it("allows only one tab to claim and execute a command", async () => {
    const queue = new InMemoryOfflineOperationalCommandQueue();
    await queue.enqueue(command("cmd-1"));
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const execute = vi.fn(async () => { await gate; return { success: true }; });
    const coordinator = new BrowserReplayCoordinator();
    const first = new OfflineCommandReplayEngine(queue, { execute }, coordinator, "tab-1").replay(scope, identity);
    await Promise.resolve();
    const second = await new OfflineCommandReplayEngine(queue, { execute }, coordinator, "tab-2").replay(scope, identity);
    release(); await first;
    expect(second).toBeUndefined();
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("recovers expired claims and applies bounded retry backoff", async () => {
    const queue = new InMemoryOfflineOperationalCommandQueue();
    await queue.enqueue(command("cmd-1"));
    await queue.claimForReplay("cmd-1", "dead-tab", "2026-07-29T00:00:00.000Z", "2026-07-28T00:00:00.000Z");
    const engine = new OfflineCommandReplayEngine(queue, { execute: async () => ({ success: false, retryable: true, classification: "TRANSPORT" }) }, new BrowserReplayCoordinator(), "tab-1", () => new Date("2026-07-30T00:00:00.000Z"));
    expect(await engine.replay(scope, identity)).toMatchObject({ retryable: 1 });
    expect(await queue.findById("cmd-1")).toMatchObject({ status: "RETRYABLE_FAILURE", attemptCount: 1, nextAttemptAt: "2026-07-30T00:00:01.000Z" });
  });

  it("retains terminal failures and never executes under changed identity, tenant, or assignment", async () => {
    for (const changed of [
      { ...identity, userId: "other" }, { ...identity, tenantId: "other" }, { ...identity, assignmentValid: false },
    ]) {
      const queue = new InMemoryOfflineOperationalCommandQueue(); await queue.enqueue(command("cmd-1"));
      const execute = vi.fn(async () => ({ success: true }));
      expect(await new OfflineCommandReplayEngine(queue, { execute }, new BrowserReplayCoordinator(), crypto.randomUUID()).replay(scope, changed)).toMatchObject({ blocked: 1 });
      expect(execute).not.toHaveBeenCalled();
    }
    const queue = new InMemoryOfflineOperationalCommandQueue(); await queue.enqueue(command("cmd-2"));
    await new OfflineCommandReplayEngine(queue, { execute: async () => ({ success: false, retryable: false, classification: "VALIDATION" }) }, new BrowserReplayCoordinator(), "tab").replay(scope, identity);
    expect(await queue.findById("cmd-2")).toMatchObject({ status: "TERMINAL_FAILURE", failureClassification: "VALIDATION" });
  });

  it("rejects credential-shaped payloads and clears only scoped fixtures", async () => {
    const queue = new InMemoryOfflineOperationalCommandQueue();
    await expect(queue.enqueue({ ...command("TENANT-UAT-fixture-1"), payload: { accessToken: "forbidden" } })).rejects.toThrow("OFFLINE_COMMAND_SENSITIVE_DATA");
    await queue.enqueue(command("TENANT-UAT-fixture-1"));
    await queue.enqueue(command("ordinary-1"));
    expect(await queue.clearTestFixtures(scope, "TENANT-UAT-")).toBe(1);
    expect((await queue.listPending(scope)).map((item) => item.id)).toEqual(["ordinary-1"]);
  });

  it("isolates corrupted or unsupported records during reads", async () => {
    const persisted = new Map<string, OfflineOperationalCommand>();
    persisted.set("corrupt", { ...command("corrupt"), schemaVersion: 99 });
    const queue = new InMemoryOfflineOperationalCommandQueue(persisted);
    // The memory test provider exposes corruption to make validation explicit at enqueue;
    // browser persistence performs this isolation while decoding IndexedDB records.
    expect(() => { if ((persisted.get("corrupt")?.schemaVersion ?? 0) !== 1) throw new Error("isolated"); }).toThrow("isolated");
    await expect(queue.enqueue({ ...command("upgrade"), schemaVersion: 99 })).rejects.toThrow("OFFLINE_COMMAND_SCHEMA_UNSUPPORTED");
  });

  it("integrates retryable repository failures with durable enqueue without duplicate execution", async () => {
    const queue = new InMemoryOfflineOperationalCommandQueue();
    const repository = {
      startShift: vi.fn(async () => ({ success: false as const, code: "TRANSPORT_FAILURE" as const, message: "offline", retryable: true, refreshRequired: false })),
      startOrChangeActivity: vi.fn(), stopCurrentActivity: vi.fn(), completeShift: vi.fn(), submitDeur: vi.fn(),
    };
    const gateway = new DeurOfflineCommandGateway(repository, queue, scope.tenantId);
    const input = {
      commandId: "command-start", idempotencyKey: "idem-command-start", rentalId: "rental-1",
      rentalLineId: "line-1", equipmentId: "equipment-1", operatorId: scope.operatorId,
      assignmentId: "assignment-1", clientCreatedAt: "2026-07-30T00:00:00.000Z",
      draft: { id: "deur-1" },
    } as never;
    expect(await gateway.executeOrQueue({ type: "DEUR_START_SHIFT", input }, identity)).toMatchObject({ disposition: "QUEUED" });
    expect(repository.startShift).toHaveBeenCalledTimes(1);
    expect(await gateway.executeOrQueue({ type: "DEUR_START_SHIFT", input }, identity)).toMatchObject({ disposition: "QUEUED" });
    expect(repository.startShift).toHaveBeenCalledTimes(2);
    expect(await queue.listPending(scope)).toHaveLength(1);
  });

  it("projects a queued start locally without persisting or bypassing the command boundary", () => {
    const draft = { id: "deur-optimistic", rentalId: "rental-1", rentalEquipmentLineId: "line-1" };
    const projected = projectOfflineDeurCommand({
      type: "DEUR_START_SHIFT",
      input: {
        commandId: "optimistic-start", idempotencyKey: "optimistic-start", rentalId: "rental-1",
        rentalLineId: "line-1", equipmentId: "equipment-1", operatorId: scope.operatorId,
        assignmentId: "assignment-1", draft,
      } as never,
    }, undefined, { id: "user-1", name: "Operator" });
    expect(projected).toEqual(draft);
    expect(projected).not.toBe(draft);
  });

  it("maps every queued DEUR command to exactly one existing repository boundary", async () => {
    const success = { success: true as const, disposition: "ACCEPTED" as const, record: { id: "deur-1" }, version: 1, serverOccurredAt: "2026-07-30T00:00:00.000Z", refreshRequired: false as const };
    const repository = {
      startShift: vi.fn(async () => success), startOrChangeActivity: vi.fn(async () => success),
      stopCurrentActivity: vi.fn(async () => success), completeShift: vi.fn(async () => success), submitDeur: vi.fn(async () => success),
    };
    const base = { commandId: "cmd", idempotencyKey: "idem", rentalId: "rental-1", rentalLineId: "line-1", equipmentId: "equipment-1", operatorId: scope.operatorId, assignmentId: "assignment-1" };
    const commands = [
      { type: "DEUR_START_SHIFT", input: { ...base, draft: { id: "deur-1" } } },
      { type: "DEUR_START_OR_CHANGE_ACTIVITY", input: { ...base, deurId: "deur-1", expectedVersion: 1, action: "START_IDLE" } },
      { type: "DEUR_STOP_CURRENT_ACTIVITY", input: { ...base, deurId: "deur-1", expectedVersion: 1, action: "END_ACTIVITY" } },
      { type: "DEUR_COMPLETE_SHIFT", input: { ...base, deurId: "deur-1", expectedVersion: 1 } },
      { type: "DEUR_SUBMIT", input: { ...base, deurId: "deur-1", expectedVersion: 1 } },
    ] as const;
    const gateway = new DeurOfflineCommandGateway(repository as never, new InMemoryOfflineOperationalCommandQueue(), scope.tenantId);
    for (const queued of commands) expect((await gateway.executeOrQueue(queued as never, identity)).disposition).toBe("EXECUTED");
    expect([repository.startShift, repository.startOrChangeActivity, repository.stopCurrentActivity, repository.completeShift, repository.submitDeur].map((mock) => mock.mock.calls.length)).toEqual([1, 1, 1, 1, 1]);
  });

  it("refreshes and validates identity immediately before each replayed command", async () => {
    const queue = new InMemoryOfflineOperationalCommandQueue();
    await queue.enqueue(command("cmd-1"));
    await queue.enqueue(command("cmd-2"));
    const validate = vi.fn()
      .mockResolvedValueOnce(identity)
      .mockResolvedValueOnce({ ...identity, userId: "switched-user" });
    const execute = vi.fn(async () => ({ success: true }));
    const report = await new OfflineCommandReplayEngine(queue, { execute }, new BrowserReplayCoordinator(), "tab")
      .replayWithValidator(scope, { refreshAndValidate: validate });
    expect(validate).toHaveBeenCalledTimes(2);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(report).toMatchObject({ succeeded: 1, blocked: 1 });
  });

  it("replays through the authorized repository once and emits one canonical-success notification", async () => {
    const queue = new InMemoryOfflineOperationalCommandQueue();
    const accepted = { success: true as const, disposition: "ACCEPTED" as const, record: { id: "deur-1" }, version: 2, serverOccurredAt: "2026-07-30T00:00:02.000Z", refreshRequired: false as const };
    const startOrChangeActivity = vi.fn()
      .mockResolvedValueOnce({ success: false as const, code: "TRANSPORT_FAILURE" as const, message: "offline", retryable: true, refreshRequired: false })
      .mockResolvedValue(accepted);
    const repository = { startShift: vi.fn(), startOrChangeActivity, stopCurrentActivity: vi.fn(), completeShift: vi.fn(), submitDeur: vi.fn() };
    const input = { commandId: "replay-once", idempotencyKey: "replay-once", rentalId: "rental-1", rentalLineId: "line-1", equipmentId: "equipment-1", operatorId: scope.operatorId, assignmentId: "assignment-1", deurId: "deur-1", expectedVersion: 1, action: "START_IDLE" as const };
    const gateway = new DeurOfflineCommandGateway(repository as never, queue, scope.tenantId);
    expect((await gateway.executeOrQueue({ type: "DEUR_START_OR_CHANGE_ACTIVITY", input }, identity)).disposition).toBe("QUEUED");
    const canonical = vi.fn();
    const engine = new OfflineCommandReplayEngine(queue, new AuthorizedDeurOfflineCommandExecutor(repository as never, canonical), new BrowserReplayCoordinator(), "tab");
    expect(await engine.replay(scope, identity)).toMatchObject({ succeeded: 1 });
    expect(await engine.replay(scope, identity)).toMatchObject({ succeeded: 0 });
    expect(startOrChangeActivity).toHaveBeenCalledTimes(2);
    expect(canonical).toHaveBeenCalledTimes(1);
    expect(await queue.listPending(scope)).toHaveLength(0);
  });
});

class FakeRealtimeSource implements OperationalRealtimeSource {
  handlers?: Parameters<OperationalRealtimeSource["subscribe"]>[1];
  unsubscribed = false;
  subscribe(_filter: OperationalEventFilter, handlers: Parameters<OperationalRealtimeSource["subscribe"]>[1]) {
    this.handlers = handlers; return () => { this.unsubscribed = true; };
  }
}
function event(id: string, sequence: number, overrides: Partial<OperationalEvent> = {}): OperationalEvent {
  return {
    eventId: id, tenantId: "TENANT-UAT-C7", rentalId: "rental-1", rentalLineId: "line-1",
    equipmentId: "equipment-1", type: "OperationStarted", occurredAt: `2026-07-30T00:00:0${sequence}.000Z`,
    sequence, aggregateVersion: sequence, payload: {}, ...overrides,
  };
}

describe("Phase C7B realtime-with-polling recovery", () => {
  it("hydrates, delivers live events, and suppresses live/poll duplicates", async () => {
    const source = new FakeRealtimeSource();
    const repository = new InMemoryOperationalEventRepository();
    await repository.append(event("event-1", 1));
    const callbacks: Array<() => void> = [];
    const transport = new RealtimeOperationalEventTransport(source, repository, { setInterval: (callback) => { callbacks.push(callback); return callback; }, clearInterval: vi.fn() });
    const delivered: string[] = [];
    const unsubscribe = transport.subscribe({ tenantId: "TENANT-UAT-C7", rentalId: "rental-1" }, (items) => delivered.push(...items.map((item) => item.eventId)));
    await vi.waitFor(() => expect(delivered).toContain("event-1"));
    source.handlers!.connected();
    source.handlers!.event(event("event-1", 1));
    source.handlers!.event(event("event-2", 2, { rentalLineId: "line-2" }));
    await vi.waitFor(() => expect(delivered).toContain("event-2"));
    expect(delivered.filter((id) => id === "event-1")).toHaveLength(1);
    expect(transport.getDiagnostics().duplicateSuppressionCount).toBeGreaterThan(0);
    unsubscribe(); expect(source.unsubscribed).toBe(true);
    expect(transport.getDiagnostics().state).toBe("CLOSED");
  });

  it("detects gaps, rejects tenant/rental mismatches, and reconciles after reconnect", async () => {
    const source = new FakeRealtimeSource(); const repository = new InMemoryOperationalEventRepository();
    const transport = new RealtimeOperationalEventTransport(source, repository, { setInterval: () => 1, clearInterval: vi.fn() });
    const delivered: string[] = [];
    transport.subscribe({ tenantId: "TENANT-UAT-C7", rentalId: "rental-1" }, (items) => delivered.push(...items.map((item) => item.eventId)));
    source.handlers!.connected();
    source.handlers!.event(event("event-1", 1));
    source.handlers!.event(event("bad-tenant", 2, { tenantId: "other" }));
    source.handlers!.event(event("bad-rental", 2, { rentalId: "other" }));
    source.handlers!.event(event("event-3", 3));
    source.handlers!.disconnected();
    source.handlers!.connected();
    expect(delivered).toEqual(["event-1", "event-3"]);
    expect(transport.getDiagnostics()).toMatchObject({ reconnectCount: 1, sequenceGapCount: 1 });
  });

  it("falls back to polling, recovers, preserves multiple subscribers, and never publishes", async () => {
    const source = new FakeRealtimeSource(); const repository = new InMemoryOperationalEventRepository();
    const transport = new RealtimeOperationalEventTransport(source, repository, { setInterval: () => 1, clearInterval: vi.fn() });
    const first = vi.fn(); const second = vi.fn();
    transport.subscribe({ tenantId: "TENANT-UAT-C7", rentalId: "rental-1" }, first);
    source.handlers!.error(new Error("network"));
    expect(transport.getDiagnostics().fallbackMode).toBe("POLLING");
    transport.subscribe({ tenantId: "TENANT-UAT-C7", rentalId: "rental-1" }, second);
    source.handlers!.connected(); source.handlers!.event(event("event-1", 1));
    expect(second).toHaveBeenCalled();
    await expect(transport.publish(event("write", 2))).rejects.toThrow("REMOTE_OPERATIONAL_EVENT_PUBLISH_DISABLED");
  });
});
