import{readFileSync}from"node:fs";
import{describe,expect,it,vi}from"vitest";
import{UatRecipientOverrideVerification}from"../worker/uatRecipientOverrideVerification";
import{UatProviderAuthentication}from"../worker/uatProviderAuthentication";
import{verifyResendAuthentication}from"../server/notifications/ResendEmailDeliveryProvider";

const sql=readFileSync("supabase/migrations/20260826000200_isolated_uat_grouped_review_scheduler_provisioning.sql","utf8");
describe("isolated UAT grouped-review scheduler provisioning",()=>{
 it("preserves the production boundary and restricts the new boundary to the compatibility tenant",()=>{expect(sql).toContain("provision_isolated_uat_grouped_review_scheduler");expect(sql).toContain("target_company_id IS DISTINCT FROM 'TENANT-LOCAL-001'");expect(sql).toContain("target_company.environment_class<>'compatibility'");expect(sql).not.toContain("CREATE OR REPLACE FUNCTION erp.provision_grouped_review_scheduler_principal");});
 it("is configuration-driven and admits the approved 19:00 plus 120-minute window",()=>{expect(sql).toContain("requested_local_send_time");expect(sql).toContain("requested_grace_minutes NOT BETWEEN 15 AND 180");expect(sql).not.toMatch(/VALUES\([^\n]*'19:00'|requested_grace_minutes\s*:=\s*120/);});
 it("creates one non-interactive least-privilege principal and one tenant config",()=>{for(const marker of["UNIQUE(company_id,principal_type)","'GROUPED_REVIEW_SCHEDULER'","'grouped_review.schedule'","permission_code<>'grouped_review.schedule'","ON CONFLICT(company_id)","FROM PUBLIC,anon,authenticated,service_role"])expect(readFileSync("supabase/migrations/20260803006700_phase_c12_grouped_review_scheduler_principal.sql","utf8")+sql).toContain(marker);expect(sql).not.toMatch(/auth\.users.*INSERT|password|role_id/);});
 it("is owner-only, audited, and structurally replay safe",()=>{for(const marker of["session_user<>database_owner","ISOLATED_UAT_GROUPED_REVIEW_SCHEDULER_PROVISIONED","'REPLAYED'","configuration_changed"])expect(sql).toContain(marker);expect(sql).not.toMatch(/GRANT EXECUTE/);});
});

describe("one-shot grouped-review certification boundary",()=>{
 it("is UAT-only, authenticated, exact-target, override-gated and bounded to one",()=>{const source=readFileSync("worker/uatGroupedReviewCertification.ts","utf8"),targetSql=readFileSync("supabase/migrations/20260826000300_isolated_uat_grouped_review_target_certification.sql","utf8");for(const marker of["ENABLE_UAT_RECIPIENT_OVERRIDE_VERIFIER","settings.update","CONFIRM-ONE-ISOLATED-UAT-GROUPED-REVIEW","matchesUatRecipientOverride","certify_isolated_uat_grouped_review_target","batchLimit:1","groupsPrepared!==1","notificationsPrepared!==1","delivery.claimed!==1","delivery.providerCalls!==1"])expect(source).toContain(marker);for(const marker of["auth.role()<>'service_role'","TENANT-LOCAL-001","r.status='Active'","d.status='Submitted'","d.superseded_by_revision_id IS NULL","TO service_role"])expect(targetSql).toContain(marker);expect(source+targetSql).not.toMatch(/console\.|GRANT SELECT|DISABLE ROW LEVEL|reviewPath\s*:/);});
 it("reports delivery only from canonical provider acceptance evidence",()=>{const source=readFileSync("worker/uatGroupedReviewCertification.ts","utf8");expect(source).toContain('certify_isolated_uat_grouped_review_residue');expect(source).toContain('item.status==="ProviderAccepted"&&item.providerMessageIdPresent');expect(source).toContain('code:"PROVIDER_NOT_ACCEPTED"');expect(source.indexOf("PROVIDER_NOT_ACCEPTED")).toBeLessThan(source.indexOf('result:"DELIVERED"'));});
 it("uses the canonical text ID storage in the final target certifier",()=>{const sql=readFileSync("supabase/migrations/20260826000400_isolated_uat_grouped_review_target_text_ids.sql","utf8");expect(sql).toContain("target_rental_id text;target_deur_id text");expect(sql).not.toMatch(/target_(?:rental|deur)_id uuid|::uuid/);expect(sql).toContain("CREATE OR REPLACE FUNCTION erp.certify_isolated_uat_grouped_review_target");});
});

const client=(permission=true)=>({auth:{getUser:vi.fn(async()=>({data:{user:{id:"actor"}},error:null}))},schema:()=>({from:(table:string)=>({select:()=>({eq:()=>({eq:()=>({maybeSingle:vi.fn(async()=>({data:table==="users"?{id:"actor",status:"active"}:permission?{permission_code:"settings.update"}:null,error:null}))})})})})})} as any);
describe("UAT recipient override fingerprint verification",()=>{
 it("returns MATCH after deterministic normalization without returning either address",async()=>{const value=await new UatRecipientOverrideVerification(client(),"alan.miscala0211@gmail.com").handle(new Request("https://uat/api",{method:"POST",headers:{authorization:"Bearer token"},body:JSON.stringify({candidateEmail:" Alan.Miscala0211@GMAIL.COM "})}));expect(value).toEqual({status:200,body:{result:"MATCH"}});expect(JSON.stringify(value)).not.toMatch(/alan|gmail/i);});
 it("returns only NO_MATCH for a different address",async()=>{const value=await new UatRecipientOverrideVerification(client(),"alan.miscala0211@gmail.com").handle(new Request("https://uat/api",{method:"POST",headers:{authorization:"Bearer token"},body:JSON.stringify({candidateEmail:"different@example.test"})}));expect(value).toEqual({status:200,body:{result:"NO_MATCH"}});});
 it("rejects malformed input and unauthorized actors without secret leakage",async()=>{const malformed=await new UatRecipientOverrideVerification(client(),"alan.miscala0211@gmail.com").handle(new Request("https://uat/api",{method:"POST",headers:{authorization:"Bearer token"},body:JSON.stringify({candidateEmail:"bad\r\nBcc:x@example.test"})}));expect(malformed).toEqual({status:400,body:{result:"NO_MATCH"}});const denied=await new UatRecipientOverrideVerification(client(false),"alan.miscala0211@gmail.com").handle(new Request("https://uat/api",{method:"POST",headers:{authorization:"Bearer token"},body:JSON.stringify({candidateEmail:"alan.miscala0211@gmail.com"})}));expect(denied).toEqual({status:403,body:{result:"NO_MATCH"}});});
});

describe("read-only UAT Resend authentication verification",()=>{
 it("accepts full-access and recognized send-only credentials without sending email",async()=>{
  const full=vi.fn(async()=>new Response(JSON.stringify({object:"list",data:[]}),{status:200}));
  const sendOnly=vi.fn(async()=>new Response(JSON.stringify({name:"restricted_api_key"}),{status:401}));
  await expect(verifyResendAuthentication("secret",full as typeof fetch)).resolves.toBe("VALID");
  await expect(verifyResendAuthentication("secret",sendOnly as typeof fetch)).resolves.toBe("VALID");
  expect(full).toHaveBeenCalledWith("https://api.resend.com/domains?limit=1",expect.objectContaining({method:"GET"}));
  expect(sendOnly).toHaveBeenCalledWith("https://api.resend.com/domains?limit=1",expect.objectContaining({method:"GET"}));
 });
 it("classifies an invalid key without returning or logging credential material",async()=>{
  const fetcher=vi.fn(async()=>new Response(JSON.stringify({name:"invalid_api_key",message:"invalid"}),{status:403}));
  const result=await new UatProviderAuthentication(client(),"do-not-expose",fetcher as typeof fetch).handle(new Request("https://uat/api",{method:"POST",headers:{authorization:"Bearer token"}}));
  expect(result).toEqual({status:200,body:{result:"INVALID"}});expect(JSON.stringify(result)).not.toContain("do-not-expose");
 });
 it("fails closed for ambiguous provider responses",async()=>{const fetcher=vi.fn(async()=>new Response("gateway",{status:502}));await expect(verifyResendAuthentication("secret",fetcher as typeof fetch)).resolves.toBe("UNAVAILABLE");});
});
