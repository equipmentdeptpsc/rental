import type { RentalAggregate } from "@/features/rental/aggregate";
import type { WorkspaceTab } from "../types";
import { resolveRentalBillingBlockers } from "@/features/rental/billing/resolveRentalBillingBlockers";
import { developmentCustomerReviewOutbox } from "@/features/rental/customer-review/developmentCustomerReviewOutbox";
import type { EquipmentRecord } from "@/features/equipment/types";

export interface WorkspaceTabBadge {
  count: number;
  tone: "warning" | "danger" | "info";
}

export function buildWorkspaceTabBadges(
  aggregate: RentalAggregate,
  equipment: readonly EquipmentRecord[],
): Partial<Record<WorkspaceTab, WorkspaceTabBadge>> {
  const pendingDeurs = aggregate.deurs.filter(
    (record) =>
      !record.revision?.supersededByRevisionId &&
      ["Draft", "In Progress", "Submitted", "Pending Acknowledgement", "Rejected"].includes(record.status),
  );
  const deurBlockers = pendingDeurs.filter((record) => record.status !== "Acknowledged").length;
  const lineBlockers = resolveRentalBillingBlockers({
    lines: aggregate.rentalEquipmentLines,
    deurs: aggregate.deurs,
    equipment: [...equipment],
    pendingReviewDeurIds: new Set(
      developmentCustomerReviewOutbox
        .getAll()
        .filter((entry) => entry.status === "Pending")
        .map((entry) => entry.deurId),
    ),
  }).length;
  const collectionOutstanding = aggregate.billing.outstanding > 0 ? 1 : 0;
  const closingIssues =
    aggregate.rental.status === "Returned" && !aggregate.billing.invoicePreparationComplete ? 1 : 0;

  return {
    deur: deurBlockers ? { count: deurBlockers, tone: "warning" } : undefined,
    billing: lineBlockers ? { count: lineBlockers, tone: "danger" } : undefined,
    collections: collectionOutstanding ? { count: collectionOutstanding, tone: "info" } : undefined,
    closing: closingIssues ? { count: closingIssues, tone: "warning" } : undefined,
  };
}
