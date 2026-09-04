import type { SupabaseClient } from "@supabase/supabase-js";
import type { User } from "@/features/auth/domain/user";
import type { Operator } from "@/features/operators/types";
import type { RemoteAssignableRole, RemoteUserAdministration } from "@/features/users/services/RemoteUserAdministration";
import type { CreateUserInput } from "@/features/users/services/UserManagementService";

export class SupabaseRemoteUserAdministration implements RemoteUserAdministration {
  constructor(private readonly client: SupabaseClient, private readonly endpoint = "/api/admin/users") {}

  async listUsers(): Promise<readonly User[]> {
    const { data, error } = await this.client.schema("erp").from("users").select("id,username,display_name,email,company_id,status,operator_id,credential_mode,created_at,updated_at,user_roles(app_roles(code))").order("display_name");
    if (error) throw new Error("Unable to load canonical Users.");
    return (data ?? []).map((row: any) => ({ id:row.id,username:row.username,displayName:row.display_name,email:row.email??undefined,companyId:row.company_id,status:row.status,operatorId:row.operator_id??undefined,credentialMode:row.credential_mode==="OPERATOR_PIN"?"OPERATOR_PIN":"PASSWORD",createdAt:row.created_at,updatedAt:row.updated_at,systemRoles:(row.user_roles??[]).flatMap((x:any)=>x.app_roles?.code?[x.app_roles.code]:[]) }));
  }
  async listRoles(): Promise<readonly RemoteAssignableRole[]> {
    const { data, error } = await this.client.schema("erp").from("app_roles").select("code,name,active,deprecated_at,catalog_version,role_permissions(app_permissions(code,active))").order("name");
    if (error) throw new Error("Unable to load canonical roles.");
    return (data ?? []).map((row:any)=>({
      code:String(row.code),name:String(row.name),active:row.active===true,
      deprecatedAt:row.deprecated_at??undefined,catalogVersion:row.catalog_version??undefined,
      permissions:[...new Set<string>((row.role_permissions??[]).flatMap((mapping:any)=>mapping.app_permissions?.active&&mapping.app_permissions?.code?[String(mapping.app_permissions.code)]:[]))].sort(),
    }));
  }
  async listOperators(): Promise<readonly Operator[]> {
    const { data, error } = await this.client.schema("erp").from("operators").select("id,name,email,license_number,certification_type,status,joined_date").eq("status","Active").order("name");
    if (error) throw new Error("Unable to load canonical Operators.");
    return (data ?? []).map((row:any)=>({id:row.id,name:row.name,email:row.email??"",licenseNumber:row.license_number??"",certificationType:row.certification_type,status:row.status,joinedDate:row.joined_date??""}));
  }
  create(input: CreateUserInput & { commandId:string;idempotencyKey:string }): Promise<User> { return this.request<User>(this.endpoint,input); }
  deactivate(userId:string,commandId:string,idempotencyKey:string):Promise<User>{return this.request<User>(`${this.endpoint}/${encodeURIComponent(userId)}/deactivate`,{commandId,idempotencyKey});}
  resetPassword(userId:string,newPassword:string,commandId:string,idempotencyKey:string):Promise<void>{return this.request<void>(`${this.endpoint}/${encodeURIComponent(userId)}/reset-password`,{newPassword,commandId,idempotencyKey});}
  resetOperatorPin(userId:string,newPin:string,confirmNewPin:string,commandId:string,idempotencyKey:string):Promise<void>{return this.request<void>(`${this.endpoint}/${encodeURIComponent(userId)}/reset-operator-pin`,{newPin,confirmNewPin,commandId,idempotencyKey});}
  private async request<T>(url:string,body:unknown):Promise<T>{
    const session=await this.client.auth.getSession();const token=session.data.session?.access_token;
    if(!token)throw new Error("Your session has expired. Sign in again.");
    const response=await fetch(url,{method:"POST",headers:{authorization:`Bearer ${token}`,"content-type":"application/json"},body:JSON.stringify(body)});
    const result=await response.json().catch(()=>({success:false,message:"Remote user administration failed."})) as {success?:boolean;value?:T;message?:string};
    if(!response.ok||!result.success)throw new Error(result.message??"Remote user administration failed.");return result.value as T;
  }
}
