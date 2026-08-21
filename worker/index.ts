import{runScheduledJob}from"./runtime";
import{selectScheduledJob,type GroupedReviewWorkerEnvironment}from"./configuration";
import{createTrustedUserAdministration,safeJson}from"./userAdministration";

interface ScheduledController{cron:string;scheduledTime:number}
interface ExecutionContext{waitUntil(promise:Promise<unknown>):void}

export default{
 async fetch(request:Request,environment:GroupedReviewWorkerEnvironment):Promise<Response>{
  const path=new URL(request.url).pathname;
  if(path==="/api/admin/users"||/^\/api\/admin\/users\/[^/]+\/reset-password$/.test(path)){
   if(request.method!=="POST")return Response.json({success:false,message:"Method not allowed."},{status:405,headers:{allow:"POST"}});
   try{return safeJson(await createTrustedUserAdministration(environment).handle(request));}catch{return Response.json({success:false,message:"Remote user administration is unavailable."},{status:503});}
  }
  return environment.ASSETS.fetch(request);
 },
 scheduled(controller:ScheduledController,environment:GroupedReviewWorkerEnvironment,context:ExecutionContext):void{
  const job=selectScheduledJob(controller.cron,environment);
  context.waitUntil(runScheduledJob(job,controller.scheduledTime,environment));
 }
};
