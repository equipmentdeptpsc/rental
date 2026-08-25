import { describe, expect, it, vi } from "vitest";
import { TrustedUserAdministration } from "../worker/userAdministration";

const actorId="8c570101-e232-4151-8d73-e3288a8d3c15";

function service(permissionResult:{data:{permission_code:string}[]|null;error:unknown}){
  const createUser=vi.fn(),rpc=vi.fn();
  const client={
    auth:{getUser:vi.fn().mockResolvedValue({data:{user:{id:actorId}},error:null}),admin:{createUser}},
    schema:vi.fn().mockReturnValue({
      from:(table:string)=>{
        if(table==="users")return{select:()=>({eq:()=>({maybeSingle:async()=>({data:{id:actorId,company_id:"TENANT-LOCAL-001",status:"active"},error:null})})})};
        if(table==="effective_user_permissions")return{select:()=>({eq:()=>({in:async()=>permissionResult})})};
        throw new Error(`Unexpected table ${table}`);
      },
      rpc,
    }),
  };
  return{client,createUser,rpc};
}

const request=()=>new Request("https://uat.example/api/admin/users",{method:"POST",headers:{authorization:"Bearer caller-jwt","content-type":"application/json"},body:"{}"});

describe("trusted user administration authorization classification",()=>{
  it("allows System Administrator canonical create authority past the authorization gate",async()=>{
    const fixture=service({data:[{permission_code:"users.create"},{permission_code:"roles.assign"}],error:null});
    const response=await new TrustedUserAdministration(fixture.client as never).handle(request());
    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Complete all required user fields with a valid email, password, and role.");
  });

  it.each([
    ["users.create",["roles.assign"]],
    ["roles.assign",["users.create"]],
    ["Operations Manager",[]],
    ["Finance",[]],
    ["Billing Staff",[]],
  ])("returns genuine 403 when %s authority is absent",async(_caseName,codes)=>{
    const fixture=service({data:codes.map(permission_code=>({permission_code})),error:null});
    const response=await new TrustedUserAdministration(fixture.client as never).handle(request());
    expect(response.status).toBe(403);
    expect(response.body.message).toBe("You do not have permission to perform this user-administration action.");
  });

  it("fails closed with infrastructure status and no provisioning side effect when permission lookup fails",async()=>{
    const fixture=service({data:null,error:{code:"42501",message:"sensitive database detail"}});
    const response=await new TrustedUserAdministration(fixture.client as never).handle(request());
    expect(response).toEqual({status:503,body:{success:false,message:"User authorization is temporarily unavailable."}});
    expect(fixture.createUser).not.toHaveBeenCalled();
    expect(fixture.rpc).not.toHaveBeenCalled();
    expect(JSON.stringify(response)).not.toMatch(/42501|database detail|app_permissions|service_role/);
  });
});
