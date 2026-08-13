import type {SupabaseClient} from "@supabase/supabase-js";
import type {DailyGroupedReviewDiscovery,DailyGroupedReviewRepository,DailyGroupedReviewRunResult} from "./DailyGroupedCustomerReviewService";

export class SupabaseDailyGroupedReviewRepository implements DailyGroupedReviewRepository{
 constructor(private readonly service:SupabaseClient){}
 private async rpc<T>(name:string,args:Record<string,unknown>):Promise<T>{const r=await this.service.schema("erp").rpc(name,args);if(r.error)throw new Error(`${name} failed (${r.error.code??"transport"})`);return r.data as T;}
 async discover(command:{commandId:string;idempotencyKey:string;runAt:string;batchLimit:number}):Promise<DailyGroupedReviewDiscovery>{const r=await this.rpc<any>("command_run_daily_grouped_customer_reviews",{command});if(!r?.success)throw new Error(`Daily scheduler discovery rejected (${r?.code??"unknown"}).`);return r.value;}
 async resolvePrincipal(companyId:string){const r=await this.rpc<any>("resolve_grouped_review_scheduler_principal",{target_company_id:companyId});return {success:r?.success===true,code:r?.code,principalId:r?.value?.principalId};}
 async prepare(command:Record<string,unknown>){return this.rpc<any>("trusted_prepare_grouped_customer_review_delivery_as_scheduler",{command});}
 async completeGroup(groupId:string,runId:string,outcome:"PREPARED"|"REPLAYED"|"FAILED"):Promise<void>{const r=await this.rpc<any>("complete_daily_grouped_customer_review_group",{group_id:groupId,run_id:runId,outcome});if(!r?.success)throw new Error(`Daily scheduler group completion rejected (${r?.code??"unknown"}).`);}
 async complete(runId:string,result:DailyGroupedReviewRunResult):Promise<void>{const r=await this.rpc<any>("complete_daily_grouped_customer_review_run",{run_id:runId,result});if(!r?.success)throw new Error(`Daily scheduler completion rejected (${r?.code??"unknown"}).`);}
}
