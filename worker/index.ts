import{runScheduledJob}from"./runtime";
import{selectScheduledJob,type GroupedReviewWorkerEnvironment}from"./configuration";
import{createTrustedUserAdministration}from"./userAdministration";
import{createTrustedUsernameAuthentication,usernameLoginCorsHeaders}from"./usernameAuthentication";
import{createUatRecipientOverrideVerification}from"./uatRecipientOverrideVerification";
import{runUatGroupedReviewCertification}from"./uatGroupedReviewCertification";
import{createUatProviderAuthentication}from"./uatProviderAuthentication";
  import{dispatchExistingUatNotification}from"./uatNotificationDispatch";
import{resolveUatGroupedReviewDispatch}from"./uatGroupedReviewDispatchResolver";
import{provisionUatMultiEquipmentCertification}from"./uatMultiEquipmentProvisioner";
import{inspectUatMultiEquipmentProvisioning}from"./uatMultiEquipmentInspection";
import{recoverUatLegacyProvisioning}from"./uatLegacyRecovery";
import{inspectUatMultiOperatorLinkage}from"./uatMultiOperatorLinkageInspection";
import{inspectUatUserLinkage}from"./uatUserLinkageInspection";
import{inspectUatScenarioDeur}from"./uatScenarioDeurInspection";
import{inspectUatDeurPostSubmit}from"./uatDeurPostSubmitInspection";
import{inspectUatDeurTurnover}from"./uatDeurTurnoverInspection";
import{inspectUatDeurTurnoverDomain,provisionUatDeurTurnoverDomain}from"./uatDeurTurnoverDomainProvisioner";
import{inspectUatDeurOfflineDomain,provisionUatDeurOfflineDomain}from"./uatDeurOfflineDomainProvisioner";
import{inspectUatDeurOfflineRestartDomain,provisionUatDeurOfflineRestartDomain}from"./uatDeurOfflineRestartDomainProvisioner";
import{inspectUatDeurNativeRestartDomain,provisionUatDeurNativeRestartDomain}from"./uatDeurNativeRestartDomainProvisioner";
import{uatAdminCorsHeaders}from"./uatAdminCors";

interface ScheduledController{cron:string;scheduledTime:number}
interface ExecutionContext{waitUntil(promise:Promise<unknown>):void}

export default{
 async fetch(request:Request,environment:GroupedReviewWorkerEnvironment):Promise<Response>{
  const path=new URL(request.url).pathname;
  if(path==="/api/auth/username-login"){
   const cors=usernameLoginCorsHeaders(request,environment);
   if(request.method==="OPTIONS")return new Response(null,{status:204,headers:{...cors,"cache-control":"no-store"}});
   if(request.method!=="POST")return Response.json({success:false,message:"Method not allowed."},{status:405,headers:{...cors,allow:"POST","cache-control":"no-store"}});
   try{const result=await createTrustedUsernameAuthentication(environment).handle(request);return Response.json(result.body,{status:result.status,headers:{...cors,"cache-control":"no-store"}});}
   catch{return Response.json({success:false,message:"Invalid username/email or password."},{status:401,headers:{...cors,"cache-control":"no-store"}});}
  }
  if(path==="/api/admin/users"||/^\/api\/admin\/users\/[^/]+\/(?:reset-password|deactivate)$/.test(path)){
   const cors=uatAdminCorsHeaders(request,environment);
   if(request.method==="OPTIONS")return new Response(null,{status:204,headers:{...cors,"cache-control":"no-store"}});
   if(request.method!=="POST")return Response.json({success:false,message:"Method not allowed."},{status:405,headers:{...cors,allow:"POST","cache-control":"no-store"}});
   try{const result=await createTrustedUserAdministration(environment).handle(request);return Response.json(result.body,{status:result.status,headers:{...cors,"cache-control":"no-store"}});}catch{return Response.json({success:false,message:"Remote user administration is unavailable."},{status:503,headers:{...cors,"cache-control":"no-store"}});}
  }
  if(path==="/api/admin/uat/verify-recipient-override"){
   if(request.method!=="POST")return Response.json({result:"NO_MATCH"},{status:405,headers:{allow:"POST","cache-control":"no-store"}});
   try{const verified=await createUatRecipientOverrideVerification(environment).handle(request);return Response.json(verified.body,{status:verified.status,headers:{"cache-control":"no-store"}});}
   catch{return Response.json({result:"NO_MATCH"},{status:503,headers:{"cache-control":"no-store"}});}
  }
  if(path==="/api/admin/uat/verify-provider-authentication"){
   if(request.method!=="POST")return Response.json({result:"UNAVAILABLE"},{status:405,headers:{allow:"POST","cache-control":"no-store"}});
   try{const verified=await createUatProviderAuthentication(environment).handle(request);return Response.json(verified.body,{status:verified.status,headers:{"cache-control":"no-store"}});}
   catch{return Response.json({result:"UNAVAILABLE"},{status:503,headers:{"cache-control":"no-store"}});}
  }
  if(path==="/api/admin/uat/run-grouped-review-certification"){
   if(request.method!=="POST")return Response.json({success:false,code:"METHOD_NOT_ALLOWED"},{status:405,headers:{allow:"POST","cache-control":"no-store"}});
   try{const result=await runUatGroupedReviewCertification(request,environment);return Response.json(result.body,{status:result.status,headers:{"cache-control":"no-store"}});}
   catch{return Response.json({success:false,code:"UAT_CERTIFICATION_FAILED"},{status:503,headers:{"cache-control":"no-store"}});}
  }
  if(path==="/api/admin/uat/preflight-grouped-review-certification"){
   if(request.method!=="POST")return Response.json({success:false,code:"METHOD_NOT_ALLOWED"},{status:405,headers:{allow:"POST","cache-control":"no-store"}});
   try{const result=await runUatGroupedReviewCertification(request,environment);return Response.json(result.body,{status:result.status,headers:{"cache-control":"no-store"}});}
   catch{return Response.json({success:false,code:"UAT_CERTIFICATION_FAILED"},{status:503,headers:{"cache-control":"no-store"}});}
  }
    if(path==="/api/admin/uat/dispatch-existing-notification"){
   if(request.method!=="POST")return Response.json({success:false,code:"METHOD_NOT_ALLOWED"},{status:405,headers:{allow:"POST","cache-control":"no-store"}});
   try{const result=await dispatchExistingUatNotification(request,environment);return Response.json(result.body,{status:result.status,headers:{"cache-control":"no-store"}});}catch{return Response.json({success:false,code:"UAT_NOTIFICATION_DISPATCH_FAILED"},{status:503,headers:{"cache-control":"no-store"}});}
    }
    if(path==="/api/admin/uat/resolve-grouped-review-dispatch"){
     if(request.method!=="POST")return Response.json({success:false,code:"METHOD_NOT_ALLOWED"},{status:405,headers:{allow:"POST","cache-control":"no-store"}});
     try{const result=await resolveUatGroupedReviewDispatch(request,environment);return Response.json(result.body,{status:result.status,headers:{"cache-control":"no-store"}});}catch{return Response.json({success:false,code:"UAT_RESOLVER_FAILED"},{status:503,headers:{"cache-control":"no-store"}});}
    }
    if(path==="/api/admin/uat/provision-multi-equipment-certification"){
     if(request.method!=="POST")return Response.json({success:false,code:"METHOD_NOT_ALLOWED"},{status:405,headers:{allow:"POST","cache-control":"no-store"}});
     try{const result=await provisionUatMultiEquipmentCertification(request,environment);return Response.json(result.body,{status:result.status,headers:{"cache-control":"no-store"}});}catch(error){const code=error instanceof Error&&/^[A-Z0-9_]+$/.test(error.message)?error.message:"UAT_PROVISIONING_FAILED";return Response.json({success:false,code},{status:503,headers:{"cache-control":"no-store"}});}
    }
    if(path==="/api/admin/uat/inspect-multi-equipment-certification"){
     if(request.method!=="POST")return Response.json({success:false,code:"METHOD_NOT_ALLOWED"},{status:405,headers:{allow:"POST","cache-control":"no-store"}});
     try{const result=await inspectUatMultiEquipmentProvisioning(request,environment);return Response.json(result.body,{status:result.status,headers:{"cache-control":"no-store"}});}catch{return Response.json({success:false,code:"UAT_INSPECTION_FAILED"},{status:503,headers:{"cache-control":"no-store"}});}
    }
    if(path==="/api/admin/uat/inspect-multi-operator-linkage"){
     const cors=uatAdminCorsHeaders(request,environment);
     if(request.method==="OPTIONS")return new Response(null,{status:204,headers:{...cors,"cache-control":"no-store"}});
     if(request.method!=="POST")return Response.json({success:false,code:"METHOD_NOT_ALLOWED"},{status:405,headers:{...cors,allow:"POST","cache-control":"no-store"}});
     try{const result=await inspectUatMultiOperatorLinkage(request,environment);return Response.json(result.body,{status:result.status,headers:{...cors,"cache-control":"no-store"}});}catch{return Response.json({success:false,code:"UAT_OPERATOR_LINKAGE_INSPECTION_FAILED"},{status:503,headers:{...cors,"cache-control":"no-store"}});}
    }
    if(path==="/api/admin/uat/inspect-user-linkage"){
     const cors=uatAdminCorsHeaders(request,environment);
     if(request.method==="OPTIONS")return new Response(null,{status:204,headers:{...cors,"cache-control":"no-store"}});
     if(request.method!=="POST")return Response.json({success:false,code:"METHOD_NOT_ALLOWED"},{status:405,headers:{...cors,allow:"POST","cache-control":"no-store"}});
     try{const result=await inspectUatUserLinkage(request,environment);return Response.json(result.body,{status:result.status,headers:{...cors,"cache-control":"no-store"}});}catch{return Response.json({success:false,code:"USER_LINKAGE_INSPECTION_FAILED",inspectionImplementationVersion:"uat-user1-linkage-read-v1"},{status:503,headers:{...cors,"cache-control":"no-store"}});}
    }
   if(path==="/api/admin/uat/inspect-deur-post-submit"){
     if(request.method!=="POST")return Response.json({success:false,code:"METHOD_NOT_ALLOWED"},{status:405,headers:{allow:"POST","cache-control":"no-store"}});
     try{const result=await inspectUatDeurPostSubmit(request,environment);return Response.json(result.body,{status:result.status,headers:{"cache-control":"no-store"}});}catch{return Response.json({success:false,code:"DEUR_POST_SUBMIT_INSPECTION_FAILED"},{status:503,headers:{"cache-control":"no-store"}});}
   }
   if(path==="/api/admin/uat/inspect-scenario-deur"){
     const cors=uatAdminCorsHeaders(request,environment);
     if(request.method==="OPTIONS")return new Response(null,{status:204,headers:{...cors,"cache-control":"no-store"}});
     if(request.method!=="POST")return Response.json({success:false,code:"METHOD_NOT_ALLOWED"},{status:405,headers:{...cors,allow:"POST","cache-control":"no-store"}});
     try{const result=await inspectUatScenarioDeur(request,environment);return Response.json(result.body,{status:result.status,headers:{...cors,"cache-control":"no-store"}});}catch{return Response.json({success:false,code:"DEUR_INSPECTION_FAILED"},{status:503,headers:{...cors,"cache-control":"no-store"}});}
    }
   if(path==="/api/admin/uat/inspect-deur-turnover"){
     const cors=uatAdminCorsHeaders(request,environment);
     if(request.method==="OPTIONS")return new Response(null,{status:204,headers:{...cors,"cache-control":"no-store"}});
     if(request.method!=="POST")return Response.json({success:false,code:"METHOD_NOT_ALLOWED"},{status:405,headers:{...cors,allow:"POST","cache-control":"no-store"}});
     try{const result=await inspectUatDeurTurnover(request,environment);return Response.json(result.body,{status:result.status,headers:{...cors,"cache-control":"no-store"}});}catch{return Response.json({success:false,code:"DEUR_TURNOVER_INSPECTION_FAILED"},{status:503,headers:{...cors,"cache-control":"no-store"}});}
   }
   if(path==="/api/admin/uat/provision-deur-turnover-scenario"||path==="/api/admin/uat/inspect-deur-turnover-scenario"){
     if(request.method!=="POST")return Response.json({success:false,code:"METHOD_NOT_ALLOWED"},{status:405,headers:{allow:"POST","cache-control":"no-store"}});
     try{const result=path.endsWith("provision-deur-turnover-scenario")?await provisionUatDeurTurnoverDomain(request,environment):await inspectUatDeurTurnoverDomain(request,environment);return Response.json(result.body,{status:result.status,headers:{"cache-control":"no-store"}});}catch(error){const message=error instanceof Error?error.message:"";const code=message.startsWith("UAT_TURNOVER_SCENARIO_FAILED:")?message:"UAT_TURNOVER_SCENARIO_FAILED";return Response.json({success:false,code},{status:503,headers:{"cache-control":"no-store"}});}
   }
   if(path==="/api/admin/uat/provision-deur-offline-scenario"||path==="/api/admin/uat/inspect-deur-offline-scenario"){
     const cors=uatAdminCorsHeaders(request,environment);
     if(request.method==="OPTIONS")return new Response(null,{status:204,headers:{...cors,"cache-control":"no-store"}});
     if(request.method!=="POST")return Response.json({success:false,code:"METHOD_NOT_ALLOWED"},{status:405,headers:{...cors,allow:"POST","cache-control":"no-store"}});
     try{const result=path.endsWith("provision-deur-offline-scenario")?await provisionUatDeurOfflineDomain(request,environment):await inspectUatDeurOfflineDomain(request,environment);return Response.json(result.body,{status:result.status,headers:{...cors,"cache-control":"no-store"}});}catch{return Response.json({success:false,code:"UAT_OFFLINE_SCENARIO_FAILED"},{status:503,headers:{...cors,"cache-control":"no-store"}});}
   }
   if(path==="/api/admin/uat/provision-deur-offline-restart-scenario"||path==="/api/admin/uat/inspect-deur-offline-restart-scenario"){
     const cors=uatAdminCorsHeaders(request,environment);
     if(request.method==="OPTIONS")return new Response(null,{status:204,headers:{...cors,"cache-control":"no-store"}});
     if(request.method!=="POST")return Response.json({success:false,code:"METHOD_NOT_ALLOWED"},{status:405,headers:{...cors,allow:"POST","cache-control":"no-store"}});
     try{const result=path.endsWith("provision-deur-offline-restart-scenario")?await provisionUatDeurOfflineRestartDomain(request,environment):await inspectUatDeurOfflineRestartDomain(request,environment);return Response.json(result.body,{status:result.status,headers:{...cors,"cache-control":"no-store"}});}catch{return Response.json({success:false,code:"UAT_OFFLINE_RESTART_SCENARIO_FAILED"},{status:503,headers:{...cors,"cache-control":"no-store"}});}
   }
   if(path==="/api/admin/uat/provision-deur-native-restart-scenario"||path==="/api/admin/uat/inspect-deur-native-restart-scenario"){
     const cors=uatAdminCorsHeaders(request,environment);
     if(request.method==="OPTIONS")return new Response(null,{status:204,headers:{...cors,"cache-control":"no-store"}});
     if(request.method!=="POST")return Response.json({success:false,code:"METHOD_NOT_ALLOWED"},{status:405,headers:{...cors,allow:"POST","cache-control":"no-store"}});
     try{const result=path.endsWith("provision-deur-native-restart-scenario")?await provisionUatDeurNativeRestartDomain(request,environment):await inspectUatDeurNativeRestartDomain(request,environment);return Response.json(result.body,{status:result.status,headers:{...cors,"cache-control":"no-store"}});}catch{return Response.json({success:false,code:"UAT_NATIVE_RESTART_SCENARIO_FAILED"},{status:503,headers:{...cors,"cache-control":"no-store"}});}
   }
  if(path==="/api/admin/uat/recover-legacy-provisioning"){
     if(request.method!=="POST")return Response.json({success:false,code:"METHOD_NOT_ALLOWED"},{status:405,headers:{allow:"POST","cache-control":"no-store"}});
     try{const result=await recoverUatLegacyProvisioning(request,environment);return Response.json(result.body,{status:result.status,headers:{"cache-control":"no-store"}});}catch{return Response.json({success:false,code:"UAT_RECOVERY_FAILED"},{status:503,headers:{"cache-control":"no-store"}});}
    }
  return environment.ASSETS.fetch(request);
 },
 scheduled(controller:ScheduledController,environment:GroupedReviewWorkerEnvironment,context:ExecutionContext):void{
  const job=selectScheduledJob(controller.cron,environment);
  context.waitUntil(runScheduledJob(job,controller.scheduledTime,environment));
 }
};
