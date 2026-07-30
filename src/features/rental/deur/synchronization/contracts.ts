import type { DeurRecord } from "../types";

export interface ConcurrencyToken {
  version: number;
}

export interface DeurChangeEvent {
  eventId: string;
  eventType: "created" | "updated" | "submitted" | "reviewed" | "billing-locked" | "billing-unlocked";
  rentalId: string;
  rentalLineId: string;
  deurId: string;
  equipmentId: string;
  operatorId: string;
  version: number;
  occurredAt: string;
}

export interface RentalLineChangeEvent {
  eventId: string;
  eventType: "created" | "updated" | "activated" | "returned" | "finalized";
  rentalId: string;
  rentalLineId: string;
  equipmentId: string;
  operatorId: string;
  deurId?: string;
  version: number;
  occurredAt: string;
}

export type DeurCommandResult =
  | { success: true; record: DeurRecord; version: number }
  | { success: false; code: "NOT_FOUND" | "CONFLICT" | "REJECTED"; message: string; expectedVersion?: number; currentVersion?: number };

export interface RemoteDeurRepository {
  getById(id: string): Promise<{ record: DeurRecord; version: number } | undefined>;
  save(record: DeurRecord, concurrency: { expectedVersion: number }): Promise<DeurCommandResult>;
}

export interface RentalWorkspaceSubscription {
  subscribe(rentalId: string, listener: (event: DeurChangeEvent | RentalLineChangeEvent) => void): () => void;
}
