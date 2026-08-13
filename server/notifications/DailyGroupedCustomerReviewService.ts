import { randomUUID } from "node:crypto";
import { generateGroupedReviewCredential } from "./GroupedReviewCredential";
import { encryptGroupedReviewDeliveryEnvelope, type GroupedReviewDeliveryEnvelope } from "./GroupedReviewDeliveryEnvelope";

export interface DailyGroupedReviewCandidate { groupId:string;companyId:string;customerId:string;projectId:string;rentalId:string;businessDate:string;timezone:string }
export interface DailyGroupedReviewDiscovery { runId:string; candidates:DailyGroupedReviewCandidate[];groupsClaimed:number;groupsNoActionable:number;hasMore:boolean;failures:Array<{code:string}> }
export interface DailyGroupedReviewRepository {
 discover(command:{commandId:string;idempotencyKey:string;runAt:string;batchLimit:number}):Promise<DailyGroupedReviewDiscovery>;
 resolvePrincipal(companyId:string):Promise<{success:boolean;code?:string;principalId?:string}>;
 prepare(command:Record<string,unknown>):Promise<{success:boolean;code?:string;disposition?:string;value?:{notificationIntentId?:string}}>;
 completeGroup(groupId:string,runId:string,outcome:"PREPARED"|"REPLAYED"|"FAILED"):Promise<void>;
 complete(runId:string,result:DailyGroupedReviewRunResult):Promise<void>;
}
export interface DailyGroupedReviewRunResult { batchLimit:number;groupsClaimed:number;groupsProcessed:number;groupsEvaluated:number;groupsActionable:number;groupsPrepared:number;groupsReplayed:number;groupsNoActionable:number;groupsFailed:number;notificationsPrepared:number;hasMore:boolean;failureCodes:string[] }

export class DailyGroupedCustomerReviewService {
 constructor(private readonly repository:DailyGroupedReviewRepository,private readonly encryptionKey:Buffer){}
 async run(command:{commandId:string;idempotencyKey:string;runAt:string;batchLimit:number}):Promise<DailyGroupedReviewRunResult>{
  if(!/^[0-9a-f-]{36}$/i.test(command.commandId)||!command.idempotencyKey.trim()||!Number.isFinite(Date.parse(command.runAt))||!Number.isInteger(command.batchLimit)||command.batchLimit<1||command.batchLimit>100)throw new Error("Invalid daily grouped review command.");
  const discovery=await this.repository.discover(command);let prepared=0,replayed=0,failed=discovery.failures.length,notifications=0;
  const failureCodes=discovery.failures.map(x=>x.code);
  for(const candidate of discovery.candidates){
   let outcome:"PREPARED"|"REPLAYED"|"FAILED"="FAILED";
   try{
    const authority=await this.repository.resolvePrincipal(candidate.companyId);
    if(!authority.success||!authority.principalId){failed++;failureCodes.push(authority.code??"SCHEDULER_PRINCIPAL_NOT_CONFIGURED");continue;}
    const notificationId=randomUUID();const credential=generateGroupedReviewCredential();
    const envelope:GroupedReviewDeliveryEnvelope=encryptGroupedReviewDeliveryEnvelope(credential.reviewPath,notificationId,this.encryptionKey);
    const result=await this.repository.prepare({commandId:randomUUID(),idempotencyKey:`daily:${candidate.rentalId}:${candidate.businessDate}`,rentalId:candidate.rentalId,businessDate:candidate.businessDate,principalId:authority.principalId,notificationId,credentialHash:credential.hash,...envelope});
    if(!result.success){failed++;failureCodes.push(result.code??"PREPARATION_FAILED");}
    else if(result.disposition==="CREATED"){prepared++;outcome="PREPARED";if(result.value?.notificationIntentId)notifications++;}
    else{replayed++;outcome="REPLAYED";}
   }catch{failed++;failureCodes.push("GROUP_PREPARATION_FAILED");}
   finally{await this.repository.completeGroup(candidate.groupId,discovery.runId,outcome);}
  }
  const summary={batchLimit:command.batchLimit,groupsClaimed:discovery.candidates.length,groupsProcessed:prepared+replayed+Math.max(0,failed-discovery.failures.length),groupsEvaluated:discovery.candidates.length,groupsActionable:discovery.candidates.length,groupsPrepared:prepared,groupsReplayed:replayed,groupsNoActionable:discovery.groupsNoActionable,groupsFailed:failed,notificationsPrepared:notifications,hasMore:discovery.hasMore,failureCodes:[...new Set(failureCodes)]};
  await this.repository.complete(discovery.runId,summary);return summary;
 }
}
