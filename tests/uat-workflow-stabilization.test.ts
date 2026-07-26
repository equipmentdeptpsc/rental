import { describe, expect, it } from "vitest";
import { combineManualTimelineDateAndTimes, buildManualDeurTimeline } from "@/features/rental/deur/services/buildManualDeurTimeline";
import { acknowledgeDeur, rejectDeur } from "@/features/rental/deur/services/reviewLifecycle";
import { resolveDeurPresentation } from "@/features/rental/deur/presentation/resolveDeurPresentation";
import type { DeurRecord } from "@/features/rental/deur/types";

const deur=(status:DeurRecord["status"]="Submitted"):DeurRecord=>({
  id:"550e8400-e29b-41d4-a716-446655440000",deurNumber:"DEUR-000001",rentalId:"rental-id",rentalEquipmentLineId:"line-id",
  equipmentId:"equipment-id",operatorId:"operator-id",workDate:"2026-07-23",shift:"Day",logs:[],events:[],
  totalOperatingMinutes:60,totalIdleMinutes:0,totalMaintenanceMinutes:0,totalMealBreakMinutes:0,totalMobilizationMinutes:0,totalDemobilizationMinutes:0,
  status,createdAt:"2026-07-23T00:00:00Z",updatedAt:"2026-07-23T00:00:00Z",
});

describe("UAT workflow stabilization",()=>{
  it("combines the parent Work Date with time-only paper rows and supports overnight work",()=>{
    const rows=combineManualTimelineDateAndTimes("2026-07-23",[{activityType:"operation",start:"22:00",end:"02:00"}]);
    expect(rows[0].start).toContain("2026-07-23");
    expect(new Date(rows[0].end).getTime()-new Date(rows[0].start).getTime()).toBe(4*60*60*1000);
    const result=buildManualDeurTimeline({entries:rows});
    expect(result.success).toBe(true);
    if(result.success)expect(result.totals.operationMinutes).toBe(240);
  });

  it("keeps legacy full timestamps accepted by the manual timeline service",()=>{
    expect(buildManualDeurTimeline({entries:[{activityType:"idle",start:"2026-07-23T08:00:00Z",end:"2026-07-23T09:00:00Z"}]}).success).toBe(true);
  });

  it("captures the Customer contact snapshot and blocks duplicate decisions",()=>{
    const reviewed=acknowledgeDeur(deur(),{id:"customer-id",name:"Juan Customer",email:"customer@example.test"},"2026-07-23T10:00:00Z");
    expect(reviewed.success).toBe(true);
    if(!reviewed.success)return;
    expect(reviewed.record.reviewHistory?.at(-1)).toMatchObject({action:"acknowledged",actorName:"Juan Customer",actorEmail:"customer@example.test"});
    expect(acknowledgeDeur(reviewed.record,{name:"Juan Customer"}).success).toBe(false);
    expect(rejectDeur(deur(),{name:"Juan Customer"},"").success).toBe(false);
  });

  it("renders Daily Operations relationships without repository UUIDs",()=>{
    const value=resolveDeurPresentation({
      deur:deur(),
      lines:[{id:"line-id",rentalId:"rental-id",equipmentId:"equipment-id",operatorId:"operator-id",status:"Released",createdAt:"",updatedAt:""}],
      equipment:[{id:"equipment-id",prefixId:"ME",assetNo:"ME-000002",equipmentName:"UAT 3",category:"Moving Equipment",status:"Rented",maintenanceType:"Engine Hours",currentReading:0,projectId:"",operatorId:""}],
      operators:[{id:"operator-id",name:"UAT operator 3",email:"operator@example.test",licenseNumber:"LIC-3",certificationType:"Heavy Machinery",status:"Active",joinedDate:"2026-01-01"}],
    });
    expect(value).toEqual({equipment:"UAT 3 (ME-000002)",line:"UAT 3 / Rental Line 1",operator:"UAT operator 3"});
    expect(JSON.stringify(value)).not.toMatch(/550e8400|equipment-id|operator-id|line-id/);
  });
});
