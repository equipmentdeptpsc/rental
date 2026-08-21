import { storage } from "@/core/storage";
import type { MigrationCompletion, MigrationPlan } from "../types";

const AUDIT_KEY = "equipment-rental.data-migration-audit.v1";
export interface MigrationAuditRecord { timestamp:string; actorId?:string; filename:string; validation:MigrationPlan["counts"]; outcome:MigrationCompletion["outcome"]; entities:MigrationCompletion["entities"] }
export const migrationAuditRepository={
  getAll():MigrationAuditRecord[]{const value=storage.get<unknown>(AUDIT_KEY);return Array.isArray(value)?structuredClone(value as MigrationAuditRecord[]):[]},
  create(record:MigrationAuditRecord){storage.set(AUDIT_KEY,[...this.getAll(),structuredClone(record)])},
};
