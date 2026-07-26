import type { CanonicalDeurEvent, DeurActivityTypeCanonical, DeurTotals } from "../types";
import { calculateDeurTotals } from "./calculateDeurTotals";

export interface ManualDeurTimelineEntry { activityType: Exclude<DeurActivityTypeCanonical,"shift">; start: string; end: string }
type Result = { success:true;events:CanonicalDeurEvent[];totals:DeurTotals } | { success:false;issues:string[] };
const allowed=new Set(["operation","idle","mealBreak","breakdown"]);
export function combineManualTimelineDateAndTimes(workDate:string,entries:ManualDeurTimelineEntry[]):ManualDeurTimelineEntry[]{
  if(!/^\d{4}-\d{2}-\d{2}$/.test(workDate))throw new Error("A valid DEUR Work Date is required.");
  return entries.map((entry)=>{
    if(!/^\d{2}:\d{2}$/.test(entry.start)||!/^\d{2}:\d{2}$/.test(entry.end))throw new Error("Each Paper Timeline row requires valid Start Time and End Time.");
    const start=new Date(`${workDate}T${entry.start}:00`);
    const end=new Date(`${workDate}T${entry.end}:00`);
    if(end<=start)end.setDate(end.getDate()+1);
    return{...entry,start:start.toISOString(),end:end.toISOString()};
  });
}
export function buildManualDeurTimeline({entries,shiftStart,shiftEnd}:{entries:ManualDeurTimelineEntry[];shiftStart?:string;shiftEnd?:string}):Result{
  const input=structuredClone(entries);const issues:string[]=[];
  if(!input.length)issues.push("At least one timeline entry is required.");
  const parsed=input.map((entry,index)=>({entry,index,start:Date.parse(entry.start),end:Date.parse(entry.end)}));
  parsed.forEach(({entry,start,end},index)=>{if(!allowed.has(entry.activityType))issues.push(`Entry ${index+1} has an invalid state.`);if(!Number.isFinite(start))issues.push(`Entry ${index+1} requires a valid start.`);if(!Number.isFinite(end))issues.push(`Entry ${index+1} requires a valid end.`);if(Number.isFinite(start)&&Number.isFinite(end)&&end<=start)issues.push(`Entry ${index+1} must have a positive duration.`)});
  const ordered=parsed.sort((a,b)=>a.start-b.start||a.end-b.end||a.index-b.index);
  for(let i=1;i<ordered.length;i++)if(ordered[i].start<ordered[i-1].end)issues.push("Timeline entries must not overlap.");
  const boundaryStart=shiftStart?Date.parse(shiftStart):undefined,boundaryEnd=shiftEnd?Date.parse(shiftEnd):undefined;
  if(shiftStart&&!Number.isFinite(boundaryStart))issues.push("Shift start is invalid.");if(shiftEnd&&!Number.isFinite(boundaryEnd))issues.push("Shift end is invalid.");
  if(Number.isFinite(boundaryStart)&&Number.isFinite(boundaryEnd)&&boundaryEnd!<=boundaryStart!)issues.push("Shift boundaries must have a positive duration.");
  if(Number.isFinite(boundaryStart)&&ordered.some(x=>x.start<boundaryStart!))issues.push("Timeline starts before the shift boundary.");if(Number.isFinite(boundaryEnd)&&ordered.some(x=>x.end>boundaryEnd!))issues.push("Timeline ends after the shift boundary.");
  if(issues.length)return{success:false,issues};
  const first=shiftStart??ordered[0].entry.start,last=shiftEnd??ordered.at(-1)!.entry.end;let sequence=1;
  const event=(activityType:DeurActivityTypeCanonical,action:"start"|"end",timestamp:string):CanonicalDeurEvent=>({id:crypto.randomUUID(),activityType,action,timestamp,sequence:sequence++,source:"user"});
  const events=[event("shift","start",first),...ordered.flatMap(x=>[event(x.entry.activityType,"start",x.entry.start),event(x.entry.activityType,"end",x.entry.end)]),event("shift","end",last)];
  const calculated=calculateDeurTotals(events);if(calculated.calculationIssues.length)return{success:false,issues:calculated.calculationIssues};return{success:true,events,totals:calculated.totals};
}
