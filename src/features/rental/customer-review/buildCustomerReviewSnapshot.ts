import type { CanonicalDeurEvent, DeurRecord } from "@/features/rental/deur/types";

export interface CustomerReviewTimelineEntry {
  activityType: string;
  start: string;
  end: string;
  durationMinutes: number;
  remarks?: string;
}

const labels: Record<string, string> = {
  operation: "Operation",
  idle: "Idle",
  mealBreak: "Standby",
  breakdown: "Breakdown",
};

export function buildCustomerReviewTimeline(events: CanonicalDeurEvent[]): CustomerReviewTimelineEntry[] {
  const open = new Map<string, CanonicalDeurEvent>();
  const timeline: CustomerReviewTimelineEntry[] = [];
  [...events].sort((a, b) => a.sequence - b.sequence).forEach((event) => {
    if (event.activityType === "shift") return;
    if (event.action === "start") return void open.set(event.activityType, event);
    const start = open.get(event.activityType);
    if (!start) return;
    timeline.push({
      activityType: labels[event.activityType] ?? event.activityType,
      start: start.timestamp,
      end: event.timestamp,
      durationMinutes: Math.max(0, Math.round((Date.parse(event.timestamp) - Date.parse(start.timestamp)) / 60_000)),
    });
    open.delete(event.activityType);
  });
  return timeline;
}

export const reviewTimelineForDeur = (deur: DeurRecord) => buildCustomerReviewTimeline(deur.events ?? []);
