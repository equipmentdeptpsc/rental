import { describe, expect, it, vi } from "vitest";
import { loadRemoteAuditIdentities, presentRemoteAuditIdentity } from "@/features/administration/services/remoteAuditIdentity";

describe("remote audit identity presentation", () => {
  it("uses recorded actor name and resolves a readable target with batched reads", async () => {
    const users = { list: vi.fn(async () => ({ success: true, value: { items: [{ id: "actor-1", displayName: "Current Name", username: "staff" }] } })) };
    const rentals = { list: vi.fn(async () => ({ success: true, value: { items: [{ id: "rental-1", rentalNumber: "RNT-001" }] } })) };
    const event = { id: "audit-1", aggregateType: "Rental", aggregateId: "rental-1", actorId: "actor-1", actorName: "Historical Name", action: "UPDATED", occurredAt: "2026-10-01T00:00:00Z" };
    const references = await loadRemoteAuditIdentities({ users, rentals } as never, [event]);
    expect(users.list).toHaveBeenCalledTimes(1);
    expect(rentals.list).toHaveBeenCalledTimes(1);
    expect(presentRemoteAuditIdentity(event, references)).toMatchObject({ actor: { primary: "Historical Name" }, target: { primary: "RNT-001", technicalId: "rental-1" } });
  });

  it("keeps unresolved UUIDs as technical detail only", () => {
    const event = { id: "audit-2", aggregateType: "Equipment", aggregateId: "technical-uuid", actorId: "actor-uuid", action: "DELETED", occurredAt: "2026-10-01T00:00:00Z" };
    const result = presentRemoteAuditIdentity(event, { actors: new Map(), targets: new Map() });
    expect(result.actor.primary).toBe("Deleted / unavailable user");
    expect(result.target.primary).toBe("Deleted / unavailable record");
    expect(result.target.technicalId).toBe("technical-uuid");
  });
});
