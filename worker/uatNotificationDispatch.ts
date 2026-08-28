import{createClient}from"@supabase/supabase-js";
import{randomUUID}from"node:crypto";
import type{GroupedReviewWorkerEnvironment}from"./configuration";
import{createProductionDependencies}from"./runtime";

type SafeResult={status:number;body:Record<string,unknown>};const safe=(status:number,body:Record<string,unknown>):SafeResult=>({status,body});
export async function dispatchExistingUatNotification(request:Request,environment:GroupedReviewWorkerEnvironment):Promise<SafeResult>{
 if(environment.ENABLE_UAT_RECIPIENT_OVERRIDE_VERIFIER!=="true"||!environment.SUPABASE_URL||!environment.SUPABASE_SERVICE_ROLE_KEY)return safe(503,{success:false,code:"UAT_DISPATCH_DISABLED"});
 const token=request.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];if(!token)return safe(401,{success:false,code:"UNAUTHENTICATED"});
 const service=createClient(environment.SUPABASE_URL,environment.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});const identity=await service.auth.getUser(token);if(identity.error||!identity.data.user)return safe(401,{success:false,code:"UNAUTHENTICATED"});
 const permitted=await service.schema("erp").from("effective_user_permissions").select("permission_code").eq("user_id",identity.data.user.id).eq("permission_code","settings.update").maybeSingle();if(permitted.error||!permitted.data)return safe(403,{success:false,code:"FORBIDDEN"});
 const body=await request.json().catch(()=>null) as Record<string,unknown>|null;const notificationId=String(body?.notificationId??"");if(!/^[0-9a-f-]{36}$/i.test(notificationId)||Object.keys(body??{}).length!==1)return safe(400,{success:false,code:"VALIDATION_REJECTED"});
 const intent=await service.schema("erp").rpc("get_notification_delivery_intent",{notification_id:notificationId});const value=intent.data as{success?:boolean;value?:{companyId?:unknown;type?:unknown}}|null;if(intent.error||!value?.success||value.value?.companyId!=="TENANT-LOCAL-001"||value.value?.type!=="CUSTOMER_GROUPED_REVIEW_REQUESTED")return safe(409,{success:false,code:"NOTIFICATION_NOT_ELIGIBLE"});
 const dispatch=createProductionDependencies(environment,"NOTIFICATION_RETRY_WORKER").dispatchExistingNotification;if(!dispatch)return safe(503,{success:false,code:"UAT_DISPATCH_UNAVAILABLE"});const result=await dispatch(notificationId,randomUUID());if(result.claimed!==1)return safe(409,{success:false,code:"NOTIFICATION_NOT_CLAIMED",claimed:result.claimed});return safe(200,{success:true,result:"DISPATCHED",claimed:1,providerCalls:result.providerCalls});
}
