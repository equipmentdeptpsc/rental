import type { RepositoryResult } from "@/core/persistence";
import type { EquipmentStatusRecord } from "../types";

export interface EquipmentStatusReadOptions { signal?:AbortSignal }
export interface ReadOnlyEquipmentStatusRepository {
  list(options?:EquipmentStatusReadOptions):Promise<RepositoryResult<EquipmentStatusRecord[]>>;
  getById(id:string,options?:EquipmentStatusReadOptions):Promise<RepositoryResult<EquipmentStatusRecord|null>>;
}

export function cloneEquipmentStatus(record:EquipmentStatusRecord):EquipmentStatusRecord { return structuredClone(record); }
