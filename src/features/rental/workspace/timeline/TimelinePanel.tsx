import {
    useTimeline,
  } from "./useTimeline";
  
import TimelineCard from "./TimelineCard";
import { useRentalWorkspaceAggregate } from "..";
import { rentalAuditRepository } from "@/features/rental/audit/rentalAuditRepository";
  
  export default function TimelinePanel() {
    const aggregate = useRentalWorkspaceAggregate();
    const events =
      useTimeline();
  
    return (
      <div className="space-y-4"><TimelineCard events={events} /><section className="rounded-lg border bg-white p-6"><h3 className="mb-4 text-lg font-semibold">Rental Audit Trail</h3><div className="space-y-2">{rentalAuditRepository.getByRentalId(aggregate.rental.id).map((event) => <p key={event.id} className="rounded border p-3 text-sm"><strong>{event.action}</strong> · {event.actorName ?? "System"} ({event.actorRole ?? "Not recorded"}) · {event.timestamp}{event.remarks ? ` — ${event.remarks}` : ""}</p>)}</div></section></div>
    );
  }
