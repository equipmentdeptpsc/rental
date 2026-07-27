import type { RepositoryDescriptor } from "./contracts";

const crud = ["CRUD", "PAGING", "MIGRATION", "OPTIMISTIC_CONCURRENCY", "TRANSACTION_PREPARATION"] as const;
export const repositoryCatalog: readonly RepositoryDescriptor[] = [
  { name: "Equipment", storageKey: "equipment-records", schemaVersion: 1, capabilities: [...crud, "SOFT_DELETE"] },
  { name: "EquipmentHistory", storageKey: "equipment-history-records", schemaVersion: 1, capabilities: ["PAGING", "MIGRATION"] },
  { name: "Assignment", storageKey: "assignments", schemaVersion: 1, capabilities: [...crud] },
  { name: "Rental", storageKey: "equipment-rental-records", schemaVersion: 1, capabilities: [...crud] },
  { name: "RentalAudit", storageKey: "equipment-rental-audit-events", schemaVersion: 1, capabilities: ["PAGING", "MIGRATION"] },
  { name: "DevelopmentApprovalEmailOutbox", storageKey: "equipment-rental-development-approval-email-outbox", schemaVersion: 1, capabilities: ["PAGING", "MIGRATION"] },
  { name: "DevelopmentCustomerReviewOutbox", storageKey: "equipment-rental-development-customer-review-outbox", schemaVersion: 1, capabilities: ["PAGING", "MIGRATION"] },
  { name: "ManagerApproverConfiguration", storageKey: "equipment-rental-manager-approver-configuration", schemaVersion: 1, capabilities: ["CRUD", "MIGRATION"] },
  { name: "RentalEquipmentLine", storageKey: "equipment-rental-equipment-lines", schemaVersion: 1, capabilities: [...crud, "MIGRATION"] },
  { name: "RentalContract", storageKey: "equipment-rental-contracts", schemaVersion: 1, capabilities: [...crud, "MIGRATION"] },
  { name: "DEUR", storageKey: "equipment-rental-deur", schemaVersion: 1, capabilities: [...crud, "BACKGROUND_SYNC"] },
  { name: "DEURShiftWindow", storageKey: "equipment-rental-deur-shift-windows", schemaVersion: 1, capabilities: [...crud, "MIGRATION"] },
  { name: "BillingStatement", storageKey: "equipment-rental-billing-statements", schemaVersion: 1, capabilities: [...crud] },
  { name: "Collection", storageKey: "equipment-rental-collections", schemaVersion: 1, capabilities: [...crud] },
  { name: "LegacyBilling", storageKey: "equipment-rental-billing", schemaVersion: 1, capabilities: [...crud] },
  { name: "BillingHandoffAudit", storageKey: "equipment-rental-billing-handoff-audit", schemaVersion: 1, capabilities: ["PAGING", "MIGRATION"] },
  { name: "Customer", storageKey: "customer_records", schemaVersion: 1, capabilities: [...crud] },
  { name: "Project", storageKey: "projects", schemaVersion: 1, capabilities: [...crud] },
  { name: "Operator", storageKey: "operators", schemaVersion: 1, capabilities: [...crud] },
  { name: "OperatorUserLink", storageKey: "equipment-rental-operator-user-links", schemaVersion: 1, capabilities: ["CRUD", "MIGRATION"] },
  { name: "Maintenance", storageKey: "maintenance_records", schemaVersion: 1, capabilities: [...crud] },
  { name: "DailyLog", storageKey: "equipment-daily-logs", schemaVersion: 1, capabilities: [...crud] },
  { name: "ActivityCode", storageKey: "equipment-rental-activity-codes", schemaVersion: 1, capabilities: [...crud, "MIGRATION"] },
  { name: "CostCode", storageKey: "equipment-rental-cost-codes", schemaVersion: 1, capabilities: [...crud, "MIGRATION"] },
  { name: "WorkDescription", storageKey: "equipment-rental-work-descriptions", schemaVersion: 1, capabilities: [...crud, "MIGRATION"] },
  { name: "EquipmentPrefix", storageKey: "equipment-prefixes", schemaVersion: 1, capabilities: [...crud] },
  ...["Type", "Model", "Brand", "Category", "Condition", "Location", "Ownership", "Status"].map((name) => ({ name: `Equipment${name}`, storageKey: `equipment-${name.toLowerCase()}${name === "Status" ? "-master" : name === "Type" ? "s" : name === "Model" ? "s" : name === "Brand" ? "-master" : name === "Category" ? "-master" : name === "Condition" ? "-master" : name === "Location" ? "-master" : "-master"}`, schemaVersion: 1, capabilities: [...crud] } as RepositoryDescriptor)),
  { name: "RentalStatus", storageKey: "rental-status-master", schemaVersion: 1, capabilities: [...crud] },
] as const;

export function getRepositoryDescriptor(name: string) { return repositoryCatalog.find((descriptor) => descriptor.name === name); }
