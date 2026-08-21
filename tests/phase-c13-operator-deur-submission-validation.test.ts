import { beforeEach, describe, expect, it } from "vitest";
import type { User } from "@/features/auth/domain/user";
import { storage } from "@/core/storage";
import { InMemoryDeurCommandRepository } from "@/features/rental/deur/commands/InMemoryDeurCommandRepository";
import { LocalDeurCommandRepository } from "@/features/rental/deur/commands/LocalDeurCommandRepository";
import { applyDigitalDeurOperatorAction } from "@/features/rental/deur/operator/applyDigitalDeurOperatorAction";
import { deurRepository } from "@/features/rental/deur/repository/deurRepository";
import { submitDeur } from "@/features/rental/deur/services/reviewLifecycle";
import { formatDeurSubmissionIssues, validateDeurSubmission } from "@/features/rental/deur/services/validateDeurSubmission";
import type { CanonicalDeurEvent, DeurRecord } from "@/features/rental/deur/types";

const events=(open=true):CanonicalDeurEvent[]=>[
  {id:"shift-start",activityType:"shift",action:"start",timestamp:"2026-08-08T00:00:00.000Z",sequence:1,source:"user"},
  {id:"operation-start",activityType:"operation",action:"start",timestamp:"2026-08-08T00:01:00.000Z",sequence:2,source:"user"},
  ...(!open?[{id:"operation-end",activityType:"operation" as const,action:"end" as const,timestamp:"2026-08-08T01:00:00.000Z",sequence:3,source:"user" as const},{id:"shift-end",activityType:"shift" as const,action:"end" as const,timestamp:"2026-08-08T01:00:00.000Z",sequence:4,source:"user" as const}]:[]),
];
const record=(id="deur-a",line="line-a",overrides:Partial<DeurRecord>={}):DeurRecord=>({id,rentalId:"rental",rentalEquipmentLineId:line,assignmentId:`assignment-${line}`,equipmentId:`equipment-${line}`,operatorId:"operator",creationSource:"OPERATOR_DIGITAL",evidenceMode:"COMPLETION",completionEvidence:{status:"IN_PROGRESS"},workDate:"2026-08-08",shift:"Day",events:events(false),logs:[],legacy:false,totalOperatingMinutes:59,totalIdleMinutes:0,totalStandbyMinutes:0,totalMaintenanceMinutes:0,totalMealBreakMinutes:0,totalMobilizationMinutes:0,totalDemobilizationMinutes:0,status:"In Progress",billingLocked:false,createdAt:"2026-08-08T00:00:00.000Z",updatedAt:"2026-08-08T01:00:00.000Z",...overrides});
const user:User={id:"user",username:"operator",displayName:"Operator",operatorId:"operator",systemRoles:["rental-operations"],status:"active",createdAt:"",updatedAt:""};

describe("operator Digital DEUR submission validation",()=>{
  beforeEach(()=>storage.remove("equipment-rental-deur"));

  it("identifies incomplete One Lot completion evidence with an actionable correction",()=>{
    const validation=validateDeurSubmission(record());expect(validation).toMatchObject({eligible:false,issues:[{code:"COMPLETION_EVIDENCE_REQUIRED"}]});
    if(validation.eligible)return;expect(formatDeurSubmissionIssues(validation.issues)).toBe("Cannot submit Digital DEUR.\n\nComplete the following before submission:\n• The One Lot work is not marked completed. End the shift to mark the work completed before submitting.");
    expect(submitDeur(record(),{name:"Operator"})).toMatchObject({success:false,issues:[{code:"COMPLETION_EVIDENCE_REQUIRED"}]});
  });

  it("marks canonical completion evidence completed when the operator ends the shift",()=>{
    const active=record("deur-a","line-a",{events:events(true),completionEvidence:{status:"IN_PROGRESS"}});
    const ended=applyDigitalDeurOperatorAction({deur:active,action:"END_SHIFT",actionTimestamp:"2026-08-08T01:00:00.000Z",actor:{id:"user",name:"Operator"}});
    expect(ended).toMatchObject({success:true,record:{completionEvidence:{status:"COMPLETED",completedAt:"2026-08-08T01:00:00.000Z"}}});
    if(!ended.success)return;expect(submitDeur(ended.record,{id:"user",name:"Operator"})).toMatchObject({success:true,record:{status:"Submitted"}});
  });

  it("returns all independent timeline requirements without treating a running activity as complete",()=>{
    const timeline=record("timeline","line-a",{evidenceMode:"TIME_TIMELINE",completionEvidence:undefined,events:events(true),totalOperatingMinutes:0});
    const validation=validateDeurSubmission(timeline);expect(validation).toMatchObject({eligible:false});if(validation.eligible)return;
    expect(validation.issues.map(item=>item.code)).toEqual(expect.arrayContaining(["ACTIVE_ACTIVITY_MUST_END","SHIFT_COMPLETION_REQUIRED","ACTIVITY_INTERVAL_REQUIRED"]));
  });

  it("keeps validation and persistence isolated by rental line",async()=>{
    const repository=new InMemoryDeurCommandRepository({actor:()=>({userId:"user",operatorId:"operator",permissions:["deur.create"],status:"active"}),rentals:[{id:"rental",status:"Active"}],lines:[{id:"line-a",rentalId:"rental",equipmentId:"equipment-line-a",operatorId:"operator",assignmentId:"assignment-line-a",status:"Active"},{id:"line-b",rentalId:"rental",equipmentId:"equipment-line-b",operatorId:"operator",assignmentId:"assignment-line-b",status:"Active"}],assignments:[{id:"assignment-line-a",equipmentId:"equipment-line-a",operatorId:"operator",status:"Active"},{id:"assignment-line-b",equipmentId:"equipment-line-b",operatorId:"operator",status:"Active"}],operators:[{id:"operator",status:"Active"}],records:[{record:record("deur-a","line-a"),version:1},{record:record("deur-b","line-b",{completionEvidence:{status:"COMPLETED",completedAt:"2026-08-08T01:00:00.000Z"}}),version:1}]});
    const command=(deurId:string,line:string)=>({commandId:`command-${deurId}`,idempotencyKey:`key-${deurId}`,rentalId:"rental",rentalLineId:line,equipmentId:`equipment-${line}`,operatorId:"operator",assignmentId:`assignment-${line}`,deurId,expectedVersion:1});
    await expect(repository.submitDeur(command("deur-a","line-a"))).resolves.toMatchObject({success:false,submissionIssues:[{code:"COMPLETION_EVIDENCE_REQUIRED"}]});
    expect(repository.snapshot("deur-a")?.record.status).toBe("In Progress");expect(repository.snapshot("deur-b")?.record.status).toBe("In Progress");
    await expect(repository.submitDeur(command("deur-b","line-b"))).resolves.toMatchObject({success:true,record:{rentalEquipmentLineId:"line-b",status:"Submitted"}});
  });

  it("survives persistence re-instantiation and keeps authorization enforced with no denied write",async()=>{
    deurRepository.create(record("persisted","line-a",{completionEvidence:{status:"COMPLETED",completedAt:"2026-08-08T01:00:00.000Z"}}));
    expect(deurRepository.getById("persisted")?.completionEvidence).toMatchObject({status:"COMPLETED"});
    const before=deurRepository.getById("persisted");const deniedUser:User={...user,id:"management",operatorId:undefined,systemRoles:["management"]};const denied=new LocalDeurCommandRepository(()=>deniedUser);
    await expect(denied.submitDeur({commandId:"c",idempotencyKey:"k",rentalId:"rental",rentalLineId:"line-a",equipmentId:"equipment-line-a",operatorId:"operator",assignmentId:"assignment-line-a",deurId:"persisted",expectedVersion:0})).rejects.toThrow();
    expect(deurRepository.getById("persisted")).toEqual(before);
    const restored=new LocalDeurCommandRepository(()=>user);
    await expect(restored.submitDeur({commandId:"c2",idempotencyKey:"k2",rentalId:"rental",rentalLineId:"line-a",equipmentId:"equipment-line-a",operatorId:"operator",assignmentId:"assignment-line-a",deurId:"persisted",expectedVersion:0})).resolves.toMatchObject({success:true,record:{status:"Submitted"}});
  });
});
