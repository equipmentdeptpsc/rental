import { readFileSync } from "node:fs";
import { describe,expect,it } from "vitest";

describe("C12 canonical complete-shift identity contract",()=>{
  const contracts=readFileSync("src/features/rental/deur/commands/contracts.ts","utf8");
  const page=readFileSync("src/pages/OperatorDeur/index.tsx","utf8");
  const sql=readFileSync("supabase/migrations/20260729002400_phase_c4d_command_lookup_and_status_fix.sql","utf8");
  it("requires the complete command to carry the full canonical identity",()=>{
    expect(contracts).toContain("CompleteDeurShiftInput extends VersionedDeurCommandIdentity");
    for(const field of ["rentalId","rentalLineId","equipmentId","operatorId","assignmentId"])expect(contracts).toContain(field);
  });
  it("builds END_SHIFT from the same resolved DEUR identity used by other actions",()=>{
    const base=page.slice(page.indexOf("const commandId=crypto.randomUUID(),base="),page.indexOf("const gatewayResult=await commandGateway.executeOrQueue",page.indexOf("const commandId=crypto.randomUUID(),base=")));
    for(const token of ["rentalId:active.rentalId","rentalLineId:active.rentalEquipmentLineId","equipmentId:active.equipmentId","operatorId:active.operatorId","assignmentId:active.assignmentId","deurId:active.id"])expect(base).toContain(token);
    expect(base).toContain('action==="END_SHIFT"?{...base');
  });
  it("documents that scope validation precedes DEUR lookup and conceals missing scope as NOT_FOUND",()=>{
    const complete=sql.slice(sql.indexOf("CREATE OR REPLACE FUNCTION command_complete_deur_shift"),sql.indexOf("CREATE OR REPLACE FUNCTION command_return_rental_line"));
    expect(complete.indexOf("validate_deur_command_scope")).toBeLessThan(complete.indexOf("SELECT d.* INTO current_deur"));
    expect(complete).toContain("IF NOT FOUND THEN RETURN jsonb_build_object('success',false,'code','NOT_FOUND')");
  });
});
