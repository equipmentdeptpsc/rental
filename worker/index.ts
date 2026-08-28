import{runScheduledJob}from"./runtime";
import{selectScheduledJob,type GroupedReviewWorkerEnvironment}from"./configuration";
import{createTrustedUserAdministration,safeJson}from"./userAdministration";
import{createTrustedUsernameAuthentication,usernameLoginCorsHeaders}from"./usernameAuthentication";
import{createUatRecipientOverrideVerification}from"./uatRecipientOverrideVerification";
import{runUatGroupedReviewCertification}from"./uatGroupedReviewCertification";
import{createUatProviderAuthentication}from"./uatProviderAuthentication";

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
   if(request.method!=="POST")return Response.json({success:false,message:"Method not allowed."},{status:405,headers:{allow:"POST"}});
   try{return safeJson(await createTrustedUserAdministration(environment).handle(request));}catch{return Response.json({success:false,message:"Remote user administration is unavailable."},{status:503});}
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
  return environment.ASSETS.fetch(request);
 },
 scheduled(controller:ScheduledController,environment:GroupedReviewWorkerEnvironment,context:ExecutionContext):void{
  const job=selectScheduledJob(controller.cron,environment);
  context.waitUntil(runScheduledJob(job,controller.scheduledTime,environment));
 }
};
