import type { CanonicalDeurEvent, DeurRecord } from "@/features/rental/deur/types";

export interface CustomerReviewTimelineEntry {
  sequence: number;
  activityType: string;
  start: string;
  end: string;
  durationMinutes: number;
  durationSeconds: number;
  workDescription?: string;
  remarks?: string;
  openingMeter?: number;
  closingMeter?: number;
}

const labels: Record<string, string> = {
  operation: "Operation",
  idle: "Idle",
  standby: "Standby",
  mealBreak: "Standby",
  breakdown: "Breakdown",
};

export function buildCustomerReviewTimeline(events: CanonicalDeurEvent[]): CustomerReviewTimelineEntry[] {
  const open = new Map<string, CanonicalDeurEvent>();
  const timeline: CustomerReviewTimelineEntry[] = [];
  [...events].sort((a, b) => a.sequence - b.sequence || Date.parse(a.timestamp) - Date.parse(b.timestamp)).forEach((event) => {
    if (event.activityType === "shift") return;
    if (event.action === "start") return void open.set(event.activityType, event);
    const start = open.get(event.activityType);
    if (!start) return;
    const durationSeconds = Math.max(0, Math.floor((Date.parse(event.timestamp) - Date.parse(start.timestamp)) / 1000));
    timeline.push({
      sequence: timeline.length + 1,
      activityType: labels[event.activityType] ?? event.activityType,
      start: start.timestamp,
      end: event.timestamp,
      durationMinutes: Math.round(durationSeconds / 60),
      durationSeconds,
      workDescription: start.workDescription ?? event.workDescription,
      remarks: start.remarks ?? event.remarks,
      openingMeter: start.meterReading,
      closingMeter: event.meterReading,
    });
    open.delete(event.activityType);
  });
  return timeline;
}

export const reviewTimelineForDeur = (deur: DeurRecord) => buildCustomerReviewTimeline(deur.events ?? []);
