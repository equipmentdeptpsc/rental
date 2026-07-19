import { beforeEach, describe, expect, it } from "vitest";

import { InMemoryDeurSyncServerPersistence } from "./server/persistence/InMemoryDeurSyncServerPersistence";
import { conformanceChange } from "./server/deurSyncConformance";

describe("in-memory DEUR sync server persistence", () => {
  let persistence: InMemoryDeurSyncServerPersistence;

  beforeEach(() => { persistence = new InMemoryDeurSyncServerPersistence(); });

  it("atomically stores identifiers, revision, accepted evidence, and one ordered change", () => {
    const input = conformanceChange("operation-1", "deur-1");
    const original = structuredClone(input);

    const result = persistence.accept({ change: input, expectedRevision: 0 });

    expect(result.kind).toBe("accepted");
    expect(persistence.findByOperationId("operation-1")?.remoteRevision).toBe(1);
    expect(persistence.findByIdempotencyKey("operation-1")?.remoteRevision).toBe(1);
    expect(persistence.getEntityState("deur-1")?.revision).toBe(1);
    expect(persistence.readChanges(0, 10).changes).toHaveLength(1);
    expect(input).toEqual(original);
  });

  it("returns original acceptance for operation and idempotency replays", () => {
    const first = conformanceChange("operation-1", "deur-1");
    persistence.accept({ change: first, expectedRevision: 0 });

    expect(persistence.accept({ change: { ...first, idempotencyKey: "other" }, expectedRevision: 0 })).toMatchObject({ kind: "replayed", accepted: { remoteRevision: 1 } });
    expect(persistence.accept({ change: { ...first, operationId: "other" }, expectedRevision: 0 })).toMatchObject({ kind: "replayed", accepted: { remoteRevision: 1 } });
    expect(persistence.readChanges(0, 10).changes).toHaveLength(1);
  });

  it("clones stored inputs and every returned snapshot", () => {
    const input = conformanceChange("operation-1", "deur-1");
    persistence.accept({ change: input, expectedRevision: 0 });
    input.operationId = "caller-mutated";
    const page = persistence.readChanges(0, 10);
    page.changes[0].operationId = "returned-mutated";

    expect(persistence.readChanges(0, 10).changes[0].operationId).toBe("operation-1");
    expect(persistence.findByOperationId("operation-1")?.change.operationId).toBe("operation-1");
  });

  it("rolls back every acceptance invariant on a simulated transaction failure", () => {
    persistence.failNextAcceptance();
    expect(() => persistence.accept({ change: conformanceChange("operation-1", "deur-1"), expectedRevision: 0 })).toThrow("Simulated atomic acceptance failure");

    expect(persistence.findByOperationId("operation-1")).toBeUndefined();
    expect(persistence.findByIdempotencyKey("operation-1")).toBeUndefined();
    expect(persistence.getEntityState("deur-1")).toBeUndefined();
    expect(persistence.readChanges(0, 10)).toMatchObject({ changes: [], total: 0 });
  });

  it("reset clears accepted and conflict state", () => {
    const change = conformanceChange("operation-1", "deur-1");
    persistence.accept({ change, expectedRevision: 0 });
    persistence.recordConflict({ id: "conflict-1", operationId: "stale", reason: "stale-local", message: "stale", local: change, remote: { ...change, remoteRevision: 1 } });
    persistence.reset();

    expect(persistence.snapshot()).toMatchObject({ changes: [], sequence: 0, conflicts: [] });
  });
});
