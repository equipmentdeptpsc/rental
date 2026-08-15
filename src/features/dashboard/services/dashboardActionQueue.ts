import type { DeurRecord } from "@/features/rental/deur/types";
import type { RentalRecord } from "@/features/rental/types";
import type { BillingStatement } from "@/features/rental/billingstatement/types";

export interface DashboardActionItem {
  id: string;
  title: string;
  description: string;
  href: string;
  tone: "warning" | "danger" | "info";
  count?: number;
}

export function buildDashboardActionQueue(input: {
  deurs: readonly DeurRecord[];
  rentals: readonly RentalRecord[];
  pendingManagerApprovals: number;
  pendingCustomerAcknowledgements: number;
  expectedReturns: number;
}): DashboardActionItem[] {
  const missingDeur = input.deurs.filter(
    (item) =>
      !item.revision?.supersededByRevisionId &&
      ["Draft", "In Progress"].includes(item.status),
  ).length;
  const rejectedDeur = input.deurs.filter(
    (item) => !item.revision?.supersededByRevisionId && item.status === "Rejected",
  ).length;
  const pendingReview = input.deurs.filter(
    (item) =>
      !item.revision?.supersededByRevisionId &&
      ["Submitted", "Pending Acknowledgement"].includes(item.status),
  ).length;

  const items: DashboardActionItem[] = [];
  if (missingDeur) {
    items.push({
      id: "deur-missing",
      title: "DEUR in progress",
      description: "Daily operational evidence still being recorded.",
      href: "/rentals?view=deur-exceptions",
      tone: "warning",
      count: missingDeur,
    });
  }
  if (rejectedDeur) {
    items.push({
      id: "deur-rejected",
      title: "DEUR corrections requested",
      description: "Customer or manager requested a correction.",
      href: "/rentals?view=deur-exceptions",
      tone: "danger",
      count: rejectedDeur,
    });
  }
  if (pendingReview) {
    items.push({
      id: "deur-review",
      title: "DEUR awaiting acknowledgement",
      description: "Submitted DEURs need customer or manager review.",
      href: "/rentals?view=deur-exceptions",
      tone: "info",
      count: pendingReview,
    });
  }
  if (input.pendingManagerApprovals) {
    items.push({
      id: "manager-approval",
      title: "Manager approvals pending",
      description: "Rentals waiting for release authorization.",
      href: "/rentals",
      tone: "warning",
      count: input.pendingManagerApprovals,
    });
  }
  if (input.pendingCustomerAcknowledgements) {
    items.push({
      id: "customer-ack",
      title: "Customer acknowledgements pending",
      description: "Review requests sent and awaiting response.",
      href: "/rentals?view=deur-exceptions",
      tone: "info",
      count: input.pendingCustomerAcknowledgements,
    });
  }
  if (input.expectedReturns) {
    items.push({
      id: "expected-returns",
      title: "Expected returns",
      description: "Equipment scheduled to return soon.",
      href: "/rentals",
      tone: "info",
      count: input.expectedReturns,
    });
  }
  return items;
}

export function countBillingBlockers(statements: readonly BillingStatement[]): number {
  return statements.filter((statement) =>
    ["Not Invoiced", "Partially Collected"].includes(statement.invoiceStatus),
  ).length;
}
