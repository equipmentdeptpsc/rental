import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import worker from "../worker/index";
import { TrustedOperatorPinAuthentication, isValidOperatorPin, type UsernameLoginLimiters } from "../worker/usernameAuthentication";
import { TrustedUserAdministration } from "../worker/userAdministration";

const migration=readFileSync("supabase/migrations/20260903000300_operator_pin_canonical_foundation.sql","utf8");
const workerSource=readFileSync("worker/userAdministration.ts","utf8");
const actorId="7e45cfaa-3c1e-41ca-af92-d129a2709d71",operatorUserId="995570c1-49f8-42bb-bf3e-ff045708437b";
const session={access_token:"access-token",refresh_token:"refresh-token"};
const allow=()=>({limit:vi.fn(async()=>({success:true}))});
const limiters=():UsernameLoginLimiters=>({networkBurst:allow(),networkSustained:allow(),identifierBurst:allow(),identifierSustained:allow()});

function operatorPinRequest(identifier="uat.operator.001",pin="482917"){
  return new Request("https://uat.example/api/auth/operator-pin-login",{method:"POST",headers:{"content-type":"application/json","cf-connecting-ip":"192.0.2.10"},body:JSON.stringify({identifier,pin})});
}

function resetOperatorPinRequest(target=operatorUserId,body:Record<string,string>={newPin:"482917",confirmNewPin:"482917",commandId:"pin-reset-command",idempotencyKey:"pin-reset-key"}){
  return new Request(`https://uat.example/api/admin/users/${target}/reset-operator-pin`,{method:"POST",headers:{authorization:"Bearer caller-jwt","content-type":"application/json"},body:JSON.stringify(body)});
}

function resetFixture(permissionCodes=["users.password.reset"],prepared:{success:boolean;state?:string;code?:string}={success:true,state:"NEW"}){
  let userRead=0;
  const updateUserById=vi.fn(async()=>({error:null}));
  const rpc=vi.fn(async(name:string)=>({data:name==="prepare_operator_pin_reset"?prepared:{success:true,state:"COMPLETED"},error:null}));
  const client={
    auth:{getUser:vi.fn(async()=>({data:{user:{id:actorId}},error:null})),admin:{updateUserById}},
    schema:vi.fn(()=>({
      from:(table:string)=>{
        if(table==="effective_user_permissions")return{select:()=>({eq:()=>({in:async()=>({data:permissionCodes.map(permission_code=>({permission_code})),error:null})})})};
        if(table==="users")return{select:()=>{const builder:any={eq:()=>builder,maybeSingle:async()=>++userRead===1?{data:{id:actorId,company_id:"TENANT-LOCAL-001",status:"active"},error:null}:{data:{id:operatorUserId,company_id:"TENANT-LOCAL-001",operator_id:"operator-1",status:"active"},error:null}};return builder;}};
        throw new Error(`Unexpected table ${table}`);
      },rpc,
    })),
  };
  return{client,updateUserById,rpc};
}

describe("Milestone 11.1 canonical Operator PIN foundation",()=>{
  it.each(["482917","120983","908172"])("accepts a valid six-digit PIN without persisting it: %s",pin=>expect(isValidOperatorPin(pin)).toBe(true));
  it.each(["48291","4829170","482a17","000000","111111","123456","654321","012345","987654"])("rejects weak or invalid PIN %s",pin=>expect(isValidOperatorPin(pin)).toBe(false));

  it("adds only a mode model: legacy defaults stay PASSWORD and non-Operators cannot enter PIN mode",()=>{
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS credential_mode text NOT NULL DEFAULT 'PASSWORD'");
    expect(migration).toContain("credential_mode IN ('PASSWORD','OPERATOR_PIN')");
    expect(migration).toContain("operator_id IS NOT NULL OR credential_mode = 'PASSWORD'");
    expect(migration).not.toMatch(/(?:pin_hash|pin_value|newPin|confirmNewPin|plaintext)/i);
  });

  it("resets a linked Operator through the existing narrow permission and a password-free command/audit contract",async()=>{
    const fixture=resetFixture();
    expect(await new TrustedUserAdministration(fixture.client as never).handle(resetOperatorPinRequest())).toEqual({status:200,body:{success:true}});
    expect(fixture.updateUserById).toHaveBeenCalledWith(operatorUserId,{password:"482917"});
    expect(fixture.rpc.mock.calls.map(call=>call[0])).toEqual(["prepare_operator_pin_reset","complete_operator_pin_reset"]);
    const serialized=JSON.stringify(fixture.rpc.mock.calls);
    expect(serialized).not.toContain("482917");
    for(const token of["users.password.reset","OPERATOR_PIN_RESET","credential_mode = 'OPERATOR_PIN'","credential_type = 'OPERATOR_PIN'","erp.operators","u.company_id = tenant"])expect(migration).toContain(token);
  });

  it("rejects unauthorized, malformed, and idempotency-conflicted reset attempts before changing Supabase Auth",async()=>{
    const denied=resetFixture([]);
    expect((await new TrustedUserAdministration(denied.client as never).handle(resetOperatorPinRequest())).status).toBe(403);
    expect(denied.updateUserById).not.toHaveBeenCalled();
    const invalid=resetFixture();
    expect((await new TrustedUserAdministration(invalid.client as never).handle(resetOperatorPinRequest(operatorUserId,{newPin:"123456",confirmNewPin:"123456",commandId:"id",idempotencyKey:"key"}))).status).toBe(400);
    expect(invalid.updateUserById).not.toHaveBeenCalled();
    const mismatch=resetFixture(["users.password.reset"],{success:false,code:"IDEMPOTENCY_MISMATCH"});
    expect((await new TrustedUserAdministration(mismatch.client as never).handle(resetOperatorPinRequest())).status).toBe(409);
    expect(mismatch.updateUserById).not.toHaveBeenCalled();
  });

  it("keeps the reset API explicit, tenant-safe, and secret-free",()=>{
    expect(workerSource).toContain("reset-operator-pin");
    expect(workerSource).toContain("prepare_operator_pin_reset");
    expect(workerSource).not.toMatch(/console\.|newPin.*audit|audit.*newPin/i);
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION[\s\S]*FROM PUBLIC,anon,authenticated/);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION[\s\S]*TO service_role/);
    expect(migration).not.toMatch(/GRANT (?:SELECT|UPDATE|INSERT|DELETE)[\s\S]*erp\.users/i);
  });

  it("authenticates only a PIN-mode linked Operator with the existing rate-limit and session contract",async()=>{
    const rpc=vi.fn(async()=>({data:{success:true,email:"operator@example.test"},error:null}));
    const signInWithPassword=vi.fn(async()=>({data:{session},error:null}));
    const limits=limiters();
    const result=await new TrustedOperatorPinAuthentication({schema:()=>({rpc})},{auth:{signInWithPassword}},limits).handle(operatorPinRequest());
    expect(result).toEqual({status:200,body:{success:true,session:{accessToken:"access-token",refreshToken:"refresh-token"}}});
    expect(rpc).toHaveBeenCalledWith("resolve_active_operator_pin_login",{identifier:"uat.operator.001"});
    expect(signInWithPassword).toHaveBeenCalledWith({email:"operator@example.test",password:"482917"});
    for(const binding of Object.values(limits))expect(binding.limit).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["PASSWORD-mode Operator",{success:false}],
    ["non-Operator",{success:false}],
    ["inactive Operator",{success:false}],
    ["unknown username",{success:false}],
    ["wrong PIN",{success:true,email:"operator@example.test"}],
  ])("returns the same normalized failure for %s",async(_case,resolved)=>{
    const service=new TrustedOperatorPinAuthentication({schema:()=>({rpc:async()=>({data:resolved,error:null})})},{auth:{signInWithPassword:async()=>({data:{session:null},error:{message:"invalid"}})}},limiters());
    expect(await service.handle(operatorPinRequest())).toEqual({status:401,body:{success:false,message:"Invalid username/email or password."}});
  });

  it("exposes a POST-only CORS-safe route while retaining the existing password endpoint for staged compatibility",async()=>{
    const environment={ASSETS:{fetch:vi.fn()},USERNAME_LOGIN_ALLOWED_ORIGIN:"http://localhost:8081"};
    const options=await worker.fetch(new Request("https://uat.example/api/auth/operator-pin-login",{method:"OPTIONS",headers:{origin:"http://localhost:8081"}}),environment);
    expect(options.status).toBe(204);
    expect(options.headers.get("access-control-allow-origin")).toBe("http://localhost:8081");
    const method=await worker.fetch(new Request("https://uat.example/api/auth/operator-pin-login",{method:"GET"}),environment);
    expect(method.status).toBe(405);
    expect(readFileSync("worker/index.ts","utf8")).toContain('path==="/api/auth/username-login"');
    expect(migration).toContain("resolve_active_operator_pin_login");
  });
});
