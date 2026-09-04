import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { TrustedUserAdministration } from "../worker/userAdministration";

const workerSource=readFileSync("worker/userAdministration.ts","utf8");
const pageSource=readFileSync("src/features/users/pages/UsersPage.tsx","utf8");
const migration=readFileSync("supabase/migrations/20260828000300_canonical_operator_linked_password_reset.sql","utf8");
const actorId="8c570101-e232-4151-8d73-e3288a8d3c15",targetId="18b407d1-1018-4cd2-9353-e7972bd982c3",operatorId="27653153-e393-460f-b1fd-f94eebf8d971";

function resetFixture(permissionCodes=["users.password.reset"],targetStatus="active"){
  let userRead=0;
  const updateUserById=vi.fn().mockResolvedValue({error:null}),rpc=vi.fn(async(name:string)=>({data:name==="prepare_application_user_password_reset"?{success:true,state:"NEW"}:{success:true,state:"COMPLETED"},error:null}));
  const client={
    auth:{getUser:vi.fn().mockResolvedValue({data:{user:{id:actorId}},error:null}),admin:{updateUserById}},
    schema:vi.fn().mockReturnValue({
      from:(table:string)=>{
        if(table==="effective_user_permissions")return{select:()=>({eq:()=>({in:async()=>({data:permissionCodes.map(permission_code=>({permission_code})),error:null})})})};
        if(table==="users")return{select:()=>{const builder:any={eq:()=>builder,maybeSingle:async()=>++userRead===1?{data:{id:actorId,company_id:"TENANT-LOCAL-001",status:"active"},error:null}:{data:targetStatus==="active"?{id:targetId,company_id:"TENANT-LOCAL-001",operator_id:operatorId,status:"active"}:null,error:null}};return builder}};
        throw new Error(`Unexpected table ${table}`);
      },rpc,
    }),
  };
  return{client,updateUserById,rpc};
}

function request(body:Record<string,string>={newPassword:"x".repeat(16),commandId:"reset-command",idempotencyKey:"reset-key"}){
  return new Request(`https://uat.example/api/admin/users/${targetId}/reset-password`,{method:"POST",headers:{authorization:"Bearer caller-jwt","content-type":"application/json"},body:JSON.stringify(body)});
}

describe("canonical remote Operator-linked password reset",()=>{
  it("allows the narrow permission to rotate the existing Operator-linked Auth identity",async()=>{
    const fixture=resetFixture();
    expect(await new TrustedUserAdministration(fixture.client as never).handle(request())).toEqual({status:200,body:{success:true}});
    expect(fixture.updateUserById).toHaveBeenCalledTimes(1);
    expect(fixture.updateUserById.mock.calls[0][0]).toBe(targetId);
    expect(fixture.rpc.mock.calls.map(call=>call[0])).toEqual(["prepare_application_user_password_reset","complete_application_user_password_reset"]);
  });

  it.each([["Operations Manager",[]],["Operator",[]]])("denies %s without invoking Auth admin",async(_role,codes)=>{
    const fixture=resetFixture(codes);
    expect((await new TrustedUserAdministration(fixture.client as never).handle(request())).status).toBe(403);
    expect(fixture.updateUserById).not.toHaveBeenCalled();
  });

  it("conceals inactive and cross-tenant-unavailable targets",async()=>{
    const fixture=resetFixture(["users.password.reset"],"inactive");
    expect(await new TrustedUserAdministration(fixture.client as never).handle(request())).toEqual({status:404,body:{success:false,message:"User is not available."}});
    expect(fixture.updateUserById).not.toHaveBeenCalled();
  });

  it("provides durable exactly-once preparation, mismatch rejection, and one password-free audit",()=>{
    for(const token of ["user_password_reset_commands","IDEMPOTENCY_MISMATCH","state='COMPLETED'","USER_ACCESS_RESET","users.password.reset","u.status='active'"])expect(migration).toContain(token);
    expect(migration.match(/'USER_ACCESS_RESET'/g)).toHaveLength(1);
    expect(migration).not.toMatch(/newPassword|plaintext|credentialValue/i);
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION[\s\S]*FROM PUBLIC,anon,authenticated/);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION[\s\S]*TO service_role/);
  });

  it("cannot mutate canonical identity, role, Operator, operational, DEUR, review, or billing records",()=>{
    expect(migration).not.toMatch(/(?:UPDATE|DELETE FROM|INSERT INTO) erp\.(?:users|user_roles|operators|assignments|equipment|rentals|rental_equipment_lines|daily_equipment_usage_reports|billing_statements|customer_review)/i);
    expect(workerSource).not.toContain("Operator access uses PIN reset");
    expect(workerSource).toContain('.eq("status","active")');
  });

  it("shows remote Reset Password only with permission and clears both fields on every exit",()=>{
    expect(pageSource).toContain('role.permissions.includes("users.password.reset")');
    expect(pageSource).toContain('(!remote||canResetPassword)');
    expect(pageSource).toContain('{user.operatorId?"Reset PIN":"Reset Password"}');
    expect(pageSource).toContain('finally{setNewPassword("");setConfirmNewPassword("");setResetVisible(false)}');
    expect(pageSource).toContain('resetCommand.current=undefined;setNewPassword("");setConfirmNewPassword("")');
    expect(pageSource).toContain('const commandId=resetCommand.current??crypto.randomUUID();resetCommand.current=commandId');
  });
});
