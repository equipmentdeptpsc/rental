import {describe,expect,it,vi} from "vitest";
import {repositorySuccess} from "@/core/persistence";
import {createRemoteCapabilities,createRemoteLogger,createRemoteRowReader,executeRemoteReadWithRetry,mapRemoteError,normalizeRemoteQueryOptions,readRemoteConfiguration,validateSupabaseConfiguration} from "@/core/remote";

describe("Remote Core",()=>{
  it.each([
    [{code:"42501"},"REPOSITORY_ACCESS_DENIED",false],
    [{code:"23505"},"REPOSITORY_CONFLICT",false],
    [{code:"23503"},"REPOSITORY_VALIDATION_FAILED",false],
    [{code:"23514"},"REPOSITORY_VALIDATION_FAILED",false],
    [{code:"40001"},"REPOSITORY_NETWORK_FAILED",true],
    [{code:"57014"},"REPOSITORY_REQUEST_CANCELLED",true],
    [{code:"22001"},"REPOSITORY_VALIDATION_FAILED",false],
    [{code:"PGRST205"},"REPOSITORY_SCHEMA_MISMATCH",false],
    [{status:429},"REPOSITORY_NETWORK_FAILED",true],
    [{status:503},"REPOSITORY_NETWORK_FAILED",true],
  ])("maps remote errors consistently",(source,code,retryable)=>{const error=mapRemoteError(source,{repository:"Test",operation:"list"});expect(error.code).toBe(code);expect(error.recoverability==="RETRYABLE").toBe(retryable);});

  it("retries only safe transient reads with exponential delays",async()=>{let attempts=0;const waits:number[]=[];const result=await executeRemoteReadWithRetry(async()=>++attempts<3?{success:false,error:mapRemoteError({status:503},{repository:"Test",operation:"list"})}:repositorySuccess("ok"),{policy:{maximumRetries:3,initialDelayMs:10,multiplier:2,maximumDelayMs:100},wait:async delay=>{waits.push(delay);}});expect(result).toEqual({success:true,value:"ok"});expect(attempts).toBe(3);expect(waits).toEqual([10,20]);});
  it("does not retry authorization or validation failures",async()=>{const operation=vi.fn(async()=>({success:false as const,error:mapRemoteError({code:"42501"},{repository:"Test",operation:"list"})}));await executeRemoteReadWithRetry(operation,{wait:async()=>{}});expect(operation).toHaveBeenCalledOnce();});
  it("normalizes paging and ordering without mutating input",()=>{const input={paging:{limit:0,offset:-4},ordering:[{field:"code"}]};expect(normalizeRemoteQueryOptions(input)).toEqual({paging:{limit:1,offset:0},ordering:[{field:"code",ascending:true}]});expect(input.ordering[0]).not.toHaveProperty("ascending");});
  it("validates centralized configuration",()=>{expect(readRemoteConfiguration({},undefined).source).toBe("local");expect(readRemoteConfiguration({},"supabase").source).toBe("supabase");expect(validateSupabaseConfiguration({source:"supabase"})).toMatchObject({success:false,error:{code:"SUPABASE_CONFIGURATION_MISSING"}});expect(validateSupabaseConfiguration({source:"supabase",supabaseUrl:"http://unsafe",supabasePublishableKey:"public"})).toMatchObject({success:false,error:{code:"SUPABASE_CONFIGURATION_INVALID"}});expect(validateSupabaseConfiguration({source:"supabase",supabaseUrl:"https://example.supabase.co",supabasePublishableKey:"public"})).toMatchObject({success:true});});
  it("redacts credentials, URLs, and common PII from logs",()=>{const sink=vi.fn();createRemoteLogger({development:true,sink}).log({category:"configuration",message:"configured",context:{token:"secret",databaseUrl:"https://secret",email:"person@example.com",repository:"EquipmentStatus"}});expect(sink).toHaveBeenCalledWith(expect.objectContaining({context:{token:"[REDACTED]",databaseUrl:"[REDACTED]",email:"[REDACTED]",repository:"EquipmentStatus"}}));});
  it("reports immutable capabilities",()=>{const capabilities=createRemoteCapabilities("ReadOnly","SupportsPaging","SupportsOrdering");expect(capabilities.supports("SupportsPaging")).toBe(true);expect(capabilities.supports("SupportsMutation")).toBe(false);});
  it("validates types, enums, defaults, and unknown fields",()=>{const result=createRemoteRowReader({id:"1",active:true,status:"OPEN",description:null,extra:1},"Test");expect(result.success).toBe(true);if(result.success){expect(result.value.requiredString("id")).toEqual({success:true,value:"1"});expect(result.value.requiredBoolean("active")).toEqual({success:true,value:true});expect(result.value.enumeration("status",["OPEN","CLOSED"])).toEqual({success:true,value:"OPEN"});expect(result.value.nullableString("description")).toEqual({success:true,value:""});expect(result.value.unknownFields(["id","active","status","description"])).toEqual(["extra"]);expect(result.value.requiredNumber("id")).toMatchObject({success:false,error:{code:"REMOTE_ROW_MALFORMED"}});}});
});
