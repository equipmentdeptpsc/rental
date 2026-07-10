import {
    useTimeline,
  } from "./useTimeline";
  
  import TimelineCard from "./TimelineCard";
  
  export default function TimelinePanel() {
    const events =
      useTimeline();
  
    return (
      <TimelineCard
        events={events}
      />
    );
  }