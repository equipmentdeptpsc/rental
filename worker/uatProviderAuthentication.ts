import{createClient,type SupabaseClient}from"@supabase/supabase-js";
import{verifyResendAuthentication}from"../server/notifications/ResendEmailDeliveryProvider";
import type{GroupedReviewWorkerEnvironment}from"./configuration";

type Result={status:number;body:Record<string,unknown>};
export class UatProviderAuthentication{
 constructor(private readonly service:SupabaseClient,private readonly apiKey:string|undefined,private readonly fetcher:typeof fetch=globalThis.fetch){}
 async handle(request:Request):Promise<Result>{
  const token=request.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];if(!token)return{status:401,body:{result:"UNAVAILABLE"}};
  const identity=await this.service.auth.getUser(token);if(identity.error||!identity.data.user)return{status:401,body:{result:"UNAVAILABLE"}};
  const permission=await this.service.schema("erp").from("effective_user_permissions").select("permission_code").eq("user_id",identity.data.user.id).eq("permission_code","settings.update").maybeSingle();
  if(permission.error||!permission.data)return{status:403,body:{result:"UNAVAILABLE"}};
  if(!this.apiKey?.trim())return{status:503,body:{result:"INVALID"}};
  const result=await verifyResendAuthentication(this.apiKey,this.fetcher);return{status:result==="UNAVAILABLE"?503:200,body:{result}};
 }
}
export function createUatProviderAuthentication(environment:GroupedReviewWorkerEnvironment){
 if(environment.ENABLE_UAT_RECIPIENT_OVERRIDE_VERIFIER!=="true"||!environment.SUPABASE_URL||!environment.SUPABASE_SERVICE_ROLE_KEY)throw new Error("UAT provider authentication is disabled.");
 return new UatProviderAuthentication(createClient(environment.SUPABASE_URL,environment.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}}),environment.RESEND_API_KEY);
}
