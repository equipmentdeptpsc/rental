import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { InMemoryDeurCommandRepository } from "@/features/rental/deur/commands/InMemoryDeurCommandRepository";
import type { DeurRecord } from "@/features/rental/deur/types";

const completed: DeurRecord = {
  id:"deur-a",rentalId:"rental",rentalEquipmentLineId:"line-a",assignmentId:"assignment-a",equipmentId:"equipment-a",operatorId:"operator-a",
  creationSource:"OPERATOR_DIGITAL",workDate:"2026-08-21",shift:"Day",status:"In Progress",legacy:false,billingLocked:false,
  events:[
    {id:"shift-start",activityType:"shift",action:"start",timestamp:"2026-08-21T00:00:00.000Z",sequence:1,source:"user"},
    {id:"operation-start",activityType:"operation",action:"start",timestamp:"2026-08-21T00:01:00.000Z",sequence:2,source:"user"},
    {id:"operation-end",activityType:"operation",action:"end",timestamp:"2026-08-21T01:00:00.000Z",sequence:3,source:"user"},
    {id:"shift-end",activityType:"shift",action:"end",timestamp:"2026-08-21T01:00:00.000Z",sequence:4,source:"user"},
  ],
  logs:[],totalOperatingMinutes:59,totalIdleMinutes:0,totalStandbyMinutes:0,totalMaintenanceMinutes:0,totalMealBreakMinutes:0,totalMobilizationMinutes:0,totalDemobilizationMinutes:0,
  createdAt:"2026-08-21T00:00:00.000Z",updatedAt:"2026-08-21T01:00:00.000Z",
};
const fixture=(permissions:string[],operatorId="operator-a",record:DeurRecord=completed)=>new InMemoryDeurCommandRepository({
  actor:()=>({userId:`user-${operatorId}`,operatorId,permissions,status:"active"}),rentals:[{id:"rental",status:"Active"}],
  lines:[{id:"line-a",rentalId:"rental",equipmentId:"equipment-a",operatorId:"operator-a",assignmentId:"assignment-a",status:"Active"}],
  assignments:[{id:"assignment-a",equipmentId:"equipment-a",operatorId:"operator-a",status:"Active"}],operators:[{id:"operator-a",status:"Active"}],records:[{record,version:1}],
});
const command={commandId:"submit-1",idempotencyKey:"submit-1",rentalId:"rental",rentalLineId:"line-a",equipmentId:"equipment-a",operatorId:"operator-a",assignmentId:"assignment-a",deurId:"deur-a",expectedVersion:1};

describe("P0 Operator own-DEUR submission authorization",()=>{
  it("allows deur.create to submit the assigned Operator's completed DEUR and replays without duplication",async()=>{
    const repository=fixture(["deur.create"]);
    await expect(repository.submitDeur(command)).resolves.toMatchObject({success:true,disposition:"ACCEPTED",record:{status:"Submitted"}});
    await expect(repository.submitDeur(command)).resolves.toMatchObject({success:true,disposition:"REPLAYED",record:{status:"Submitted"}});
    expect(repository.snapshot("deur-a")?.record.reviewHistory?.filter(item=>item.action==="submitted")).toHaveLength(1);
  });

  it("denies review-only authority and cross-Operator ownership",async()=>{
    await expect(fixture(["deur.review"]).submitDeur(command)).resolves.toMatchObject({success:false,code:"FORBIDDEN"});
    await expect(fixture(["deur.create"],"operator-b").submitDeur(command)).resolves.toMatchObject({success:false,code:"OWNERSHIP_MISMATCH"});
  });

  it("denies submit before End Shift and preserves the editable record",async()=>{
    const active={...completed,events:completed.events!.slice(0,2)};
    const repository=fixture(["deur.create"],"operator-a",active);
    await expect(repository.submitDeur(command)).resolves.toMatchObject({success:false,code:"INVALID_TRANSITION"});
    expect(repository.snapshot("deur-a")?.record.status).toBe("In Progress");
  });

  it("uses create for submit while retaining review as a separate authority",()=>{
    const migration=readFileSync("supabase/migrations/20260821000100_operator_own_deur_submission.sql","utf8");
    const repository=readFileSync("src/features/rental/deur/repository/deurRepository.ts","utf8");
    expect(migration).toContain("validate_deur_command_scope(command,'deur.create')");
    expect(migration).not.toContain("validate_deur_command_scope(command,'deur.review')");
    expect(repository.slice(repository.indexOf("  submit(id:"),repository.indexOf("  setOperatorMeterReading"))).toContain('assertMutationPermission(authenticatedUser, "deur.create")');
    expect(repository.slice(repository.indexOf("  acknowledge(id:"),repository.indexOf("  createCorrection"))).toContain('assertMutationPermission(authenticatedUser, "deur.review")');
  });

  it("keeps history collapsed, summary totals visible, actions outside history, and handles authorization failures",()=>{
    const page=readFileSync("src/pages/OperatorDeur/index.tsx","utf8");
    expect(page).toContain('<details className="rounded-lg border bg-slate-50 p-3">');
    expect(page).not.toContain("<details open");
    for(const label of ["Operation","Idle","Standby","Breakdown"])expect(page).toContain(`>${label}<`);
    expect(page.indexOf("Start Idle")).toBeLessThan(page.indexOf("View Activity History"));
    expect(page).toContain("error instanceof AuthorizationError");
    expect(page).toContain('setPendingAction("SUBMIT")');
  });
});
