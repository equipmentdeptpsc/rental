import type { CanonicalDeurEvent } from "../types";

export interface EffectiveDeurEventOrderInput {
  creationSource?: string;
  events: readonly CanonicalDeurEvent[];
}

const isManualPhysicalTimeline = (creationSource?: string) => creationSource === "MANUAL_WEB" || creationSource === "RENTAL_COMPANY_MANUAL";

const physicalSequence = (event: CanonicalDeurEvent) => event.physicalSequence ?? event.sequence;

const manualActionOrder = (event: CanonicalDeurEvent) => event.action === "start" ? 0 : event.activityType === "shift" ? 2 : 1;

/**
 * Mirrors `erp.effective_deur_event_order`: raw superseded rows are removed,
 * a terminal replacement inherits its lineage root as a logical tie-breaker,
 * and manual transcriptions use the database-owned physical-occurrence rule.
 */
export function orderEffectiveDeurEvents({ creationSource, events }: EffectiveDeurEventOrderInput): CanonicalDeurEvent[] {
  const raw = events.map((event) => ({ ...event, physicalSequence: physicalSequence(event) }));
  const byId = new Map(raw.map((event) => [event.id, event]));
  const rootFor = (event: CanonicalDeurEvent) => {
    const visited = new Set<string>();
    let current = event;
    while (current.replacesEventId && !visited.has(current.id)) {
      visited.add(current.id);
      const parent = byId.get(current.replacesEventId);
      if (!parent) break;
      current = parent;
    }
    return current;
  };
  const manual = isManualPhysicalTimeline(creationSource);
  return raw
    .filter((event) => !event.superseded)
    .map((event) => ({ event, root: rootFor(event) }))
    .sort((left, right) => {
      if (manual) {
        const occurred = Date.parse(left.event.timestamp) - Date.parse(right.event.timestamp);
        if (occurred) return occurred;
        const action = manualActionOrder(left.event) - manualActionOrder(right.event);
        if (action) return action;
      }
      const lineage = physicalSequence(left.root) - physicalSequence(right.root);
      if (lineage) return lineage;
      const physical = physicalSequence(left.event) - physicalSequence(right.event);
      if (physical) return physical;
      return left.event.id.localeCompare(right.event.id);
    })
    .map(({ event }, index) => ({ ...event, sequence: index + 1 }));
}
