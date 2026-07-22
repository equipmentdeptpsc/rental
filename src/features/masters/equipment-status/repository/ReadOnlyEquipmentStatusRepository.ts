import type { RepositoryResult } from "@/core/persistence";
import type { RemoteCapabilities, RemoteQueryOptions } from "@/core/remote";
import type { EquipmentStatusRecord } from "../types";

export type EquipmentStatusReadOptions = RemoteQueryOptions;
export interface ReadOnlyEquipmentStatusRepository {
  readonly capabilities: RemoteCapabilities;
  list(options?:EquipmentStatusReadOptions):Promise<RepositoryResult<EquipmentStatusRecord[]>>;
  getById(id:string,options?:EquipmentStatusReadOptions):Promise<RepositoryResult<EquipmentStatusRecord|null>>;
}

export function cloneEquipmentStatus(record:EquipmentStatusRecord):EquipmentStatusRecord { return structuredClone(record); }
