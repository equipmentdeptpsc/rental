import { describe, expect, it, vi } from "vitest";
import { mapCustomer } from "../src/integrations/supabase/readRepositories";
import { SupabaseCustomerCommandRepository } from "../src/integrations/supabase/SupabaseCustomerCommandRepository";
import { getCustomerRuntimeCapability } from "../src/features/customer/services/customerRuntimeCapability";

describe("remote Customer boundary",()=>{
  it("maps canonical columns explicitly without fabricating a contact person",()=>{
    const mapped=mapCustomer({id:"c",customer_code:"C-1",name:"Canonical Co",phone:"555",email:"a@example.test",address:"Site",active:true});
    expect(mapped.success).toBe(true);
    if(!mapped.success) throw new Error(mapped.error.message);
    expect(mapped.value).toMatchObject({id:"c",customerCode:"C-1",companyName:"Canonical Co",contactNumber:"555",email:"a@example.test",address:"Site",active:true});
    expect(mapped.value.contactPerson).toBeUndefined();
  });
  it("disables legacy persistence in remote mode",()=>{
    expect(getCustomerRuntimeCapability({persistenceMode:"remote",remoteOperationalWritesEnabled:true} as never,true)).toMatchObject({canonicalReads:true,canonicalMutations:true,legacyMutations:false});
  });
  it("invokes only the canonical command RPC",async()=>{
    const rpc=vi.fn().mockResolvedValue({data:{success:true,disposition:"ACCEPTED",serverOccurredAt:"2026-08-24T00:00:00Z",refresh:["c"],value:{id:"c",companyId:"co",customerCode:"C",name:"N",email:null,phone:null,address:null,active:true,deletedAt:null,createdAt:"2026-08-24T00:00:00Z",updatedAt:"2026-08-24T00:00:00Z",rowVersion:1}},error:null});
    const repository=new SupabaseCustomerCommandRepository({schema:()=>({rpc})} as never);
    const result=await repository.createCustomer({commandId:"1",idempotencyKey:"2",customerId:"123e4567-e89b-42d3-a456-426614174000",customerCode:"C",name:"N"});
    expect(result.success).toBe(true);
    expect(rpc).toHaveBeenCalledWith("command_create_customer",{command:expect.objectContaining({customerCode:"C",name:"N"})});
  });
});
