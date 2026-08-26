import{createClient}from"@supabase/supabase-js";
import{randomUUID}from"node:crypto";
import type{GroupedReviewWorkerEnvironment}from"./configuration";
import{createProductionDependencies}from"./runtime";
import{matchesUatRecipientOverride}from"./uatRecipientOverrideVerification";

type SafeResult={status:number;body:Record<string,unknown>};const safe=(status:number,body:Record<string,unknown>):SafeResult=>({status,body});
export async function runUatGroupedReviewCertification(request:Request,environment:GroupedReviewWorkerEnvironment):Promise<SafeResult>{
 if(environment.ENABLE_UAT_RECIPIENT_OVERRIDE_VERIFIER!=="true"||!environment.SUPABASE_URL||!environment.SUPABASE_SERVICE_ROLE_KEY)return safe(503,{success:false,code:"UAT_CERTIFICATION_DISABLED"});
 const token=request.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];if(!token)return safe(401,{success:false,code:"UNAUTHENTICATED"});
 const service=createClient(environment.SUPABASE_URL,environment.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 const identity=await service.auth.getUser(token);if(identity.error||!identity.data.user)return safe(401,{success:false,code:"UNAUTHENTICATED"});const actorId=identity.data.user.id;
 const permission=await service.schema("erp").from("effective_user_permissions").select("permission_code").eq("user_id",actorId).eq("permission_code","settings.update").maybeSingle();if(permission.error||!permission.data)return safe(403,{success:false,code:"FORBIDDEN"});
 const body=await request.json().catch(()=>null) as Record<string,unknown>|null;const rentalId=String(body?.rentalId??""),deurId=String(body?.deurId??""),workDate=String(body?.workDate??""),timezone=String(body?.timezone??"");
 if(body?.confirmation!=="CONFIRM-ONE-ISOLATED-UAT-GROUPED-REVIEW"||!/^[0-9a-f-]{36}$/i.test(rentalId)||!/^[0-9a-f-]{36}$/i.test(deurId)||!/^\d{4}-\d{2}-\d{2}$/.test(workDate)||timezone!=="Asia/Manila")return safe(400,{success:false,code:"VALIDATION_REJECTED"});
 if(!await matchesUatRecipientOverride(body?.candidateEmail,environment.EMAIL_UAT_RECIPIENT_OVERRIDE))return safe(409,{success:false,code:"RECIPIENT_OVERRIDE_NO_MATCH"});
 const eligibility=await service.schema("erp").rpc("certify_isolated_uat_grouped_review_target",{command:{rentalId,deurId,workDate,timezone}});const eligibilityValue=eligibility.data as{success?:boolean;code?:string}|null;if(eligibility.error||!eligibilityValue?.success)return safe(409,{success:false,code:eligibilityValue?.code??"TARGET_NOT_ELIGIBLE"});
 const dependencies=createProductionDependencies(environment,"DAILY_GROUPED_REVIEW_SCHEDULER");const commandId=randomUUID();
 const scheduler=await dependencies.runScheduler({commandId,idempotencyKey:`uat-certification:${rentalId}:${workDate}`,runAt:`${workDate}T19:00:00+08:00`,batchLimit:1});
 if(scheduler.groupsPrepared!==1||scheduler.notificationsPrepared!==1||scheduler.groupsFailed!==0)return safe(409,{success:false,code:"SCHEDULER_PREPARATION_NOT_EXACT",scheduler});
 const deliveryDependencies=createProductionDependencies(environment,"NOTIFICATION_RETRY_WORKER");const delivery=await deliveryDependencies.runNotificationWorker(randomUUID());
 if(delivery.claimed!==1||delivery.providerCalls!==1)return safe(502,{success:false,code:"DELIVERY_NOT_EXACT",delivery});
 return safe(200,{success:true,result:"DELIVERED",scheduler:{groupsPrepared:1,notificationsPrepared:1},delivery:{claimed:1,providerCalls:1}});
}
