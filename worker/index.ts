import{runScheduledJob}from"./runtime";
import{selectScheduledJob,type GroupedReviewWorkerEnvironment}from"./configuration";

interface ScheduledController{cron:string;scheduledTime:number}
interface ExecutionContext{waitUntil(promise:Promise<unknown>):void}

export default{
 fetch(request:Request,environment:GroupedReviewWorkerEnvironment):Promise<Response>{return environment.ASSETS.fetch(request);},
 scheduled(controller:ScheduledController,environment:GroupedReviewWorkerEnvironment,context:ExecutionContext):void{
  const job=selectScheduledJob(controller.cron,environment);
  context.waitUntil(runScheduledJob(job,controller.scheduledTime,environment));
 }
};
