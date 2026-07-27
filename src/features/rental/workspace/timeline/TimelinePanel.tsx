import { useTimeline } from "./useTimeline";
import TimelineCard from "./TimelineCard";

export default function TimelinePanel() {
  const events = useTimeline();
  return (
    <div className="space-y-4">
      <TimelineCard events={events} />
      <section className="rounded-lg border bg-white p-6">
        <h3 className="mb-4 text-lg font-semibold">Consolidated Audit Trail</h3>
        <div className="space-y-2">
          {events.map((event) => (
            <p key={`audit-${event.id}`} className="rounded border p-3 text-sm">
              <strong>{event.title}</strong> · {event.date}
              {event.description ? ` — ${event.description}` : ""}
            </p>
          ))}
        </div>
      </section>
    </div>
  );
}
