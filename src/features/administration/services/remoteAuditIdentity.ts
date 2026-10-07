import type { ApplicationReadRepositories } from "@/app/composition/ApplicationDependencies";
import type { Page, RepositoryOperation, RepositoryResult } from "@/core/persistence";
import type { CanonicalAuditEvent } from "../domain/canonicalAudit";

export interface AuditReference { label: string; description: string }

/** One read per referenced entity type, rather than one request per audit event. */
export async function loadRemoteAuditIdentities(repositories: ApplicationReadRepositories, events: readonly CanonicalAuditEvent[]): Promise<{ actors: Map<string, AuditReference>; targets: Map<string, AuditReference> }> {
  const types = new Set(events.map((event) => event.aggregateType.toLowerCase()));
  const targets = new Map<string, AuditReference>();
  const actors = new Map<string, AuditReference>();
  const collect = async <T extends { id: string }>(enabled: boolean, list: () => RepositoryOperation<RepositoryResult<Page<T>>>, label: (record: T) => string | undefined, typeNames: readonly string[]) => {
    if (!enabled) return;
    const result = await Promise.resolve(list());
    if (!result.success) return;
    for (const record of result.value.items) {
      const value = label(record)?.trim();
      if (value) for (const type of typeNames) targets.set(`${type}:${record.id}`, { label: value, description: "Current record label" });
    }
  };
  await Promise.allSettled([
    Promise.resolve(repositories.users.list({ paging: { limit: 1000 } })).then((result) => { if (result.success) for (const user of result.value.items) { const identity = { label: user.displayName || user.username, description: user.username }; actors.set(user.id, identity); targets.set(`user:${user.id}`, identity); } }),
    collect(types.has("equipment"), () => repositories.equipment.list({ paging: { limit: 1000 } }), (item) => `${item.assetNo} — ${item.equipmentName}`, ["equipment"]),
    collect(types.has("rental"), () => repositories.rentals.list({ paging: { limit: 1000 } }), (item) => item.rentalNumber, ["rental"]),
    collect(types.has("assignment"), () => repositories.assignments.list({ paging: { limit: 1000 } }), (item) => `Assignment ${item.assignedDate}`, ["assignment"]),
    collect(types.has("customer"), () => repositories.customers.list({ paging: { limit: 1000 } }), (item) => item.companyName, ["customer"]),
    collect(types.has("project"), () => repositories.projects.list({ paging: { limit: 1000 } }), (item) => `${item.projectCode} — ${item.projectName}`, ["project"]),
    collect(types.has("operator"), () => repositories.operators.list({ paging: { limit: 1000 } }), (item) => item.name, ["operator"]),
    collect(types.has("deur"), () => repositories.deurs.list({ paging: { limit: 1000 } }), (item) => item.deurNumber, ["deur"]),
    collect(types.has("billingstatement"), () => repositories.billing.list({ paging: { limit: 1000 } }), (item) => item.statementNo, ["billingstatement"]),
  ]);
  return { actors, targets };
}

export function presentRemoteAuditIdentity(event: CanonicalAuditEvent, references: { actors: Map<string, AuditReference>; targets: Map<string, AuditReference> }) {
  const actorSnapshot = event.actorName?.trim();
  const actor = actorSnapshot ? { primary: actorSnapshot, secondary: "Recorded actor name", technicalId: event.actorId ?? "Unavailable" }
    : event.actorId ? { primary: references.actors.get(event.actorId)?.label ?? "Deleted / unavailable user", secondary: references.actors.get(event.actorId)?.description ?? "Identity snapshot unavailable", technicalId: event.actorId }
      : { primary: "System", secondary: "System actor", technicalId: "Unavailable" };
  const currentTarget = references.targets.get(`${event.aggregateType.toLowerCase()}:${event.aggregateId}`);
  const target = { primary: currentTarget?.label ?? "Deleted / unavailable record", secondary: currentTarget?.description ?? event.aggregateType, technicalId: event.aggregateId };
  return { actor, target };
}
