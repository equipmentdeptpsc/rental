import type{SupabaseClient}from"@supabase/supabase-js";
export class SupabaseUatGroupedReviewCertification{
 constructor(private readonly client:SupabaseClient){}
 private async post<T>(path:string,body:unknown):Promise<T>{const session=await this.client.auth.getSession();const token=session.data.session?.access_token;if(!token)throw new Error("Your session has expired. Sign in again.");const response=await fetch(path,{method:"POST",headers:{authorization:`Bearer ${token}`,"content-type":"application/json"},body:JSON.stringify(body)});const result=await response.json().catch(()=>({code:"UAT_CERTIFICATION_FAILED"})) as any;if(!response.ok)throw new Error(String(result.code??"UAT_CERTIFICATION_FAILED"));return result as T;}
 verify(candidateEmail:string){return this.post<{result:"MATCH"|"NO_MATCH"}>("/api/admin/uat/verify-recipient-override",{candidateEmail});}
 deliver(input:Record<string,unknown>){return this.post<{success:true;result:"DELIVERED"}>("/api/admin/uat/run-grouped-review-certification",input);}
}
