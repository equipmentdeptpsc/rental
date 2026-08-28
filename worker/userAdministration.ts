import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { GroupedReviewWorkerEnvironment } from "./configuration";

type Json = Record<string, unknown>;
type SafeResult = { status:number; body:Json };
const result=(status:number,body:Json):SafeResult=>({status,body});
const text=(value:unknown)=>typeof value==="string"?value.trim():"";

export class TrustedUserAdministration {
  constructor(private readonly service:SupabaseClient){}

  async handle(request:Request):Promise<SafeResult>{
    const token=request.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
    if(!token)return result(401,{success:false,message:"Authentication is required."});
    const identity=await this.service.auth.getUser(token);
    if(identity.error||!identity.data.user)return result(401,{success:false,message:"Your session is invalid or expired."});
    const actorId=identity.data.user.id;
    const actor=await this.service.schema("erp").from("users").select("id,company_id,status").eq("id",actorId).maybeSingle();
    if(actor.error||!actor.data||actor.data.status!=="active")return result(403,{success:false,message:"Active application-user access is required."});
    const reset=request.url.match(/\/api\/admin\/users\/([^/]+)\/reset-password$/);
    const deactivate=request.url.match(/\/api\/admin\/users\/([^/]+)\/deactivate$/);
    const requiredPermissions=reset?["users.password.reset"]:deactivate?["users.deactivate"]:["users.create","roles.assign"];
    const permission=await this.service.schema("erp").from("effective_user_permissions").select("permission_code").eq("user_id",actorId).in("permission_code",requiredPermissions);
    if(permission.error)return result(503,{success:false,message:"User authorization is temporarily unavailable."});
    const granted=new Set((permission.data??[]).map(row=>String(row.permission_code)));
    if(requiredPermissions.some(code=>!granted.has(code)))return result(403,{success:false,message:"You do not have permission to perform this user-administration action."});
    const payload=await request.json().catch(()=>null);
    if(!payload||typeof payload!=="object"||Array.isArray(payload))return result(400,{success:false,message:"Invalid request."});
    const command=payload as Json;
    return reset?this.reset(actorId,String(actor.data.company_id),decodeURIComponent(reset[1]),command):deactivate?this.deactivate(actorId,String(actor.data.company_id),decodeURIComponent(deactivate[1]),command):this.create(actorId,String(actor.data.company_id),command);
  }

  private async create(actorId:string,companyId:string,command:Json):Promise<SafeResult>{
    const email=text(command.email).toLowerCase(),password=text(command.initialPassword),username=text(command.username),displayName=text(command.displayName);
    const commandId=text(command.commandId),idempotencyKey=text(command.idempotencyKey),roleCodes=Array.isArray(command.systemRoles)?[...new Set(command.systemRoles.filter((x):x is string=>typeof x==="string").map(x=>x.trim()).filter(Boolean))]:[];
    const operatorId=text(command.operatorId)||undefined;
    if(!displayName||!username||!/^\S+@\S+\.\S+$/.test(email)||password.length<8||!commandId||!idempotencyKey||roleCodes.length===0)return result(400,{success:false,message:"Complete all required user fields with a valid email, password, and role."});
    const roles=await this.service.schema("erp").from("app_roles").select("code,active,deprecated_at").in("code",roleCodes).eq("active",true).is("deprecated_at",null);
    if(roles.error||roles.data?.length!==roleCodes.length)return result(400,{success:false,message:"One or more selected roles are not available."});
    if(operatorId){const operator=await this.service.schema("erp").from("operators").select("id").eq("id",operatorId).eq("company_id",companyId).eq("status","Active").maybeSingle();if(operator.error||!operator.data)return result(404,{success:false,message:"The selected Operator is not available."});}
    const replay=await this.service.schema("erp").rpc("lookup_application_user_provisioning_command",{command:{actorId,companyId,idempotencyKey,displayName,username,email,roleCodes,...(operatorId?{operatorId}:{})}});
    const replayResult=replay.data as {success?:boolean;state?:string;value?:Json;message?:string}|null;
    if(replay.error||!replayResult?.success)return result(409,{success:false,message:replayResult?.message??"The provisioning request could not be replayed safely."});
    if(replayResult.state==="COMPLETED")return result(200,{success:true,value:replayResult.value??{}});
    const auth=await this.service.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{display_name:displayName}});
    if(auth.error||!auth.data.user)return result(auth.error?.status===422?409:400,{success:false,message:auth.error?.status===422?"Email already exists.":"The authentication identity could not be created."});
    const provision=await this.service.schema("erp").rpc("command_provision_application_user",{command:{commandId,idempotencyKey,actorId,companyId,authUserId:auth.data.user.id,displayName,username,email,roleCodes,...(operatorId?{operatorId}:{})}});
    const response=provision.data as {success?:boolean;value?:Json;message?:string;code?:string}|null;
    if(provision.error||!response?.success){const compensation=await this.service.auth.admin.deleteUser(auth.data.user.id);return result(compensation.error?500:(response?.code==="CONFLICT"?409:400),{success:false,message:compensation.error?"Provisioning failed and Auth cleanup requires administrator support.":response?.message??"Canonical user provisioning failed.",code:compensation.error?"COMPENSATION_FAILED":"PROVISIONING_FAILED"});}
    return result(201,{success:true,value:response.value??{}});
  }

  private async reset(actorId:string,companyId:string,targetId:string,command:Json):Promise<SafeResult>{
    const newPassword=text(command.newPassword),commandId=text(command.commandId),idempotencyKey=text(command.idempotencyKey);
    if(newPassword.length<8)return result(400,{success:false,message:"Password must contain at least 8 characters."});
    if(!commandId||!idempotencyKey)return result(400,{success:false,message:"A command identity is required."});
    const target=await this.service.schema("erp").from("users").select("id,company_id,operator_id,status").eq("id",targetId).eq("company_id",companyId).eq("status","active").maybeSingle();
    if(target.error||!target.data)return result(404,{success:false,message:"User is not available."});
    const prepared=await this.service.schema("erp").rpc("prepare_application_user_password_reset",{command:{actorId,companyId,targetUserId:targetId,commandId,idempotencyKey}});
    const preparation=prepared.data as {success?:boolean;state?:string;code?:string;message?:string}|null;
    if(prepared.error)return result(503,{success:false,message:"Password reset preparation is temporarily unavailable."});
    if(!preparation?.success){const status=preparation?.code==="FORBIDDEN"?403:preparation?.code==="NOT_FOUND"?404:preparation?.code==="IDEMPOTENCY_MISMATCH"?409:400;return result(status,{success:false,message:preparation?.message??"Password reset was rejected.",code:preparation?.code});}
    if(preparation.state==="COMPLETED")return result(200,{success:true});
    if(preparation.state!=="NEW")return result(409,{success:false,message:"This password reset is already being processed.",code:"COMMAND_IN_PROGRESS"});
    const changed=await this.service.auth.admin.updateUserById(targetId,{password:newPassword});
    if(changed.error){await this.service.schema("erp").rpc("fail_application_user_password_reset",{command:{actorId,companyId,targetUserId:targetId,commandId,idempotencyKey}});return result(400,{success:false,message:"The remote password could not be reset."});}
    const audit=await this.service.schema("erp").rpc("complete_application_user_password_reset",{command:{actorId,companyId,targetUserId:targetId,commandId,idempotencyKey}});
    if(audit.error||(audit.data as {success?:boolean}|null)?.success!==true)return result(500,{success:false,message:"Password changed, but audit completion requires administrator support.",code:"AUDIT_COMPLETION_FAILED"});
    return result(200,{success:true});
  }

  private async deactivate(actorId:string,companyId:string,targetId:string,command:Json):Promise<SafeResult>{
    const commandId=text(command.commandId),idempotencyKey=text(command.idempotencyKey);
    if(!commandId||!idempotencyKey)return result(400,{success:false,message:"A command identity is required."});
    const deactivated=await this.service.schema("erp").rpc("command_deactivate_application_user",{command:{actorId,companyId,targetUserId:targetId,commandId,idempotencyKey}});
    const response=deactivated.data as {success?:boolean;value?:Json;message?:string;code?:string}|null;
    if(deactivated.error)return result(503,{success:false,message:"User deactivation is temporarily unavailable."});
    if(!response?.success){const status=response?.code==="FORBIDDEN"?403:response?.code==="NOT_FOUND"?404:response?.code==="IDEMPOTENCY_MISMATCH"?409:400;return result(status,{success:false,message:response?.message??"User deactivation was rejected.",code:response?.code});}
    return result(200,{success:true,value:response.value??{}});
  }
}

export function createTrustedUserAdministration(environment:GroupedReviewWorkerEnvironment):TrustedUserAdministration{
  if(!environment.SUPABASE_URL?.trim()||!environment.SUPABASE_SERVICE_ROLE_KEY?.trim())throw new Error("Remote user administration is not configured.");
  return new TrustedUserAdministration(createClient(environment.SUPABASE_URL,environment.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}}));
}

export function safeJson(response:SafeResult):Response{return Response.json(response.body,{status:response.status,headers:{"cache-control":"no-store"}})}
