import type { RentalAggregate } from "@/features/rental/aggregate";
import type { TimelineEvent } from "./types";

/** Builds the workspace timeline from persisted rental transactions only. */
export function buildTimeline(aggregate: RentalAggregate): TimelineEvent[] {
  const rental = aggregate.rental;
  const events: TimelineEvent[] = [];
  const addRecordedEvent = (id: string, title: string, date: string | undefined) => {
    if (!date?.trim() || !Number.isFinite(Date.parse(date))) return;
    events.push({
      id,
      type: "rental",
      title,
      description: `${rental.customer} • ${rental.project}`,
      date,
      completed: true,
    });
  };

  addRecordedEvent("rental-created", "Rental Created", rental.createdAt);
  addRecordedEvent("rental-reserved", "Reserved", rental.reservedAt);
  for (const approvalEvent of rental.approvalHistory ?? []) {
    events.push({ id: `approval-${approvalEvent.id}`, type: "rental", title: approvalEvent.action === "Submitted" ? "Sent for Approval" : approvalEvent.action, description: [approvalEvent.actor?.name, approvalEvent.remarks].filter(Boolean).join(" — ") || `${rental.customer} • ${rental.project}`, date: approvalEvent.timestamp, completed: true });
  }
  addRecordedEvent("rental-released", "Released", rental.releasedAt);
  addRecordedEvent("rental-activated", "Activated", rental.activatedAt);
  addRecordedEvent("rental-returned", "Returned", rental.returnedAt ?? rental.actualReturn);
  addRecordedEvent("rental-closed", "Closed", rental.closedAt);
  addRecordedEvent("rental-cancelled", "Cancelled", rental.cancelledAt);

  return events.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}
