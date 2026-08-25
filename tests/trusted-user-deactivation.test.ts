import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { SupabaseRemoteUserAdministration } from "@/integrations/supabase/SupabaseRemoteUserAdministration";
import { TrustedUserAdministration } from "../worker/userAdministration";

const migration=readFileSync("supabase/migrations/20260825000600_trusted_application_user_deactivation.sql","utf8");
const worker=readFileSync("worker/userAdministration.ts","utf8");
const page=readFileSync("src/features/users/pages/UsersPage.tsx","utf8");
const actorId="8c570101-e232-4151-8d73-e3288a8d3c15",targetId="645384d0-c872-4245-84b5-9ec16305431c";

function workerFixture(permission:{data:{permission_code:string}[]|null;error:unknown},rpcResult:{data:unknown;error:unknown}={data:{success:true,value:{id:targetId,status:"inactive"}},error:null}){
  const rpc=vi.fn().mockResolvedValue(rpcResult);
  const client={auth:{getUser:vi.fn().mockResolvedValue({data:{user:{id:actorId}},error:null})},schema:vi.fn().mockReturnValue({
    from:(table:string)=>{
      if(table==="users")return{select:()=>({eq:()=>({maybeSingle:async()=>({data:{id:actorId,company_id:"TENANT-LOCAL-001",status:"active"},error:null})})})};
      if(table==="effective_user_permissions")return{select:()=>({eq:()=>({in:async()=>permission})})};
      throw new Error(`Unexpected table ${table}`);
    },rpc,
  })};
  return{client,rpc};
}
const deactivateRequest=(body={commandId:"cmd-1",idempotencyKey:"idem-1"})=>new Request(`https://uat.example/api/admin/users/${targetId}/deactivate`,{method:"POST",headers:{authorization:"Bearer caller-jwt","content-type":"application/json"},body:JSON.stringify(body)});

describe("trusted canonical application-user deactivation",()=>{
  it("defines a service-role-only, tenant-scoped, explicit and idempotent database command",()=>{
    for(const evidence of ["command_deactivate_application_user","permission_code='users.deactivate'","actor=target","company_id=tenant","USER_DEACTIVATED","IDEMPOTENCY_MISMATCH","ALREADY_INACTIVE","PROTECTED_ACCOUNT","row_version=row_version+1"])expect(migration).toContain(evidence);
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION[\s\S]*FROM PUBLIC,anon,authenticated/);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION[\s\S]*TO service_role/);
    expect(migration).not.toMatch(/users\.manage|delete\s+from\s+erp\.(?:users|user_roles)|auth\.users/i);
  });

  it("removes effective permissions for inactive application users without deleting memberships",()=>{
    expect(migration).toContain("application_user.status='active'");
    expect(migration).not.toContain("DELETE FROM erp.user_roles");
  });

  it("uses exactly users.deactivate at the trusted Worker gate",async()=>{
    const fixture=workerFixture({data:[{permission_code:"users.deactivate"}],error:null});
    const response=await new TrustedUserAdministration(fixture.client as never).handle(deactivateRequest());
    expect(response).toMatchObject({status:200,body:{success:true,value:{id:targetId,status:"inactive"}}});
    expect(fixture.rpc).toHaveBeenCalledWith("command_deactivate_application_user",{command:{actorId,companyId:"TENANT-LOCAL-001",targetUserId:targetId,commandId:"cmd-1",idempotencyKey:"idem-1"}});
    expect(worker).not.toMatch(/deactivate[\s\S]{0,500}users\.manage/);
  });

  it.each(["Operations Manager","Finance","Billing Staff","Operator"])("denies %s without users.deactivate",async()=>{
    const fixture=workerFixture({data:[],error:null});
    const response=await new TrustedUserAdministration(fixture.client as never).handle(deactivateRequest());
    expect(response.status).toBe(403);expect(fixture.rpc).not.toHaveBeenCalled();
  });

  it("fails closed when the permission lookup or database command fails",async()=>{
    const denied=workerFixture({data:null,error:{message:"database detail"}});
    expect(await new TrustedUserAdministration(denied.client as never).handle(deactivateRequest())).toEqual({status:503,body:{success:false,message:"User authorization is temporarily unavailable."}});
    expect(denied.rpc).not.toHaveBeenCalled();
    const failed=workerFixture({data:[{permission_code:"users.deactivate"}],error:null},{data:null as never,error:{message:"database detail"}});
    expect(await new TrustedUserAdministration(failed.client as never).handle(deactivateRequest())).toEqual({status:503,body:{success:false,message:"User deactivation is temporarily unavailable."}});
  });

  it("sends only target and command identity through the established caller-token endpoint",async()=>{
    const fetcher=vi.spyOn(globalThis,"fetch").mockResolvedValue(new Response(JSON.stringify({success:true,value:{id:targetId,status:"inactive"}}),{status:200,headers:{"content-type":"application/json"}}));
    const repository=new SupabaseRemoteUserAdministration({auth:{getSession:async()=>({data:{session:{access_token:"caller-jwt"}}})}} as never);
    await repository.deactivate(targetId,"cmd-1","idem-1");
    const [url,init]=fetcher.mock.calls[0];const sent=JSON.parse(String((init as RequestInit).body));
    expect(url).toBe(`/api/admin/users/${targetId}/deactivate`);expect(sent).toEqual({commandId:"cmd-1",idempotencyKey:"idem-1"});
    expect(sent).not.toHaveProperty("actorId");expect(sent).not.toHaveProperty("companyId");fetcher.mockRestore();
  });

  it("exposes an explicit confirmed UI action only with canonical authority and keeps delete remote-disabled",()=>{
    expect(page).toContain('hasPermission("users.deactivate")');
    expect(page).toContain("You cannot deactivate your own active account.");
    expect(page).toContain("await remoteAdmin.deactivate");
    expect(page).toContain("Deactivate User");
    expect(page).toContain('disabled={remote} title={remote?"Remote deletion is not available');
  });
});
