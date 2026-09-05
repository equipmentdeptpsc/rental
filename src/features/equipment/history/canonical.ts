import { repositorySuccess, type RepositoryResult } from "@/core/persistence";

export type LifecyclePrecision = "timestamp" | "date";
export interface MaintenanceLifecycleEvent { id:string; maintenanceRecordId:string; eventType:"Scheduled"|"Completed"; occurredAt:string; occurredAtPrecision:"date"; maintenanceType?:string; }
export interface DeurLifecycleEvent { id:string; deurId:string; deurNumber?:string; eventType:"Created"|"Submitted"|"Acknowledged"|"Rejected"|"CorrectionRevisionCreated"; occurredAt:string; occurredAtPrecision:"timestamp"; }
export interface EquipmentLifecycleSummaryRepository { getEquipmentMaintenanceLifecycleEvents(equipmentId:string, limit?:number):Promise<RepositoryResult<readonly MaintenanceLifecycleEvent[]>>; getEquipmentDeurLifecycleEvents(equipmentId:string, limit?:number):Promise<RepositoryResult<readonly DeurLifecycleEvent[]>>; }
export class LocalEquipmentLifecycleSummaryRepository implements EquipmentLifecycleSummaryRepository { async getEquipmentMaintenanceLifecycleEvents():Promise<RepositoryResult<readonly MaintenanceLifecycleEvent[]>> { return repositorySuccess([]); } async getEquipmentDeurLifecycleEvents():Promise<RepositoryResult<readonly DeurLifecycleEvent[]>> { return repositorySuccess([]); } }
