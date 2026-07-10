import type {
    TimelineEvent,
  } from "./types";
  
  import TimelineItem from "./TimelineItem";
  
  interface Props {
    events: TimelineEvent[];
  }
  
  export default function TimelineCard({
    events,
  }: Props) {
    return (
      <div className="rounded-lg border bg-white p-6">
  
        <h3 className="mb-6 text-lg font-semibold">
          Rental Timeline
        </h3>
  
        <div>
  
          {events.map((event) => (
            <TimelineItem
              key={event.id}
              event={event}
            />
          ))}
  
        </div>
  
      </div>
    );
  }