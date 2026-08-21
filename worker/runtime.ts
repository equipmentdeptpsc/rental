import{createClient}from"@supabase/supabase-js";
import{randomUUID}from"node:crypto";
import{DailyGroupedCustomerReviewService,type DailyGroupedReviewRunResult}from"../server/notifications/DailyGroupedCustomerReviewService";
import{ResendEmailDeliveryProvider}from"../server/notifications/ResendEmailDeliveryProvider";
import{SupabaseDailyGroupedReviewRepository}from"../server/notifications/SupabaseDailyGroupedReviewRepository";
import{SupabaseTrustedNotificationRepository}from"../server/notifications/SupabaseTrustedNotificationRepository";
import{TrustedNotificationWorker}from"../server/notifications/TrustedNotificationWorker";
import{parseWorkerConfiguration,type GroupedReviewWorkerEnvironment,type ScheduledJob}from"./configuration";

export interface SafeRuntimeLogger{log(event:Record<string,unknown>):void}
export interface ScheduledRuntimeDependencies{
 runScheduler(command:{commandId:string;idempotencyKey:string;runAt:string;batchLimit:number}):Promise<DailyGroupedReviewRunResult>;
 runNotificationWorker(workerId:ReturnType<typeof randomUUID>):Promise<{claimed:number;providerCalls:number}>;
}
export interface ScheduledRuntimeResult{job:ScheduledJob;invocationId:string;durationMs:number;result:Record<string,unknown>}

const consoleLogger:SafeRuntimeLogger={log:event=>console.log(JSON.stringify(event))};
const providerLogger:SafeRuntimeLogger={log:event=>console.log(JSON.stringify({event:"provider_delivery_outcome",...event}))};

export function createProductionDependencies(environment:GroupedReviewWorkerEnvironment,job:ScheduledJob):ScheduledRuntimeDependencies{
 const config=parseWorkerConfiguration(environment,job);
 const service=createClient(config.supabaseUrl,config.supabaseServiceRoleKey,{auth:{persistSession:false,autoRefreshToken:false}});
 const publicReview=createClient(config.supabaseUrl,config.supabasePublishableKey,{auth:{persistSession:false,autoRefreshToken:false}});
 const scheduler=new DailyGroupedCustomerReviewService(new SupabaseDailyGroupedReviewRepository(service),config.encryptionKey);
 const notifications=new TrustedNotificationWorker(new SupabaseTrustedNotificationRepository(service,service,config.encryptionKey,publicReview),
  new ResendEmailDeliveryProvider({apiKey:config.resendApiKey,uatRecipientOverride:config.uatRecipientOverride}),config.fromAddress,config.notificationBatchLimit,config.publicBaseUrl,providerLogger,Boolean(config.uatRecipientOverride));
 return{runScheduler:command=>scheduler.run(command),runNotificationWorker:workerId=>notifications.runOnce(workerId)};
}

export async function runScheduledJob(job:ScheduledJob,scheduledTime:number,environment:GroupedReviewWorkerEnvironment,
 dependencies:ScheduledRuntimeDependencies=createProductionDependencies(environment,job),logger:SafeRuntimeLogger=consoleLogger):Promise<ScheduledRuntimeResult>{
 const invocationId=randomUUID();const started=Date.now();logger.log({event:"scheduled_job_started",job,invocationId});
 try{
  let safeResult:Record<string,unknown>;
  if(job==="DAILY_GROUPED_REVIEW_SCHEDULER"){
   const config=parseWorkerConfiguration(environment,job);const result=await dependencies.runScheduler({commandId:invocationId,idempotencyKey:`cloudflare:${invocationId}`,runAt:new Date(scheduledTime).toISOString(),batchLimit:config.schedulerBatchLimit});safeResult={...result};
  }else{const result=await dependencies.runNotificationWorker(invocationId);safeResult={claimed:result.claimed,providerCalls:result.providerCalls};}
  const completed={job,invocationId,durationMs:Date.now()-started,result:safeResult};logger.log({event:"scheduled_job_completed",...completed});return completed;
 }catch(error){logger.log({event:"scheduled_job_failed",job,invocationId,durationMs:Date.now()-started,code:error instanceof Error?"JOB_FAILURE":"UNKNOWN_FAILURE"});throw error;}
}
