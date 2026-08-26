import {createClient,type SupabaseClient} from "@supabase/supabase-js";
import type {GroupedReviewWorkerEnvironment} from "./configuration";

type Result={status:number;body:Record<string,unknown>};
const response=(status:number,body:Record<string,unknown>):Result=>({status,body});
const normalize=(value:unknown)=>typeof value==="string"?value.trim().toLowerCase():"";
const valid=(value:string)=>value.length>=3&&value.length<=254&&!/[\r\n]/.test(value)&&/^\S+@\S+\.\S+$/.test(value);
export async function fingerprintNormalizedEmail(value:string):Promise<string>{const bytes=new TextEncoder().encode(value);const digest=await crypto.subtle.digest("SHA-256",bytes);return Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,"0")).join("");}
export async function matchesUatRecipientOverride(candidateValue:unknown,configuredValue:unknown):Promise<boolean>{const candidate=normalize(candidateValue),override=normalize(configuredValue);return valid(candidate)&&valid(override)&&(await fingerprintNormalizedEmail(candidate))===(await fingerprintNormalizedEmail(override));}

export class UatRecipientOverrideVerification{
 constructor(private readonly service:SupabaseClient,private readonly configuredOverride:string|undefined){}
 async handle(request:Request):Promise<Result>{
  const token=request.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
  if(!token)return response(401,{result:"NO_MATCH"});
  const identity=await this.service.auth.getUser(token);if(identity.error||!identity.data.user)return response(401,{result:"NO_MATCH"});
  const actorId=identity.data.user.id;
  const [actor,permission]=await Promise.all([
   this.service.schema("erp").from("users").select("id,status").eq("id",actorId).eq("status","active").maybeSingle(),
   this.service.schema("erp").from("effective_user_permissions").select("permission_code").eq("user_id",actorId).eq("permission_code","settings.update").maybeSingle(),
  ]);
  if(actor.error||permission.error||!actor.data||!permission.data)return response(403,{result:"NO_MATCH"});
  const payload=await request.json().catch(()=>null);const candidate=(payload as Record<string,unknown>|null)?.candidateEmail;
  if(!valid(normalize(candidate))||!valid(normalize(this.configuredOverride)))return response(400,{result:"NO_MATCH"});
  return response(200,{result:await matchesUatRecipientOverride(candidate,this.configuredOverride)?"MATCH":"NO_MATCH"});
 }
}

export function createUatRecipientOverrideVerification(environment:GroupedReviewWorkerEnvironment){
 if(environment.ENABLE_UAT_RECIPIENT_OVERRIDE_VERIFIER!=="true")throw new Error("UAT recipient verification is disabled.");
 if(!environment.SUPABASE_URL?.trim()||!environment.SUPABASE_SERVICE_ROLE_KEY?.trim())throw new Error("UAT recipient verification is unavailable.");
 return new UatRecipientOverrideVerification(createClient(environment.SUPABASE_URL,environment.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}}),environment.EMAIL_UAT_RECIPIENT_OVERRIDE);
}
