import { storage } from "@/core/storage";
import type { Role } from "@/features/auth/role";
import type { RentalApprovalStatus, RentalLifecycleStatus } from "../types";

export const RENTAL_AUDIT_STORAGE_KEY = "equipment-rental-audit-events";
export interface RentalAuditEvent { id: string; rentalId: string; rentalNumber?: string; action: string; timestamp: string; actorId?: string; actorName?: string; actorRole?: Role; previousApprovalStatus: RentalApprovalStatus | "LegacyNotRecorded"; resultingApprovalStatus: RentalApprovalStatus | "LegacyNotRecorded"; previousRentalStatus: RentalLifecycleStatus; resultingRentalStatus: RentalLifecycleStatus; remarks?: string; }
const clone = <T>(value: T): T => structuredClone(value);
export const rentalAuditRepository = {
  getAll(): RentalAuditEvent[] { return clone(storage.get<RentalAuditEvent[]>(RENTAL_AUDIT_STORAGE_KEY) ?? []); },
  getByRentalId(rentalId: string): RentalAuditEvent[] { return this.getAll().filter((item) => item.rentalId === rentalId); },
  append(event: RentalAuditEvent): void { storage.set(RENTAL_AUDIT_STORAGE_KEY, [...this.getAll(), clone(event)]); },
};
