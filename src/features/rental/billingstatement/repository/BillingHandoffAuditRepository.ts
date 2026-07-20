import { storage } from "@/core/storage";

const STORAGE_KEY = "equipment-rental-billing-handoff-audit";
export interface BillingHandoffAuditEvent { type: string; rentalId: string; deurId: string; statementId?: string; timestamp: string }
export const billingHandoffAuditRepository = {
  getAll(): BillingHandoffAuditEvent[] { const value = storage.get<unknown>(STORAGE_KEY); return Array.isArray(value) ? value as BillingHandoffAuditEvent[] : []; },
  record(event: Omit<BillingHandoffAuditEvent, "timestamp">) {
    storage.set(STORAGE_KEY, [...this.getAll(), { ...event, timestamp: new Date().toISOString() }]);
  },
};
