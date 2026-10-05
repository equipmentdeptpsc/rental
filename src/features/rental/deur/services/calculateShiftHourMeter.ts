import type { CanonicalDeurEvent } from "../types";
import { orderEffectiveDeurEvents } from "./effectiveDeurEventOrder";

/** Operating and Idle time only, derived from the effective event timeline. */
export function calculateShiftHourMeterSeconds(events: readonly CanonicalDeurEvent[], asOf: string, creationSource?: string): number {
  const now = Date.parse(asOf);
  if (!Number.isFinite(now)) return 0;
  const ordered = orderEffectiveDeurEvents({ events, creationSource });
  const ended = ordered.find((event) => event.activityType === "shift" && event.action === "end");
  const end = ended ? Math.min(now, Date.parse(ended.timestamp)) : now;
  if (!Number.isFinite(end)) return 0;
  const open = new Map<"operation" | "idle", number>();
  const intervals: Array<[number, number]> = [];
  for (const event of ordered) {
    if (event.activityType !== "operation" && event.activityType !== "idle") continue;
    const at = Date.parse(event.timestamp);
    if (!Number.isFinite(at) || at > end) continue;
    if (event.action === "start") {
      if (!open.has(event.activityType)) open.set(event.activityType, at);
    } else {
      const start = open.get(event.activityType);
      if (start !== undefined && at > start) intervals.push([start, at]);
      open.delete(event.activityType);
    }
  }
  for (const start of open.values()) if (end > start) intervals.push([start, end]);
  intervals.sort((a, b) => a[0] - b[0]);
  let total = 0, coveredUntil = -Infinity;
  for (const [start, stop] of intervals) {
    total += Math.max(0, stop - Math.max(start, coveredUntil));
    coveredUntil = Math.max(coveredUntil, stop);
  }
  return Math.floor(total / 1000);
}
