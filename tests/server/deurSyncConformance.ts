import { describe, expect, it } from "vitest";

import type { DeurRemoteSyncTransport, DeurSyncChangeEnvelope } from "@/features/rental/deur/synchronization/types";

export function conformanceChange(id: string, entityId = `deur-${id}`): DeurSyncChangeEnvelope {
  return {
    schemaVersion: 1, entity: { type: "DEUR", id: entityId }, operation: "create",
    operationId: id, idempotencyKey: id, localRevision: 1, baseRemoteRevision: 0,
    occurredAt: "2026-07-19T08:00:00.000Z", payload: { id: entityId, logs: [] },
  };
}

export function defineDeurSyncConformanceSuite(name: string, factory: () => DeurRemoteSyncTransport): void {
  describe(`${name} DEUR transport conformance`, () => {
    it("accepts a change idempotently without duplicating server order", async () => {
      const transport = factory();
      const input = conformanceChange("operation-1");
      const original = structuredClone(input);
      const first = await transport.push({ changes: [input] });
      const retry = await transport.push({ changes: [structuredClone(input)] });

      expect(first.accepted).toHaveLength(1);
      expect(retry.accepted[0]).toMatchObject({ alreadyAccepted: true, remoteRevision: first.accepted[0].remoteRevision });
      const pulled = await transport.pull({ cursor: "0" });
      expect(pulled.changes).toHaveLength(1);
      expect(pulled.changes[0].payload).toEqual(input.payload);
      expect(input).toEqual(original);
    });

    it("returns deterministic ordered cursor pages", async () => {
      const transport = factory();
      await transport.push({ changes: [conformanceChange("one"), conformanceChange("two"), conformanceChange("three")] });
      const first = await transport.pull({ cursor: "0", limit: 2 });
      const repeat = await transport.pull({ cursor: "0", limit: 2 });
      const second = await transport.pull({ cursor: first.cursor, limit: 2 });

      expect(first.changes.map((item) => item.operationId)).toEqual(["one", "two"]);
      expect(first).toEqual(repeat);
      expect(first).toMatchObject({ cursor: "2", hasMore: true });
      expect(second.changes.map((item) => item.operationId)).toEqual(["three"]);
      expect(second).toMatchObject({ cursor: "3", hasMore: false });
    });

    it("returns an empty stable page from the current cursor", async () => {
      const transport = factory();
      expect(await transport.pull({ cursor: "0" })).toMatchObject({ changes: [], cursor: "0", hasMore: false });
    });
  });
}
