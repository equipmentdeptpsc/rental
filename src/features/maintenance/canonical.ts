import { repositorySuccess, type RepositoryResult } from "@/core/persistence";
import type { MaintenanceRecord } from "./types";

export type CanonicalMaintenanceStatus = "Scheduled" | "In Progress" | "Completed";

export interface CanonicalMaintenanceRecord {
  id: string;
  equipmentId: string;
  maintenanceType: string;
  scheduledReading: number;
  currentReading: number;
  scheduledDate: string;
  completedDate?: string;
  technician: string;
  remarks: string;
  status: CanonicalMaintenanceStatus;
  createdAt?: string;
  updatedAt?: string;
}

export interface EquipmentMaintenanceSnapshot {
  openRecords: readonly CanonicalMaintenanceRecord[];
  latestCompleted?: CanonicalMaintenanceRecord;
}

export interface EquipmentMaintenanceSnapshotRepository {
  getEquipmentMaintenanceSnapshot(equipmentId: string): Promise<RepositoryResult<EquipmentMaintenanceSnapshot>>;
}

const openPriority = (status: CanonicalMaintenanceStatus) => status === "In Progress" ? 0 : 1;

export function resolveEquipmentMaintenanceSnapshot(records: readonly CanonicalMaintenanceRecord[]): EquipmentMaintenanceSnapshot {
  const openRecords = records
    .filter((record) => record.status === "Scheduled" || record.status === "In Progress")
    .slice()
    .sort((left, right) => openPriority(left.status) - openPriority(right.status)
      || left.scheduledDate.localeCompare(right.scheduledDate)
      || (left.updatedAt ?? "").localeCompare(right.updatedAt ?? "")
      || (left.createdAt ?? "").localeCompare(right.createdAt ?? "")
      || left.id.localeCompare(right.id));
  const latestCompleted = records
    .filter((record) => record.status === "Completed")
    .slice()
    .sort((left, right) => (right.completedDate ?? "").localeCompare(left.completedDate ?? "")
      || (right.updatedAt ?? "").localeCompare(left.updatedAt ?? "")
      || (right.createdAt ?? "").localeCompare(left.createdAt ?? "")
      || right.id.localeCompare(left.id))[0];
  return { openRecords, ...(latestCompleted ? { latestCompleted } : {}) };
}

const fromLocal = (record: MaintenanceRecord): CanonicalMaintenanceRecord => ({ ...record });

export class LocalEquipmentMaintenanceSnapshotRepository implements EquipmentMaintenanceSnapshotRepository {
  constructor(private readonly records: () => readonly MaintenanceRecord[]) {}

  async getEquipmentMaintenanceSnapshot(equipmentId: string): Promise<RepositoryResult<EquipmentMaintenanceSnapshot>> {
    return repositorySuccess(resolveEquipmentMaintenanceSnapshot(this.records().filter((record) => record.equipmentId === equipmentId).map(fromLocal)));
  }
}
