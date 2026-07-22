import type { SupabaseClient } from "@supabase/supabase-js";
import { repositorySuccess, type RepositoryResult } from "@/core/persistence";
import { createRemoteRowReader, normalizeRemoteQueryOptions, RemoteRepositoryBase, type RemoteCore } from "@/core/remote";
import type { EquipmentStatusRecord } from "../types";
import { cloneEquipmentStatus, type EquipmentStatusReadOptions, type ReadOnlyEquipmentStatusRepository } from "./ReadOnlyEquipmentStatusRepository";

interface EquipmentStatusRow { id: unknown; code: unknown; name: unknown; description: unknown; active: unknown; deleted_at: unknown; sort_order: unknown }
const COLUMNS="id,code,name,description,active,deleted_at,sort_order";

export class SupabaseEquipmentStatusReadRepository extends RemoteRepositoryBase implements ReadOnlyEquipmentStatusRepository {
  constructor(private readonly client:SupabaseClient,remoteCore:RemoteCore){super("EquipmentStatus",["ReadOnly","SupportsPaging","SupportsOrdering"],remoteCore);}

  async list(options:EquipmentStatusReadOptions={}):Promise<RepositoryResult<EquipmentStatusRecord[]>>{
    const normalized=normalizeRemoteQueryOptions(options);
    const result=await this.read<unknown[]>("list",normalized.signal,signal=>{
      let query=this.client.schema("erp").from("equipment_statuses").select(COLUMNS);
      for(const order of normalized.ordering??[{field:"sort_order",ascending:true},{field:"code",ascending:true}])query=query.order(order.field,{ascending:order.ascending});
      if(normalized.paging?.limit!==undefined){const offset=normalized.paging.offset??0;query=query.range(offset,offset+normalized.paging.limit-1);}
      return query.abortSignal(signal);
    });
    if(!result.success)return result;
    const rows=[...(result.value??[])].sort(compareRows);const records:EquipmentStatusRecord[]=[];
    for(const row of rows){const mapped=this.mapTimed(()=>mapRow(row));if(!mapped.success)return mapped;records.push(mapped.value);}
    return repositorySuccess(records.map(cloneEquipmentStatus));
  }

  async getById(id:string,options:EquipmentStatusReadOptions={}):Promise<RepositoryResult<EquipmentStatusRecord|null>>{
    const result=await this.read<unknown>("getById",options.signal,signal=>this.client.schema("erp").from("equipment_statuses").select(COLUMNS).eq("id",id).abortSignal(signal).maybeSingle());
    if(!result.success)return result;if(result.value===null)return repositorySuccess(null);const mapped=this.mapTimed(()=>mapRow(result.value));return mapped.success?repositorySuccess(cloneEquipmentStatus(mapped.value)):mapped;
  }
}

function mapRow(value:unknown):RepositoryResult<EquipmentStatusRecord>{
  const readerResult=createRemoteRowReader(value,"EquipmentStatus");if(!readerResult.success)return readerResult;const reader=readerResult.value;
  const id=reader.requiredString("id"),name=reader.requiredString("name"),description=reader.nullableString("description"),active=reader.requiredBoolean("active");
  if(!id.success)return id;if(!name.success)return name;if(!description.success)return description;if(!active.success)return active;
  const deleted=(value as EquipmentStatusRow).deleted_at!==null&&(value as EquipmentStatusRow).deleted_at!==undefined;
  return repositorySuccess({id:id.value,status:name.value,description:description.value,active:active.value,deleted});
}
function compareRows(left:unknown,right:unknown):number{const a=left as EquipmentStatusRow,b=right as EquipmentStatusRow;return Number(a.sort_order??0)-Number(b.sort_order??0)||String(a.code??"").localeCompare(String(b.code??""));}
