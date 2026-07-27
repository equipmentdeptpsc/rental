import type { RentalAggregate } from "@/features/rental/aggregate";
import type { CustomerReviewOutboxEntry } from "@/features/rental/customer-review/developmentCustomerReviewOutbox";
import type { BillingStatement } from "@/features/rental/billingstatement/types";
import type { CollectionTransaction } from "@/features/rental/collections/types";
import { formatPhpCurrency } from "@/features/rental/presentation/formatBusinessValues";
import type { TimelineEvent } from "./types";

export interface TimelineEvidence {
  customerReviews?: CustomerReviewOutboxEntry[];
  billingStatements?: BillingStatement[];
  collections?: CollectionTransaction[];
}

/** Builds a read-only business timeline from existing durable records. */
export function buildTimeline(aggregate: RentalAggregate, evidence: TimelineEvidence = {}): TimelineEvent[] {
  const rental = aggregate.rental;
  const events: TimelineEvent[] = [];
  const add = (id: string, type: TimelineEvent["type"], title: string, date: string | undefined, description: string) => {
    if (!date?.trim() || !Number.isFinite(Date.parse(date))) return;
    events.push({ id, type, title, description, date, completed: true });
  };
  const rentalDescription = `${rental.customer} • ${rental.project}`;

  add("rental-created", "rental", "Rental Created", rental.createdAt, rentalDescription);
  add("rental-reserved", "rental", "Reserved", rental.reservedAt, rentalDescription);
  for (const approvalEvent of rental.approvalHistory ?? []) {
    add(`approval-${approvalEvent.id}`, "rental", approvalEvent.action === "Submitted" ? "Sent for Approval" : approvalEvent.action, approvalEvent.timestamp, [approvalEvent.actor?.name, approvalEvent.remarks].filter(Boolean).join(" — ") || rentalDescription);
  }
  add("rental-released", "rental", "Released", rental.releasedAt, rentalDescription);
  add("rental-activated", "rental", "Activated", rental.activatedAt, rentalDescription);

  for (const deur of aggregate.deurs) {
    const reference = deur.deurNumber?.trim() ? `${deur.deurNumber} R${deur.revision?.revisionNumber ?? 1}` : "DEUR number unavailable";
    const addDeur = (suffix: string, title: string, date: string | undefined, description: string) =>
      add(`deur-${deur.id}-${suffix}`, "deur", title, date, `${reference} — ${description}`);
    addDeur("created", deur.revision?.previousRevisionId ? "Correction Revision Created" : "DEUR Created", deur.revision?.correctedAt ?? deur.createdAt, deur.revision?.correctedByName ? `Recorded by ${deur.revision.correctedByName}` : "Operational record created");
    const activities = deur.events?.filter((event) => event.activityType !== "shift") ?? [];
    const latestActivity = activities.at(-1);
    if (latestActivity) addDeur("activity", "Activity Recorded", latestActivity.timestamp, `${Math.ceil(activities.length / 2)} activity interval(s) recorded`);
    const submissions = deur.reviewHistory?.filter((item) => item.action === "submitted") ?? [];
    if (submissions.length) submissions.forEach((item, index) => addDeur(`submitted-${index}`, deur.revision?.previousRevisionId ? "DEUR Resubmitted" : "DEUR Submitted", item.timestamp, `Submitted by ${item.actorName}`));
    else addDeur("submitted", deur.revision?.previousRevisionId ? "DEUR Resubmitted" : "DEUR Submitted", deur.submittedAt, deur.submittedBy ? `Submitted by ${deur.submittedBy}` : "Submitted for Customer review");
    for (const [index, item] of (deur.reviewHistory ?? []).entries()) {
      if (item.action === "acknowledged") addDeur(`acknowledged-${index}`, "Customer Acknowledged", item.timestamp, `Acknowledged by ${item.actorName}`);
      if (item.action === "rejected") addDeur(`rejected-${index}`, "Customer Requested Correction", item.timestamp, `${item.actorName}${item.reason ? ` — ${item.reason}` : ""}`);
    }
  }

  for (const review of evidence.customerReviews ?? []) {
    add(`review-${review.id}-generated`, "deur", "Customer Review Request Generated", review.generatedAt, `${review.deurNumber} R${review.revisionNumber} — Sent to ${review.representativeName}`);
    if (review.status === "Superseded") {
      const replacement = evidence.customerReviews?.find((item) => item.id === review.supersededById);
      add(`review-${review.id}-superseded`, "deur", "Customer Review Request Superseded", replacement?.generatedAt ?? review.generatedAt, `${review.deurNumber} R${review.revisionNumber} — Replaced by a newer request`);
    }
  }

  for (const statement of evidence.billingStatements ?? []) {
    add(`billing-${statement.id}-created`, "billing", "Billing Statement Created", statement.createdAt, `${statement.statementNo} — Billing generated from ${statement.lines.length} DEUR line(s)`);
    if (statement.invoiceStatus !== "Not Invoiced" && statement.invoiceStatus !== "Cancelled") {
      add(`invoice-${statement.id}`, "invoice", "Marked Invoiced", statement.invoiceStatusUpdatedAt ?? statement.createdAt, `${statement.invoiceNumber?.trim() || statement.statementNo}${statement.invoiceStatusUpdatedBy ? ` — By ${statement.invoiceStatusUpdatedBy}` : ""}`);
    }
  }

  const collections = [...(evidence.collections ?? [])].sort((left, right) => Date.parse(left.recordedAt) - Date.parse(right.recordedAt) || left.referenceNumber.localeCompare(right.referenceNumber));
  const collectedByStatement = new Map<string, number>();
  for (const transaction of collections) {
    const statement = evidence.billingStatements?.find((item) => item.id === transaction.statementId);
    const total = statement?.grandTotal ?? statement?.subtotal ?? Number.POSITIVE_INFINITY;
    const collected = (collectedByStatement.get(transaction.statementId) ?? 0) + transaction.amount;
    collectedByStatement.set(transaction.statementId, collected);
    const final = collected >= total;
    add(`collection-${transaction.id}`, "collection", final ? "Final Collection Recorded" : "Partial Collection Recorded", transaction.recordedAt, `${statement?.statementNo ?? "Billing Statement unavailable"} — ${formatPhpCurrency(transaction.amount)} — Reference ${transaction.referenceNumber}`);
    if (final) add(`collection-${transaction.id}-fully-collected`, "collection", "Invoice Fully Collected", transaction.recordedAt, `${statement?.statementNo ?? "Billing Statement unavailable"} — Balance settled`);
  }

  add("rental-returned", "return", "Returned", rental.returnedAt ?? rental.actualReturn, rentalDescription);
  add("rental-closed", "closing", "Closed", rental.closedAt, rentalDescription);
  add("rental-cancelled", "closing", "Cancelled", rental.cancelledAt, rentalDescription);

  return events.sort((left, right) => Date.parse(left.date) - Date.parse(right.date) || left.title.localeCompare(right.title));
}
