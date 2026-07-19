import { describe, expect, it } from "vitest";

import { reconcileDeurChanges } from "@/features/rental/deur/synchronization/reconcileDeurChanges";
import type { DeurSyncChangeEnvelope } from "@/features/rental/deur/synchronization/types";

function envelope(overrides: Partial<DeurSyncChangeEnvelope> = {}): DeurSyncChangeEnvelope {
  return {
    schemaVersion: 1,
    entity: { type: "DEUR", id: "deur-1" },
    operation: "update",
    operationId: "local-op",
    idempotencyKey: "local-op",
    localRevision: 2,
    baseRemoteRevision: 1,
    remoteRevision: 2,
    occurredAt: "2026-07-19T09:00:00.000Z",
    payload: {
      id: "deur-1",
      status: "In Progress",
      logs: [{ id: "activity-1", activity: "Operation", startTime: "08:00", durationMinutes: 0 }],
    },
    ...overrides,
  };
}

describe("DEUR deterministic reconciliation", () => {
  it("distinguishes already-accepted, local-only, and remote-only changes", () => {
    const local = envelope();
    expect(reconcileDeurChanges(local, envelope())).toMatchObject({ kind: "already-accepted" });
    expect(reconcileDeurChanges(local, undefined)).toMatchObject({ kind: "local-only", change: local });
    expect(reconcileDeurChanges(undefined, local)).toMatchObject({ kind: "remote-only", change: local });
  });

  it("merges non-overlapping activity evidence without mutating or losing either input", () => {
    const local = envelope();
    const remote = envelope({
      operationId: "remote-op",
      idempotencyKey: "remote-op",
      payload: {
        id: "deur-1",
        status: "In Progress",
        logs: [{ id: "activity-2", activity: "Idle", startTime: "09:00", durationMinutes: 0 }],
      },
    });
    const localOriginal = structuredClone(local);
    const remoteOriginal = structuredClone(remote);

    const result = reconcileDeurChanges(local, remote);

    expect(result.kind).toBe("merged");
    if (result.kind === "merged") {
      expect((result.change.payload as { logs: unknown[] }).logs).toHaveLength(2);
    }
    expect(local).toEqual(localOriginal);
    expect(remote).toEqual(remoteOriginal);
  });

  it("returns both versions for competing edits to one activity", () => {
    const local = envelope();
    const remote = envelope({
      operationId: "remote-op",
      idempotencyKey: "remote-op",
      payload: {
        id: "deur-1",
        status: "In Progress",
        logs: [{ id: "activity-1", activity: "Idle", startTime: "08:00", durationMinutes: 0 }],
      },
    });

    const result = reconcileDeurChanges(local, remote);

    expect(result).toMatchObject({ kind: "conflict", reason: "competing-activity-edit", local, remote });
  });

  it("reports delete-versus-update and stale revision conflicts explicitly", () => {
    expect(reconcileDeurChanges(envelope({ operation: "delete", payload: undefined }), envelope({ operationId: "remote", idempotencyKey: "remote" })))
      .toMatchObject({ kind: "conflict", reason: "delete-versus-update" });
    expect(reconcileDeurChanges(envelope({ baseRemoteRevision: 1 }), envelope({ operationId: "remote", idempotencyKey: "remote", remoteRevision: 3 })))
      .toMatchObject({ kind: "stale-local" });
    expect(reconcileDeurChanges(envelope({ baseRemoteRevision: 4 }), envelope({ operationId: "remote", idempotencyKey: "remote", remoteRevision: 3 })))
      .toMatchObject({ kind: "stale-remote" });
  });

  it("rejects malformed payloads and unsupported schema versions safely", () => {
    expect(reconcileDeurChanges({ broken: true }, envelope())).toMatchObject({ kind: "invalid", reason: "malformed-payload" });
    expect(reconcileDeurChanges({ ...envelope(), schemaVersion: 2 }, envelope())).toMatchObject({ kind: "invalid", reason: "unsupported-schema-version" });
  });
});
