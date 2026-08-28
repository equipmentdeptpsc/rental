import{createClient}from"@supabase/supabase-js";
import{randomUUID}from"node:crypto";
import type{GroupedReviewWorkerEnvironment}from"./configuration";
import{createProductionDependencies}from"./runtime";
import{matchesUatRecipientOverride}from"./uatRecipientOverrideVerification";
import{generateGroupedReviewCredential}from"../server/notifications/GroupedReviewCredential";
import{encryptGroupedReviewDeliveryEnvelope,parseGroupedReviewDeliveryKey}from"../server/notifications/GroupedReviewDeliveryEnvelope";

type SafeResult={status:number;body:Record<string,unknown>};const safe=(status:number,body:Record<string,unknown>):SafeResult=>({status,body});
export async function runUatGroupedReviewCertification(request:Request,environment:GroupedReviewWorkerEnvironment):Promise<SafeResult>{
 if(environment.ENABLE_UAT_RECIPIENT_OVERRIDE_VERIFIER!=="true"||!environment.SUPABASE_URL||!environment.SUPABASE_SERVICE_ROLE_KEY)return safe(503,{success:false,code:"UAT_CERTIFICATION_DISABLED"});
 const token=request.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];if(!token)return safe(401,{success:false,code:"UNAUTHENTICATED"});
 const service=createClient(environment.SUPABASE_URL,environment.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 const identity=await service.auth.getUser(token);if(identity.error||!identity.data.user)return safe(401,{success:false,code:"UNAUTHENTICATED"});const actorId=identity.data.user.id;
 const permission=await service.schema("erp").from("effective_user_permissions").select("permission_code").eq("user_id",actorId).eq("permission_code","settings.update").maybeSingle();if(permission.error||!permission.data)return safe(403,{success:false,code:"FORBIDDEN"});
 const body=await request.json().catch(()=>null) as Record<string,unknown>|null;const rentalId=String(body?.rentalId??""),requestedDeurId=String(body?.deurId??""),deurNumber=String(body?.deurNumber??""),workDate=String(body?.workDate??""),timezone=String(body?.timezone??""),mode=body?.mode==="PREFLIGHT"?"PREFLIGHT":"DELIVER";
 if(body?.confirmation!=="CONFIRM-ONE-ISOLATED-UAT-GROUPED-REVIEW"||!/^[0-9a-f-]{36}$/i.test(rentalId)||(!/^[0-9a-f-]{36}$/i.test(requestedDeurId)&&!/^DEUR-\d{4}-\d{6}$/.test(deurNumber))||!/^\d{4}-\d{2}-\d{2}$/.test(workDate)||timezone!=="Asia/Manila")return safe(400,{success:false,code:"VALIDATION_REJECTED"});
 let deurId=requestedDeurId;
 if(!deurId){const resolved=await service.schema("erp").rpc("resolve_isolated_uat_grouped_review_target",{command:{rentalId,deurNumber,workDate}});const value=resolved.data as{success?:boolean;value?:{deurId?:unknown}}|null;if(resolved.error)return safe(503,{success:false,code:"TARGET_RESOLUTION_UNAVAILABLE"});if(!value?.success)return safe(409,{success:false,code:value?.success===false?"TARGET_NOT_ELIGIBLE":"TARGET_RESOLUTION_UNAVAILABLE"});deurId=String(value.value?.deurId??"");if(!/^[0-9a-f-]{36}$/i.test(deurId))return safe(503,{success:false,code:"TARGET_RESOLUTION_UNAVAILABLE"});}
 if(!await matchesUatRecipientOverride(body?.candidateEmail,environment.EMAIL_UAT_RECIPIENT_OVERRIDE))return safe(409,{success:false,code:"RECIPIENT_OVERRIDE_NO_MATCH"});
 const eligibility=await service.schema("erp").rpc("certify_isolated_uat_grouped_review_target",{command:{rentalId,deurId,workDate,timezone}});const eligibilityValue=eligibility.data as{success?:boolean;code?:string}|null;if(eligibility.error||!eligibilityValue?.success)return safe(409,{success:false,code:eligibilityValue?.code??"TARGET_NOT_ELIGIBLE"});
 const residue=await service.schema("erp").rpc("certify_isolated_uat_grouped_review_residue",{command:{rentalId,deurId}});const residueResult=residue.data as{success?:boolean;code?:string;value?:{notifications?:Array<{id:string;status:string;providerMessageIdPresent:boolean;failureCategory?:string}>}}|null;
 if(residue.error||(!residueResult?.success&&residueResult?.code!=="NOT_FOUND"))return safe(503,{success:false,code:"CANONICAL_EVIDENCE_UNAVAILABLE"});const notifications=residueResult.value?.notifications??[];
 if(mode==="PREFLIGHT"){const schedulerPreflight=await service.schema("erp").rpc("certify_isolated_uat_grouped_review_scheduler_preflight",{command:{rentalId,deurId,workDate}});const value=schedulerPreflight.data as{success?:boolean;code?:string}|null;if(schedulerPreflight.error||!value?.success)return safe(409,{success:false,code:value?.code??"SCHEDULER_PREPARATION_NOT_EXACT"});return safe(200,{success:true,result:"ELIGIBLE"});}
 let scheduler:unknown={groupsPrepared:0,notificationsPrepared:0};
 const deadletters=notifications.filter(item=>item.status==="DeadLetter"&&item.failureCategory==="AuthenticationFailure"&&!item.providerMessageIdPresent);
 if(deadletters.length===1&&notifications.every(item=>item.status!=="ProviderAccepted")){
  const notificationId=randomUUID(),credential=generateGroupedReviewCredential(),envelope=encryptGroupedReviewDeliveryEnvelope(credential.reviewPath,notificationId,parseGroupedReviewDeliveryKey({GROUPED_REVIEW_DELIVERY_ENCRYPTION_KEY_V1:environment.GROUPED_REVIEW_DELIVERY_ENCRYPTION_KEY_V1}));
  const reissue=await service.schema("erp").rpc("trusted_reissue_grouped_review_deadletter",{command:{commandId:randomUUID(),oldNotificationId:deadletters[0].id,notificationId,credentialHash:credential.hash,...envelope}});
  const value=reissue.data as{success?:boolean;disposition?:string}|null;if(reissue.error||!value?.success||value.disposition!=="CREATED")return safe(409,{success:false,code:"REISSUANCE_REJECTED"});
  scheduler={groupsPrepared:0,notificationsPrepared:1,reissued:1};
 }else{
  const dependencies=createProductionDependencies(environment,"DAILY_GROUPED_REVIEW_SCHEDULER"),commandId=randomUUID();
  const prepared=await dependencies.runScheduler({commandId,idempotencyKey:`uat-certification:${rentalId}:${workDate}`,runAt:`${workDate}T19:00:00+08:00`,batchLimit:1});
  if(prepared.groupsPrepared!==1||prepared.notificationsPrepared!==1||prepared.groupsFailed!==0)return safe(409,{success:false,code:"SCHEDULER_PREPARATION_NOT_EXACT",scheduler:prepared});scheduler=prepared;
 }
 const deliveryDependencies=createProductionDependencies(environment,"NOTIFICATION_RETRY_WORKER");const delivery=await deliveryDependencies.runNotificationWorker(randomUUID());
 if(delivery.claimed!==1||delivery.providerCalls!==1)return safe(502,{success:false,code:"DELIVERY_NOT_EXACT",delivery});
 const accepted=await service.schema("erp").rpc("certify_isolated_uat_grouped_review_residue",{command:{rentalId,deurId}});const acceptedResult=accepted.data as{success?:boolean;value?:{notifications?:Array<{status:string;providerMessageIdPresent:boolean}>}}|null;
 if(accepted.error||!acceptedResult?.success||(acceptedResult.value?.notifications??[]).filter(item=>item.status==="ProviderAccepted"&&item.providerMessageIdPresent).length!==1)return safe(502,{success:false,code:"PROVIDER_NOT_ACCEPTED",delivery:{claimed:1,providerCalls:1}});
 return safe(200,{success:true,result:"DELIVERED",scheduler,delivery:{claimed:1,providerCalls:1}});
}
