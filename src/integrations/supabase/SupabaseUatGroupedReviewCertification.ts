import type{SupabaseClient}from"@supabase/supabase-js";
export type UatGroupedReviewDispatchResolution={rentalId:string;deurId:string;deurNumber?:string;workDate:string;batchId:string;reviewRequestId:string;reviewStatus:string;reviewConsumed:boolean;acknowledgementCount:number;notificationId:string;sourceAggregateType:string;sourceAggregateId:string;notificationStatus:string;attemptCount:number;deliveryAttemptCount:number;provider:string|null;due:boolean;locked:boolean;activeEnvelopeCount:number;eligibleForDispatch:boolean;failClosedReason:string|null};
export class SupabaseUatGroupedReviewCertification{
 constructor(private readonly client:SupabaseClient){}
 private async post<T>(path:string,body:unknown):Promise<T>{const session=await this.client.auth.getSession();const token=session.data.session?.access_token;if(!token)throw new Error("Your session has expired. Sign in again.");const response=await fetch(path,{method:"POST",headers:{authorization:`Bearer ${token}`,"content-type":"application/json"},body:JSON.stringify(body)});const result=await response.json().catch(()=>({code:"UAT_CERTIFICATION_FAILED"})) as any;if(!response.ok)throw new Error(String(result.code??"UAT_CERTIFICATION_FAILED"));return result as T;}
 verify(candidateEmail:string){return this.post<{result:"MATCH"|"NO_MATCH"}>("/api/admin/uat/verify-recipient-override",{candidateEmail});}
 verifyProvider(){return this.post<{result:"VALID"|"INVALID"|"UNAVAILABLE"}>("/api/admin/uat/verify-provider-authentication",{});}
 preflight(input:Record<string,unknown>){return this.post<{success:true;result:"ELIGIBLE"}>("/api/admin/uat/preflight-grouped-review-certification",{...input,mode:"PREFLIGHT"});}
 deliver(input:Record<string,unknown>){return this.post<{success:true;result:"DELIVERED"}>("/api/admin/uat/run-grouped-review-certification",input);}
 resolveGroupedReviewDispatch(input:{rentalId:string;workDate:string;deurId?:string;deurNumber?:string}){const{rentalId,workDate,deurNumber}=input;return this.post<{success:true;value:UatGroupedReviewDispatchResolution}>("/api/admin/uat/resolve-grouped-review-dispatch",{rentalId,workDate,...(deurNumber?{deurNumber}:{})});}
 dispatchExistingNotification(notificationId:string){return this.post<{success:true;result:"DISPATCHED"|"ALREADY_PROCESSED"}>("/api/admin/uat/dispatch-existing-notification",{notificationId});}
 provisionMultiEquipmentCertification(){return this.post<{success:true;result:"PROVISIONED"|"REUSED";scenario:unknown}>("/api/admin/uat/provision-multi-equipment-certification",{scenarioKey:"MULTI-EQUIPMENT-RUNTIME-CERT-2026-08-29"});}
}
