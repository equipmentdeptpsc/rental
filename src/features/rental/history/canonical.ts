import { repositorySuccess, type RepositoryResult } from "@/core/persistence";

export type RentalLifecycleEventType = "Reserved" | "Released" | "Activated" | "Returned" | "Closed" | "Cancelled";

export interface RentalLifecycleEvent {
  id: string;
  rentalId: string;
  rentalNumber?: string;
  eventType: RentalLifecycleEventType;
  occurredAt: string;
  customerId?: string;
}

export interface EquipmentRentalLifecycleHistoryRepository {
  getEquipmentRentalLifecycleEvents(equipmentId: string, limit?: number): Promise<RepositoryResult<readonly RentalLifecycleEvent[]>>;
}

export class LocalEquipmentRentalLifecycleHistoryRepository implements EquipmentRentalLifecycleHistoryRepository {
  async getEquipmentRentalLifecycleEvents(_equipmentId: string, _limit?: number): Promise<RepositoryResult<readonly RentalLifecycleEvent[]>> {
    return repositorySuccess([]);
  }
}
