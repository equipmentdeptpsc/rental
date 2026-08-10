import type { PublicReviewTimelineEntry } from "./publicReviewContracts";

export interface PublicReviewInterval {
  sequence: number;
  activity: string;
  start: string;
  end: string;
  durationSeconds: number;
  workDescription?: string;
  remarks?: string;
  openingMeter?: number;
  closingMeter?: number;
  idleReasonLabel?: string;
}

export function buildPublicReviewIntervals(events: readonly PublicReviewTimelineEntry[]): PublicReviewInterval[] {
  const open = new Map<string, PublicReviewTimelineEntry>();
  const result: PublicReviewInterval[] = [];
  for (const event of [...events].sort((a,b)=>a.sequence-b.sequence || Date.parse(a.occurredAt)-Date.parse(b.occurredAt))) {
    if (event.activity === "shift") continue;
    if (event.action === "start") { open.set(event.activity,event); continue; }
    const start=open.get(event.activity); if(!start) continue;
    const seconds=Math.max(0,Math.floor((Date.parse(event.occurredAt)-Date.parse(start.occurredAt))/1000));
    result.push({sequence:result.length+1,activity:event.activity,start:start.occurredAt,end:event.occurredAt,durationSeconds:seconds,workDescription:start.workDescription??event.workDescription,remarks:start.remarks??event.remarks,openingMeter:start.meterReading,closingMeter:event.meterReading,idleReasonLabel:start.idleReasonLabel??event.idleReasonLabel});
    open.delete(event.activity);
  }
  return result;
}
