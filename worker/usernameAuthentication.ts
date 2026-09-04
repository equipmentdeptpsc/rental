import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { GroupedReviewWorkerEnvironment, RateLimitBinding } from "./configuration";

type Json = Record<string, unknown>;
export type UsernameLoginResult = { status:number; body:Json };
const INVALID_MESSAGE="Invalid username/email or password.";
const response=(status:number):UsernameLoginResult=>({status,body:{success:false,message:INVALID_MESSAGE}});
const text=(value:unknown)=>typeof value==="string"?value.trim():"";

interface ResolverClient { schema(name:string):{rpc(name:string,args:Json):PromiseLike<{data:unknown;error:unknown}>} }
interface PasswordClient { auth:{signInWithPassword(credentials:{email:string;password:string}):Promise<{data:{session:{access_token:string;refresh_token:string}|null};error:unknown}>} }
export interface UsernameLoginLimiters {
  networkBurst:RateLimitBinding;networkSustained:RateLimitBinding;identifierBurst:RateLimitBinding;identifierSustained:RateLimitBinding;
}

export class TrustedUsernameAuthentication {
  constructor(private readonly resolver:ResolverClient,private readonly passwords:PasswordClient,private readonly limits:UsernameLoginLimiters){}

  async handle(request:Request):Promise<UsernameLoginResult>{
    const networkKey=await digest(request.headers.get("cf-connecting-ip")?.trim()||"unavailable");
    if(!await allowed(networkKey,[this.limits.networkBurst,this.limits.networkSustained]))return response(429);
    const size=Number(request.headers.get("content-length")??"0");
    if(!Number.isFinite(size)||size>4096)return response(401);
    const payload=await request.json().catch(()=>null);
    if(!payload||typeof payload!=="object"||Array.isArray(payload))return response(401);
    const identifier=text((payload as Json).identifier),password=typeof (payload as Json).password==="string"?(payload as Json).password as string:"";
    if(!identifier||identifier.length>120||!password||password.length>1024)return response(401);
    const identifierKey=await digest(identifier.toLocaleLowerCase("en-US"));
    if(!await allowed(identifierKey,[this.limits.identifierBurst,this.limits.identifierSustained]))return response(429);

    const lookup=await this.resolver.schema("erp").rpc("resolve_active_application_user_login",{identifier});
    const resolved=lookup.data as {success?:boolean;email?:unknown;credentialMode?:unknown}|null;
    if(!lookup.error&&resolved?.success===true&&resolved.credentialMode==='OPERATOR_PIN')return response(401);
    const email=!lookup.error&&resolved?.success===true&&typeof resolved.email==="string"?resolved.email:"invalid-login@invalid.example";
    const authenticated=await this.passwords.auth.signInWithPassword({email,password});
    if(email==="invalid-login@invalid.example"||authenticated.error||!authenticated.data.session)return response(401);
    return{status:200,body:{success:true,session:{accessToken:authenticated.data.session.access_token,refreshToken:authenticated.data.session.refresh_token}}};
  }
}

export class TrustedOperatorPinAuthentication {
  constructor(private readonly resolver:ResolverClient,private readonly passwords:PasswordClient,private readonly limits:UsernameLoginLimiters){}

  async handle(request:Request):Promise<UsernameLoginResult>{
    const networkKey=await digest(request.headers.get("cf-connecting-ip")?.trim()||"unavailable");
    if(!await allowed(networkKey,[this.limits.networkBurst,this.limits.networkSustained]))return response(429);
    const size=Number(request.headers.get("content-length")??"0");
    if(!Number.isFinite(size)||size>4096)return response(401);
    const payload=await request.json().catch(()=>null);
    if(!payload||typeof payload!=="object"||Array.isArray(payload))return response(401);
    const identifier=text((payload as Json).identifier),pin=typeof (payload as Json).pin==="string"?(payload as Json).pin as string:"";
    if(!identifier||identifier.length>120||!isValidOperatorPin(pin))return response(401);
    const identifierKey=await digest(identifier.toLocaleLowerCase("en-US"));
    if(!await allowed(identifierKey,[this.limits.identifierBurst,this.limits.identifierSustained]))return response(429);

    const lookup=await this.resolver.schema("erp").rpc("resolve_active_operator_pin_login",{identifier});
    const resolved=lookup.data as {success?:boolean;email?:unknown}|null;
    const email=!lookup.error&&resolved?.success===true&&typeof resolved.email==="string"?resolved.email:"invalid-login@invalid.example";
    const authenticated=await this.passwords.auth.signInWithPassword({email,password:pin});
    if(email==="invalid-login@invalid.example"||authenticated.error||!authenticated.data.session)return response(401);
    return{status:200,body:{success:true,session:{accessToken:authenticated.data.session.access_token,refreshToken:authenticated.data.session.refresh_token}}};
  }
}

export function isValidOperatorPin(pin:string):boolean{
  if(!/^\d{6}$/.test(pin))return false;
  const digits=[...pin].map(value=>value.charCodeAt(0));
  if(digits.every(value=>value===digits[0]))return false;
  const delta=digits[1]-digits[0];
  return !((delta===1||delta===-1)&&digits.every((value,index)=>index===0||value-digits[index-1]===delta));
}

async function digest(value:string):Promise<string>{
  const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes),byte=>byte.toString(16).padStart(2,"0")).join("");
}
async function allowed(key:string,bindings:RateLimitBinding[]):Promise<boolean>{
  const decisions=await Promise.all(bindings.map(binding=>binding.limit({key})));
  return decisions.every(decision=>decision.success);
}

export function createTrustedUsernameAuthentication(environment:GroupedReviewWorkerEnvironment):TrustedUsernameAuthentication{
  if(!environment.SUPABASE_URL?.trim()||!environment.SUPABASE_SERVICE_ROLE_KEY?.trim()||!environment.SUPABASE_PUBLISHABLE_KEY?.trim()||!environment.USERNAME_LOGIN_NETWORK_BURST||!environment.USERNAME_LOGIN_NETWORK_SUSTAINED||!environment.USERNAME_LOGIN_IDENTIFIER_BURST||!environment.USERNAME_LOGIN_IDENTIFIER_SUSTAINED)throw new Error("Remote username authentication is not configured.");
  const options={auth:{persistSession:false,autoRefreshToken:false}} as const;
  const resolver=createClient(environment.SUPABASE_URL,environment.SUPABASE_SERVICE_ROLE_KEY,options) as SupabaseClient;
  const passwords=createClient(environment.SUPABASE_URL,environment.SUPABASE_PUBLISHABLE_KEY,options) as SupabaseClient;
  return new TrustedUsernameAuthentication(resolver,passwords,{networkBurst:environment.USERNAME_LOGIN_NETWORK_BURST,networkSustained:environment.USERNAME_LOGIN_NETWORK_SUSTAINED,identifierBurst:environment.USERNAME_LOGIN_IDENTIFIER_BURST,identifierSustained:environment.USERNAME_LOGIN_IDENTIFIER_SUSTAINED});
}

export function createTrustedOperatorPinAuthentication(environment:GroupedReviewWorkerEnvironment):TrustedOperatorPinAuthentication{
  if(!environment.SUPABASE_URL?.trim()||!environment.SUPABASE_SERVICE_ROLE_KEY?.trim()||!environment.SUPABASE_PUBLISHABLE_KEY?.trim()||!environment.USERNAME_LOGIN_NETWORK_BURST||!environment.USERNAME_LOGIN_NETWORK_SUSTAINED||!environment.USERNAME_LOGIN_IDENTIFIER_BURST||!environment.USERNAME_LOGIN_IDENTIFIER_SUSTAINED)throw new Error("Remote Operator PIN authentication is not configured.");
  const options={auth:{persistSession:false,autoRefreshToken:false}} as const;
  const resolver=createClient(environment.SUPABASE_URL,environment.SUPABASE_SERVICE_ROLE_KEY,options) as SupabaseClient;
  const passwords=createClient(environment.SUPABASE_URL,environment.SUPABASE_PUBLISHABLE_KEY,options) as SupabaseClient;
  return new TrustedOperatorPinAuthentication(resolver,passwords,{networkBurst:environment.USERNAME_LOGIN_NETWORK_BURST,networkSustained:environment.USERNAME_LOGIN_NETWORK_SUSTAINED,identifierBurst:environment.USERNAME_LOGIN_IDENTIFIER_BURST,identifierSustained:environment.USERNAME_LOGIN_IDENTIFIER_SUSTAINED});
}

export function usernameLoginJson(result:UsernameLoginResult):Response{return Response.json(result.body,{status:result.status,headers:{"cache-control":"no-store"}})}

export function usernameLoginCorsHeaders(request:Request,environment:GroupedReviewWorkerEnvironment):HeadersInit{
  const origin=request.headers.get("origin")?.trim();
  const allowedOrigins=(environment.USERNAME_LOGIN_ALLOWED_ORIGIN??'').split(',').map(value=>value.trim()).filter(Boolean);
  if(!origin||!allowedOrigins.includes(origin))return{};
  return{"access-control-allow-origin":origin,"access-control-allow-methods":"POST, OPTIONS","access-control-allow-headers":"content-type","access-control-max-age":"600","vary":"Origin"};
}
