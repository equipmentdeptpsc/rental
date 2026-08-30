import { createClient } from "@supabase/supabase-js";
import type { GroupedReviewWorkerEnvironment } from "./configuration";
type Row=Record<string,any>; type Safe={status:number;body:Row};
const username="uat.me.operator.001", expectedOperatorId="e6bf4e8b-8e3a-4c65-a05e-ee4ed281e876";
const out=(status:number,body:Row):Safe=>({status,body:{inspectionImplementationVersion:"uat-user1-exact-username-rpc-v3",...body}});
export async function inspectUatUserLinkage(request:Request,env:GroupedReviewWorkerEnvironment):Promise<Safe>{
 if(env.ENABLE_UAT_SYNTHETIC_PROVISIONER!=="true"||!env.SUPABASE_URL||!env.SUPABASE_SERVICE_ROLE_KEY)return out(503,{success:false,code:"UAT_PROVISIONER_DISABLED"});
 const token=request.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1]; if(!token)return out(401,{success:false,code:"UNAUTHENTICATED"});
 const service=createClient(env.SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}}); const identity=await service.auth.getUser(token); if(identity.error||!identity.data.user)return out(401,{success:false,code:"UNAUTHENTICATED"}); const actor=identity.data.user.id;
 const [permission,admin,app]=await Promise.all([service.schema("erp").from("effective_user_permissions").select("permission_code").eq("user_id",actor).eq("permission_code","settings.update").maybeSingle(),service.schema("erp").from("user_roles").select("role_id,app_roles!inner(code,active,deprecated_at)").eq("user_id",actor).eq("app_roles.code","system-administrator").eq("app_roles.active",true).is("app_roles.deprecated_at",null).maybeSingle(),service.schema("erp").from("users").select("company_id,status").eq("id",actor).maybeSingle()]);
 if(permission.error||!permission.data||admin.error||!admin.data||app.error||!app.data||app.data.status!=="active")return out(403,{success:false,code:"FORBIDDEN"}); const companyId=String(app.data.company_id);
 const body=await request.json().catch(()=>null) as Row|null; if(!body||Object.keys(body).length!==2||body.username!==username||body.expectedOperatorId!==expectedOperatorId)return out(400,{success:false,code:"VALIDATION_REJECTED"});
 const linkage=await service.schema("erp").rpc("inspect_isolated_uat_exact_application_user",{command:{companyId,username,expectedOperatorId}});
 if(linkage.error)return out(503,{success:false,code:"READ_FAILED",phase:"USER1_READ",operation:"inspect_isolated_uat_exact_application_user",safeResultCode:"UPSTREAM_UNAVAILABLE"});
 const row=linkage.data as Row; const count=Number(row?.usernameCardinality??0);
 if(count!==1)return out(200,{success:true,username,usernameCardinality:count,classification:count===0?"USER1_NOT_PERSISTED":"USER1_DUPLICATE_USERNAME",authIdentityPresent:false});
 const auth=await service.auth.admin.getUserById(String(row.applicationUserId)); const authPresent=!auth.error&&!!auth.data.user; const roleNames=Array.isArray(row.roleNames)?row.roleNames:[]; const classification=row.operatorLinkClassification!=="EXACT_OPERATOR"?(row.operatorLinkClassification==="NULL_OPERATOR"?"USER1_OPERATOR_LINK_NULL":"USER1_OPERATOR_LINK_WRONG"):String(row.status).toLowerCase()!=="active"?"USER1_INACTIVE":!roleNames.includes("operator")?"USER1_ROLE_MISSING":!authPresent?"USER1_AUTH_IDENTITY_MISSING":"USER1_EXACT_PERSISTED_LINK_GREEN";
 return out(200,{success:true,username,usernameCardinality:1,applicationUserId:row.applicationUserId,displayName:row.displayName,status:row.status,companyId:row.companyId,operatorId:row.operatorId,roleNames,authIdentityPresent:authPresent,authIdentityActive:authPresent?auth.data.user?.aud==="authenticated":false,classification});
}
