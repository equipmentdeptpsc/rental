import { beforeEach, describe, expect, it, vi } from "vitest";

import { DeurSyncLifecycleService } from "@/features/rental/deur/synchronization/lifecycle/DeurSyncLifecycleService";
import type { DeurSyncCycleResult } from "@/features/rental/deur/synchronization/orchestration/DeurSyncOrchestrator";

function result(started = true): DeurSyncCycleResult {
  return {
    started, outboundProcessed: 0, inboundApplied: 0,
    health: { status: started ? "completed" : "disabled-unconfigured", running: false, pendingOutboundCount: 0, unresolvedConflictCount: 0, consecutiveFailureCount: 0 },
  };
}

function runner(configured = true) {
  return { isConfigured: () => configured, runCycle: vi.fn(async () => result(configured)) };
}

describe("DEUR synchronization lifecycle service", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("requests startup synchronization once and never duplicates listeners when started twice", async () => {
    const orchestrator = runner();
    const add = vi.spyOn(window, "addEventListener");
    const service = new DeurSyncLifecycleService(orchestrator, { events: window, now: () => new Date("2026-07-19T10:00:00.000Z") });

    await Promise.all([service.start(), service.start()]);

    expect(orchestrator.runCycle).toHaveBeenCalledOnce();
    expect(add.mock.calls.filter(([name]) => name === "online")).toHaveLength(1);
    expect(service.getState()).toMatchObject({ started: true, listenersRegistered: true, startupRequestCompleted: true, lastTriggerSource: "startup" });
    service.stop();
  });

  it("removes listeners on stop and ignores later online recovery events", async () => {
    const orchestrator = runner();
    const remove = vi.spyOn(window, "removeEventListener");
    const service = new DeurSyncLifecycleService(orchestrator, { events: window });
    await service.start();
    service.stop();

    window.dispatchEvent(new Event("online"));
    await Promise.resolve();

    expect(remove.mock.calls.some(([name]) => name === "online")).toBe(true);
    expect(orchestrator.runCycle).toHaveBeenCalledOnce();
    expect(service.getState()).toMatchObject({ started: false, listenersRegistered: false });
  });

  it("runs one online recovery request and collapses an event storm while active", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const orchestrator = runner();
    orchestrator.runCycle.mockImplementation(async () => { await gate; return result(); });
    const service = new DeurSyncLifecycleService(orchestrator, { events: window });
    const startup = service.start();
    release();
    await startup;

    let releaseOnline!: () => void;
    const onlineGate = new Promise<void>((resolve) => { releaseOnline = resolve; });
    orchestrator.runCycle.mockImplementation(async () => { await onlineGate; return result(); });
    window.dispatchEvent(new Event("online"));
    window.dispatchEvent(new Event("online"));
    await Promise.resolve();
    expect(orchestrator.runCycle).toHaveBeenCalledTimes(2);
    releaseOnline();
    await Promise.resolve();
  });

  it("delegates concurrent manual requests to one active cycle", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const orchestrator = runner();
    orchestrator.runCycle.mockImplementation(async () => { await gate; return result(); });
    const service = new DeurSyncLifecycleService(orchestrator, { events: window });

    const first = service.requestSynchronization();
    const second = service.requestSynchronization();
    expect(orchestrator.runCycle).toHaveBeenCalledOnce();
    release();
    expect(await first).toEqual(await second);
    expect(service.getState().requestActive).toBe(false);
  });

  it("does not run a startup cycle when remote synchronization is unconfigured", async () => {
    const orchestrator = runner(false);
    const service = new DeurSyncLifecycleService(orchestrator, { events: window });

    await service.start();

    expect(orchestrator.runCycle).not.toHaveBeenCalled();
    expect(service.getState()).toMatchObject({ started: true, startupRequestCompleted: true, requestActive: false });
    service.stop();
  });
});
