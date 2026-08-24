import type { SupabaseClient } from "@supabase/supabase-js";
import type { User } from "@/features/auth/domain/user";
import type { EquipmentRecord } from "@/features/equipment/types";
import type { RentalRecord } from "@/features/rental/types";
import type { AssignmentRecord } from "@/features/assignment/types";
import type { Operator } from "@/features/operators/types";
import type { CustomerRecord } from "@/features/customer/types";
import type { ProjectRecord } from "@/features/project/types";
import type { BillingStatement } from "@/features/rental/billingstatement/types";
import type { DeurRecord } from "@/features/rental/deur/types";
import type { RentalEquipmentLine } from "@/features/rental/equipment-line/types";
import type { WorkDescriptionRecord } from "@/features/masters/work-description/types";
import type { RemoteCore } from "@/core/remote";
import { repositoryFailure, repositorySuccess, type RepositoryResult } from "@/core/persistence";
import { SupabaseReadRepository, mapCanonicalRow } from "./SupabaseReadRepository";

export function createSupabaseReadRepositories(client: SupabaseClient, core: RemoteCore) {
  return {
    users: new SupabaseReadRepository<User>(client, { repositoryName: "User", table: "users", columns: "id,username,display_name,email,company_id,status,operator_id,created_at,updated_at,user_roles(app_roles(code))", searchColumns: ["username", "display_name", "email"], mapRow: mapUser }, core),
    equipment: new SupabaseReadRepository<EquipmentRecord>(client, { repositoryName: "Equipment", table: "equipment", searchColumns: ["asset_no", "equipment_name", "serial_number"] }, core),
    rentals: new SupabaseReadRepository<RentalRecord>(client, { repositoryName: "Rental", table: "rentals", searchColumns: ["rental_number", "customer_snapshot", "project_snapshot"], mapRow: mapRental }, core),
    assignments: new SupabaseReadRepository<AssignmentRecord>(client, { repositoryName: "Assignment", table: "assignments", searchColumns: ["remarks"], mapRow: mapAssignment }, core),
    operators: new SupabaseReadRepository<Operator>(client, { repositoryName: "Operator", table: "operators", searchColumns: ["name", "email", "license_number"] }, core),
    customers: new SupabaseReadRepository<CustomerRecord>(client, { repositoryName: "Customer", table: "customers", searchColumns: ["customer_code", "name", "email", "phone"], mapRow: mapCustomer }, core),
    projects: new SupabaseReadRepository<ProjectRecord>(client, { repositoryName: "Project", table: "projects", searchColumns: ["project_code", "name", "location"], mapRow: mapProject }, core),
    billing: new SupabaseReadRepository<BillingStatement>(client, { repositoryName: "BillingStatement", table: "billing_statements", searchColumns: ["statement_no", "invoice_number", "customer_snapshot", "project_snapshot"] }, core),
    deurs: new SupabaseReadRepository<DeurRecord>(client, { repositoryName: "DEUR", table: "deurs", searchColumns: ["deur_number", "operational_remarks"] }, core),
    rentalEquipmentLines: new SupabaseReadRepository<RentalEquipmentLine>(client, { repositoryName: "RentalEquipmentLine", table: "rental_equipment_lines" }, core),
    workDescriptions: new SupabaseReadRepository<WorkDescriptionRecord>(client, { repositoryName: "WorkDescription", table: "work_descriptions", searchColumns: ["code", "name"] }, core),
  };
}
export function mapCustomer(row: Record<string, unknown>): RepositoryResult<CustomerRecord> {
  const base = mapCanonicalRow<Record<string, unknown>>(row);
  if (!base.success) return base;
  const value = base.value;
  if (typeof value.customerCode !== "string" || typeof value.name !== "string" || typeof value.active !== "boolean") return repositoryFailure("REMOTE_ROW_MALFORMED", "Remote Customer requires code, name, and active state.", { context: { repository: "Customer" }, recoverability: "MANUAL_RECONCILIATION", recommendedAction: "Repair the canonical Customer row." });
  const optional = (item: unknown) => typeof item === "string" && item ? item : undefined;
  return repositorySuccess({ id: String(value.id), customerCode: value.customerCode, companyName: value.name, contactNumber: optional(value.phone), email: optional(value.email), address: optional(value.address), active: value.active } as CustomerRecord);
}
export function mapProject(row: Record<string, unknown>): RepositoryResult<ProjectRecord> {
  const base = mapCanonicalRow<Record<string, unknown>>(row);
  if (!base.success) return base;
  const value = base.value;
  if (typeof value.id !== "string" || typeof value.projectCode !== "string" || typeof value.name !== "string" || typeof value.active !== "boolean") return repositoryFailure("REMOTE_ROW_MALFORMED", "Remote Project requires id, code, name, and active state.", { context: { repository: "Project" }, recoverability: "MANUAL_RECONCILIATION", recommendedAction: "Repair the canonical Project row." });
  return repositorySuccess({ id: value.id, projectCode: value.projectCode, projectName: value.name, customerId: typeof value.customerId === "string" ? value.customerId : undefined, location: typeof value.location === "string" ? value.location : "", projectManager: "", status: value.active ? "Active" : "Completed", deleted: value.deletedAt !== null && value.deletedAt !== undefined } as ProjectRecord);
}
function mapAssignment(row: Record<string, unknown>): RepositoryResult<AssignmentRecord> {
  const base = mapCanonicalRow<Record<string, unknown>>(row);
  if (!base.success) return base;
  const { expectedReturn, ...assignment } = base.value;
  return repositorySuccess({
    ...assignment,
    ...(typeof expectedReturn === "string" && expectedReturn ? { expectedReturn } : {}),
  } as unknown as AssignmentRecord);
}
function mapRental(row: Record<string, unknown>): RepositoryResult<RentalRecord> {
  const base = mapCanonicalRow<Record<string, unknown>>(row);
  if (!base.success) return base;
  return repositorySuccess({
    ...base.value,
    customer: base.value.customer ?? base.value.customerSnapshot ?? "",
    project: base.value.project ?? base.value.projectSnapshot ?? "",
  } as unknown as RentalRecord);
}
function mapUser(row: Record<string, unknown>): RepositoryResult<User> {
  const base = mapCanonicalRow<Record<string, unknown>>(row); if (!base.success) return base;
  if (typeof base.value.username !== "string" || typeof base.value.displayName !== "string") return repositoryFailure("REMOTE_ROW_MALFORMED", "Remote User requires username and display name.", { context: { repository: "User" }, recoverability: "MANUAL_RECONCILIATION", recommendedAction: "Repair the remote User profile." });
  const roleRows = Array.isArray(row.user_roles) ? row.user_roles : [];
  const systemRoles = roleRows.flatMap((entry) => { const role = entry && typeof entry === "object" ? (entry as Record<string, unknown>).app_roles : undefined; const code = role && typeof role === "object" ? (role as Record<string, unknown>).code : undefined; return typeof code === "string" ? [code] : []; });
  return repositorySuccess({ ...base.value, systemRoles } as unknown as User);
}
