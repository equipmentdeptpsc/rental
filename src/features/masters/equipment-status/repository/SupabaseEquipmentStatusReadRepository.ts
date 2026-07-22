import type { SupabaseClient } from "@supabase/supabase-js";
import { repositoryFailure,repositorySuccess,type RepositoryError,type RepositoryResult } from "@/core/persistence";
import type { EquipmentStatusRecord } from "../types";
import { cloneEquipmentStatus,type EquipmentStatusReadOptions,type ReadOnlyEquipmentStatusRepository } from "./ReadOnlyEquipmentStatusRepository";

interface EquipmentStatusRow { id:unknown;code:unknown;name:unknown;description:unknown;active:unknown;deleted_at:unknown;sort_order:unknown }
function mapRow(value:unknown):RepositoryResult<EquipmentStatusRecord>{
  if(!value||typeof value!=="object")return repositoryFailure("EQUIPMENT_STATUS_ROW_MALFORMED","Equipment Status row is not an object.",{context:{repository:"EquipmentStatus"},recoverability:"MANUAL_RECONCILIATION",recommendedAction:"Verify the hosted equipment_statuses schema and data."});
  const row=value as EquipmentStatusRow;
  if(typeof row.id!=="string"||typeof row.name!=="string"||typeof row.active!=="boolean"||(row.description!==null&&typeof row.description!=="string"))return repositoryFailure("EQUIPMENT_STATUS_ROW_MALFORMED","Equipment Status row has incompatible fields.",{context:{repository:"EquipmentStatus",id:typeof row.id==="string"?row.id:undefined},recoverability:"MANUAL_RECONCILIATION",recommendedAction:"Reconcile the hosted Equipment Status row with the canonical schema."});
  return repositorySuccess({id:row.id,status:row.name,description:row.description??"",active:row.active,deleted:row.deleted_at!==null&&row.deleted_at!==undefined});
}
function mapError(error:{code?:string;message?:string}|null,operation:string,aborted:boolean):RepositoryError{
  if(aborted)return{code:"REPOSITORY_REQUEST_CANCELLED",message:"Equipment Status request was cancelled.",context:{repository:"EquipmentStatus",operation,sqlState:error?.code},recoverability:"RETRYABLE",recommendedAction:"Retry when the request is still needed."};
  const code=error?.code??"SUPABASE_QUERY_FAILED";const auth=code==="42501"||code==="PGRST301";const schema=["42P01","42703","PGRST106","PGRST205"].includes(code);const timeout=/timeout|timed out/i.test(error?.message??"");const network=!error?.code&&/fetch|network/i.test(error?.message??"");
  return{code:auth?"REPOSITORY_ACCESS_DENIED":schema?"REPOSITORY_SCHEMA_MISMATCH":timeout?"REPOSITORY_TIMEOUT":network?"REPOSITORY_NETWORK_FAILED":"REPOSITORY_QUERY_FAILED",message:auth?"Equipment Status read access was denied.":schema?"Equipment Status schema is incompatible.":timeout?"Equipment Status request timed out.":network?"Equipment Status could not be reached.":"Equipment Status query failed.",context:{repository:"EquipmentStatus",operation,sqlState:error?.code},recoverability:auth||schema?"USER_ACTION_REQUIRED":"RETRYABLE",recommendedAction:auth?"Verify the publishable key and Equipment Status SELECT policy.":schema?"Apply and validate the canonical database migrations and Data API schema exposure.":"Check connectivity and retry.",cause:error??undefined};
}
export class SupabaseEquipmentStatusReadRepository implements ReadOnlyEquipmentStatusRepository{
  constructor(private readonly client:SupabaseClient){}
  async list(options:EquipmentStatusReadOptions={}):Promise<RepositoryResult<EquipmentStatusRecord[]>>{
    if(options.signal?.aborted)return{success:false,error:mapError(null,"list",true)};
    const query=this.client.schema("erp").from("equipment_statuses").select("id,code,name,description,active,deleted_at,sort_order").order("sort_order",{ascending:true}).order("code",{ascending:true}).abortSignal(options.signal??new AbortController().signal);
    const {data,error}=await query;if(error)return{success:false,error:mapError(error,"list",options.signal?.aborted??false)};
    const ordered=[...(data??[])].sort((left,right)=>Number((left as EquipmentStatusRow).sort_order??0)-Number((right as EquipmentStatusRow).sort_order??0)||String((left as EquipmentStatusRow).code??"").localeCompare(String((right as EquipmentStatusRow).code??"")));
    const records:EquipmentStatusRecord[]=[];for(const row of ordered){const mapped=mapRow(row);if(!mapped.success)return mapped;records.push(mapped.value);}return repositorySuccess(records.map(cloneEquipmentStatus));
  }
  async getById(id:string,options:EquipmentStatusReadOptions={}):Promise<RepositoryResult<EquipmentStatusRecord|null>>{
    if(options.signal?.aborted)return{success:false,error:mapError(null,"getById",true)};
    const {data,error}=await this.client.schema("erp").from("equipment_statuses").select("id,code,name,description,active,deleted_at,sort_order").eq("id",id).abortSignal(options.signal??new AbortController().signal).maybeSingle();
    if(error)return{success:false,error:mapError(error,"getById",options.signal?.aborted??false)};if(data===null)return repositorySuccess(null);const mapped=mapRow(data);return mapped.success?repositorySuccess(cloneEquipmentStatus(mapped.value)):mapped;
  }
}
