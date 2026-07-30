import { storage } from "@/core/storage";
import type { AuditLog } from "./AuditContext";

export const EQUIPMENT_AUDIT_STORAGE_KEY = "equipment-audit-logs";

export interface EquipmentAuditRepository {
  getAll(): AuditLog[];
  replace(records: readonly AuditLog[]): void;
}

const clone = <T,>(value: T): T => structuredClone(value);

export const equipmentAuditRepository: EquipmentAuditRepository = {
  getAll() {
    const records = storage.get<unknown>(EQUIPMENT_AUDIT_STORAGE_KEY);
    return Array.isArray(records) ? clone(records as AuditLog[]) : [];
  },
  replace(records) {
    storage.set(EQUIPMENT_AUDIT_STORAGE_KEY, clone(records));
  },
};
