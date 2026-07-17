import { describe, expect, it } from "vitest";
import { deriveDeurEventState } from "@/features/rental/deur/services/deriveDeurEventState";
const e=(activityType:any,action:any,sequence:number)=>({id:String(sequence),activityType,action,timestamp:`2026-01-01T0${sequence}:00:00.000Z`,sequence,source:"user" as const,logicalActionId:"g"});
const r=(events:any[]=[])=>({events,status:"Draft" as const,legacy:false});
describe("DEUR event state",()=>{
 it("derives empty, open, and completed shifts",()=>{expect(deriveDeurEventState(r()).shiftNotStarted).toBe(true);expect(deriveDeurEventState(r([e("shift","start",1)])).shiftOpen).toBe(true);expect(deriveDeurEventState(r([e("shift","start",1),e("shift","end",2)])).shiftCompleted).toBe(true)});
 it("derives open primary activities",()=>{["operation","idle","mealBreak"].forEach((x:any)=>expect(deriveDeurEventState(r([e("shift","start",1),e(x,"start",2)])).openPrimaryActivity).toBe(x))});
 it("reports malformed histories",()=>{expect(deriveDeurEventState(r([e("operation","end",1)])).structuralIssues.length).toBeGreaterThan(0);expect(deriveDeurEventState(r([e("shift","start",1),e("shift","end",2),e("operation","start",3)])).structuralIssues).toContain("Event recorded after shift end.")});
});
