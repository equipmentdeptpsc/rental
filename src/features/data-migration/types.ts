import type { CustomerRecord } from "@/features/customer/types";
import type { EquipmentRecord } from "@/features/equipment/types";
import type { Operator } from "@/features/operators/types";
import type { ProjectRecord } from "@/features/project/types";

export const MIGRATION_SHEETS = ["README", "Equipment", "Operators", "Customers", "Projects"] as const;
export type MigrationEntitySheet = "Equipment" | "Operators" | "Customers" | "Projects";
export type MigrationSeverity = "Warning" | "Error";
export interface MigrationIssue { sheet: MigrationEntitySheet | "Workbook"; row: number; field: string; value: string; severity: MigrationSeverity; message: string; suggestion?: string }
export interface MigrationWorkbookRows { Equipment: Record<string, unknown>[]; Operators: Record<string, unknown>[]; Customers: Record<string, unknown>[]; Projects: Record<string, unknown>[] }
export interface MigrationPlan {
  fileName: string;
  validatedAt: string;
  issues: MigrationIssue[];
  records: { equipment: EquipmentRecord[]; operators: Operator[]; customers: CustomerRecord[]; projects: ProjectRecord[] };
  counts: { valid: number; warning: number; invalid: number };
  canImport: boolean;
}
export interface MigrationCompletion { imported: number; skipped: number; failed: number; rolledBack: number; entities: Record<MigrationEntitySheet, number>; outcome: "Completed" | "RolledBack" }

