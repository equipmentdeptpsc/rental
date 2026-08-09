import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { assertSafeSupabaseTestConfiguration, readSupabasePhaseC2TestConfiguration } from "./support/supabasePhaseC2Harness";

const enabled=process.env.RUN_C12_1_PREFLIGHT==="true";
describe.skipIf(!enabled)("Phase C12.1 isolated-UAT read-only preflight",()=>{
  it("confirms baseline identity, zero fixture residue, and no partial 04400 objects",async()=>{
    const configuration=readSupabasePhaseC2TestConfiguration();assertSafeSupabaseTestConfiguration(configuration);
    expect(configuration.allowMutation).toBe(true);expect(process.env.VITE_REMOTE_OPERATIONAL_WRITES_ENABLED).toBe("false");
    const client=createClient(configuration.url,configuration.serviceKey,{db:{schema:"erp"},auth:{persistSession:false,autoRefreshToken:false}});
    const baseline=await client.from("companies").select("id",{count:"exact",head:true}).eq("id","TENANT-LOCAL-001");
    expect(baseline.error).toBeNull();expect(baseline.count).toBe(1);
    const residue=await client.from("companies").select("id",{count:"exact",head:true}).like("id","TENANT-UAT-%");
    expect(residue.error).toBeNull();expect(residue.count).toBe(0);
    for(const [table,column] of [["users","email"],["rentals","customer_review_email_snapshot"],["billing_statement_lines","charge_breakdown"]] as const){
      const result=await client.from(table).select(column).limit(1);expect(result.error,`${table}.${column} must remain unapplied`).not.toBeNull();
    }
    const helper=await client.rpc("resolve_manager_review_recipient",{target_company_id:"TENANT-LOCAL-001"});
    expect(helper.error).not.toBeNull();
  });
});
