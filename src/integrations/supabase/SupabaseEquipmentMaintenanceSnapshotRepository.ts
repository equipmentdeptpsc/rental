import type { SupabaseClient } from "@supabase/supabase-js";

import { repositoryFailure, repositorySuccess, type RepositoryResult } from "@/core/persistence";
import type { CanonicalMaintenanceRecord, EquipmentMaintenanceSnapshot, EquipmentMaintenanceSnapshotRepository } from "@/features/maintenance/canonical";

type RpcClient = Pick<SupabaseClient, "schema">;
const statuses = new Set<CanonicalMaintenanceRecord["status"]>(["Scheduled", "In Progress", "Completed"]);

function number(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return undefined;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function mapRecord(value: unknown): CanonicalMaintenanceRecord | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const row = value as Record<string, unknown>;
  const id = text(row.id), equipmentId = text(row.equipment_id), maintenanceType = text(row.maintenance_type), scheduledDate = text(row.scheduled_date), technician = text(row.technician), remarks = typeof row.remarks === "string" ? row.remarks : "", status = text(row.status);
  const scheduledReading = number(row.scheduled_reading), currentReading = number(row.current_reading);
  if (!id || !equipmentId || !maintenanceType || !scheduledDate || !technician || !status || !statuses.has(status as CanonicalMaintenanceRecord["status"]) || scheduledReading === undefined || currentReading === undefined) return undefined;
  return { id, equipmentId, maintenanceType, scheduledReading, currentReading, scheduledDate, technician, remarks, status: status as CanonicalMaintenanceRecord["status"], ...(text(row.completed_date) ? { completedDate: text(row.completed_date) } : {}), ...(text(row.created_at) ? { createdAt: text(row.created_at) } : {}), ...(text(row.updated_at) ? { updatedAt: text(row.updated_at) } : {}) };
}

export class SupabaseEquipmentMaintenanceSnapshotRepository implements EquipmentMaintenanceSnapshotRepository {
  constructor(private readonly client: RpcClient) {}

  async getEquipmentMaintenanceSnapshot(equipmentId: string): Promise<RepositoryResult<EquipmentMaintenanceSnapshot>> {
    const { data, error } = await this.client.schema("erp").rpc("get_equipment_maintenance_snapshot", { target_equipment_id: equipmentId });
    if (error || !data || typeof data !== "object" || Array.isArray(data)) return repositoryFailure("REMOTE_READ_FAILED", "Maintenance details could not be loaded.", { context: { repository: "EquipmentMaintenanceSnapshot" }, recoverability: "RETRYABLE", recommendedAction: "Retry the request." });
    const snapshot = data as Record<string, unknown>;
    const openRecords = Array.isArray(snapshot.open_records) ? snapshot.open_records.map(mapRecord).filter((record): record is CanonicalMaintenanceRecord => Boolean(record)) : undefined;
    const latestCompleted = mapRecord(snapshot.latest_completed);
    if (!openRecords || (snapshot.latest_completed !== null && snapshot.latest_completed !== undefined && !latestCompleted)) return repositoryFailure("REMOTE_ROW_MALFORMED", "Maintenance details could not be read safely.", { context: { repository: "EquipmentMaintenanceSnapshot" }, recoverability: "MANUAL_RECONCILIATION", recommendedAction: "Repair the canonical Maintenance read projection." });
    return repositorySuccess({ openRecords, ...(latestCompleted ? { latestCompleted } : {}) });
  }
}
