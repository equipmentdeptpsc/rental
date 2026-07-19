import { storage } from "@/core/storage";
import type { DeurSyncOperationIdentifier } from "../types";

const KEY = "equipment-rental-deur-applied-operations";

export class DeurAppliedOperationRepository {
  private getAll(): DeurSyncOperationIdentifier[] {
    try {
      const value = storage.get<unknown>(KEY);
      return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
    } catch {
      return [];
    }
  }

  has(operationId: DeurSyncOperationIdentifier): boolean {
    return this.getAll().includes(operationId);
  }

  add(operationId: DeurSyncOperationIdentifier): void {
    const operations = this.getAll();
    if (!operations.includes(operationId)) storage.set(KEY, [...operations, operationId]);
  }
}
