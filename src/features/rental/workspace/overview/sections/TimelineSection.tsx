import TimelineCard from "../cards/TimelineCard";

import type {
  TimelineEvent,
} from "../types";

interface Props {
  timeline: TimelineEvent[];
}

export default function TimelineSection({
  timeline,
}: Props) {
  return (
    <TimelineCard
      timeline={timeline}
    />
  );
}