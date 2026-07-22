import {describe,expect,it,vi} from "vitest";
import type {SupabaseClient} from "@supabase/supabase-js";
import {createApplicationDependencies} from "@/app/composition";
import {getSupabaseBrowserClient} from "@/integrations/supabase/browserClient";
import {SupabaseEquipmentStatusReadRepository} from "@/features/masters/equipment-status/repository";

class Query implements PromiseLike<{data:unknown;error:any}>{
  constructor(private readonly response:{data:unknown;error:any}){}
  select(){return this;}order(){return this;}eq(){return this;}abortSignal(){return this;}maybeSingle(){return this;}
  then<TResult1= {data:unknown;error:any},TResult2=never>(onfulfilled?:((value:{data:unknown;error:any})=>TResult1|PromiseLike<TResult1>)|null,onrejected?:((reason:any)=>TResult2|PromiseLike<TResult2>)|null){return Promise.resolve(this.response).then(onfulfilled,onrejected);}
}
function client(response:{data:unknown;error:any}){const query=new Query(response);return{schema:vi.fn(()=>({from:vi.fn(()=>query)}))} as unknown as SupabaseClient;}
const rows=[{id:"s2",code:"B",name:"Rented",description:null,active:true,deleted_at:null,sort_order:20},{id:"s1",code:"A",name:"Available",description:"Ready",active:true,deleted_at:null,sort_order:10}];

describe("Supabase Equipment Status read repository",()=>{
  it("maps, deterministically orders, and returns defensive records",async()=>{const repository=new SupabaseEquipmentStatusReadRepository(client({data:rows,error:null}));const result=await repository.list();expect(result).toMatchObject({success:true,value:[{id:"s1",status:"Available"},{id:"s2",status:"Rented",description:"",active:true,deleted:false}]});if(result.success){result.value[0].status="changed";expect(rows[1].name).toBe("Available");}});
  it("maps getById and null",async()=>{expect(await new SupabaseEquipmentStatusReadRepository(client({data:rows[0],error:null})).getById("s2")).toMatchObject({success:true,value:{id:"s2",status:"Rented"}});expect(await new SupabaseEquipmentStatusReadRepository(client({data:null,error:null})).getById("missing")).toEqual({success:true,value:null});});
  it("maps cancellation, SQLSTATE, network, timeout, schema, and malformed rows",async()=>{const controller=new AbortController();controller.abort();expect(await new SupabaseEquipmentStatusReadRepository(client({data:[],error:null})).list({signal:controller.signal})).toMatchObject({success:false,error:{code:"REPOSITORY_REQUEST_CANCELLED"}});expect(await new SupabaseEquipmentStatusReadRepository(client({data:null,error:{code:"42501",message:"denied"}})).list()).toMatchObject({success:false,error:{code:"REPOSITORY_ACCESS_DENIED",context:{sqlState:"42501"}}});expect(await new SupabaseEquipmentStatusReadRepository(client({data:null,error:{message:"Failed to fetch"}})).list()).toMatchObject({success:false,error:{code:"REPOSITORY_NETWORK_FAILED"}});expect(await new SupabaseEquipmentStatusReadRepository(client({data:null,error:{message:"Request timed out"}})).list()).toMatchObject({success:false,error:{code:"REPOSITORY_TIMEOUT"}});expect(await new SupabaseEquipmentStatusReadRepository(client({data:null,error:{code:"PGRST205",message:"missing"}})).list()).toMatchObject({success:false,error:{code:"REPOSITORY_SCHEMA_MISMATCH"}});expect(await new SupabaseEquipmentStatusReadRepository(client({data:[{id:1}],error:null})).list()).toMatchObject({success:false,error:{code:"EQUIPMENT_STATUS_ROW_MALFORMED"}});});
});

describe("Equipment Status composition",()=>{
  it("keeps local as the default and requires explicit remote configuration",async()=>{expect(createApplicationDependencies({}).configuration.equipmentStatusSource).toBe("local");const remote=createApplicationDependencies({equipmentStatusSource:"supabase"});expect(remote.configuration.equipmentStatusSource).toBe("supabase");expect(await remote.repositories.equipmentStatusRead.list()).toMatchObject({success:false,error:{code:"SUPABASE_CONFIGURATION_MISSING"}});});
  it("reuses one browser client for identical configuration",()=>{const configuration={url:"https://example.supabase.co",publishableKey:"sb_publishable_test_value"};expect(getSupabaseBrowserClient(configuration)).toBe(getSupabaseBrowserClient(configuration));});
});
