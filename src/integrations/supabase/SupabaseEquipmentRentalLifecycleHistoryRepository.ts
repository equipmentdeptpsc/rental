import type { SupabaseClient } from "@supabase/supabase-js";

import { repositoryFailure, repositorySuccess, type RepositoryResult } from "@/core/persistence";
import type { EquipmentRentalLifecycleHistoryRepository, RentalLifecycleEvent, RentalLifecycleEventType } from "@/features/rental/history/canonical";

type RpcClient = Pick<SupabaseClient, "schema">;
const eventTypes = new Set<RentalLifecycleEventType>(["Reserved", "Released", "Activated", "Returned", "Closed", "Cancelled"]);
const defaultLimit = 10;
const maximumLimit = 20;

function boundedLimit(value: number | undefined): number {
  if (!Number.isFinite(value)) return defaultLimit;
  return Math.min(maximumLimit, Math.max(1, Math.trunc(value as number)));
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function mapEvent(value: unknown): RentalLifecycleEvent | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const row = value as Record<string, unknown>;
  const id = text(row.id);
  const rentalId = text(row.rental_id);
  const eventType = text(row.event_type);
  const occurredAt = text(row.occurred_at);
  if (!id || !rentalId || !eventType || !eventTypes.has(eventType as RentalLifecycleEventType) || !occurredAt) return undefined;
  return {
    id,
    rentalId,
    eventType: eventType as RentalLifecycleEventType,
    occurredAt,
    ...(text(row.rental_number) ? { rentalNumber: text(row.rental_number) } : {}),
    ...(text(row.customer_id) ? { customerId: text(row.customer_id) } : {}),
  };
}

export class SupabaseEquipmentRentalLifecycleHistoryRepository implements EquipmentRentalLifecycleHistoryRepository {
  constructor(private readonly client: RpcClient) {}

  async getEquipmentRentalLifecycleEvents(equipmentId: string, limit?: number): Promise<RepositoryResult<readonly RentalLifecycleEvent[]>> {
    const { data, error } = await this.client.schema("erp").rpc("get_equipment_rental_lifecycle_events", {
      target_equipment_id: equipmentId,
      requested_limit: boundedLimit(limit),
    });
    if (error || !Array.isArray(data)) return repositoryFailure("REMOTE_READ_FAILED", "Rental lifecycle history could not be loaded.", { context: { repository: "EquipmentRentalLifecycleHistory" }, recoverability: "RETRYABLE", recommendedAction: "Retry the request." });
    const events = data.map(mapEvent);
    if (events.some((event) => !event)) return repositoryFailure("REMOTE_ROW_MALFORMED", "Rental lifecycle history could not be read safely.", { context: { repository: "EquipmentRentalLifecycleHistory" }, recoverability: "MANUAL_RECONCILIATION", recommendedAction: "Repair the canonical Rental lifecycle read projection." });
    return repositorySuccess(events as RentalLifecycleEvent[]);
  }
}
