import { createClient } from "@supabase/supabase-js";
import type { GroupedReviewWorkerEnvironment } from "./configuration";
type Row=Record<string,any>; const out=(status:number,body:Row)=>({status,body:{inspectionImplementationVersion:"uat-deur-post-submit-read-v1",...body}});
export async function inspectUatDeurPostSubmit(request:Request,env:GroupedReviewWorkerEnvironment){
 if(env.ENABLE_UAT_SYNTHETIC_PROVISIONER!=="true"||!env.SUPABASE_URL||!env.SUPABASE_SERVICE_ROLE_KEY)return out(503,{success:false,code:"UAT_PROVISIONER_DISABLED"});
 const token=request.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1]; if(!token)return out(401,{success:false,code:"UNAUTHENTICATED"});
 const service=createClient(env.SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}}); const identity=await service.auth.getUser(token); if(identity.error||!identity.data.user)return out(401,{success:false,code:"UNAUTHENTICATED"});
 const actor=identity.data.user.id; const app=await service.schema("erp").from("users").select("company_id,status").eq("id",actor).maybeSingle(); const permission=await service.schema("erp").from("effective_user_permissions").select("permission_code").eq("user_id",actor).eq("permission_code","settings.update").maybeSingle();
 if(app.error||!app.data||app.data.status!=="active"||permission.error||!permission.data)return out(403,{success:false,code:"FORBIDDEN"});
 const body=await request.json().catch(()=>null) as Row|null; if(!body||Object.keys(body).length!==4||body.scenarioKey!=="MULTI-EQUIPMENT-RUNTIME-CERT-2026-08-29"||body.profileVersion!=="UAT_MULTI_EQUIPMENT_PER_WORKDAY_V1"||body.expectedDeurNumber!=="DEUR-2026-000003"||body.expectedWorkDate!=="2026-08-30")return out(400,{success:false,code:"VALIDATION_REJECTED"});
 const read=await service.schema("erp").rpc("inspect_isolated_uat_deur_post_submit",{command:{companyId:app.data.company_id,...body}}); if(read.error)return out(503,{success:false,code:"READ_FAILED"}); return out(200,read.data as Row);
}
