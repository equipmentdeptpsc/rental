import type {
    RentalEvent,
  } from "../types";
  
  import type {
    TimelineItem,
  } from "./timeline.types";
  
  export function buildTimelineProjection(
    events: RentalEvent[]
  ): TimelineItem[] {
    return [...events]
      .sort(
        (a, b) =>
          new Date(
            b.timestamp
          ).getTime() -
          new Date(
            a.timestamp
          ).getTime()
      )
      .map(
        (
          event
        ): TimelineItem => ({
          id: event.id,
  
          timestamp:
            event.timestamp,
  
          title:
            event.title,
  
          description:
            event.description,
  
          type:
            event.type,
  
          source:
            event.source,
  
          status:
            "Completed",
  
          metadata:
            event.metadata,
        })
      );
  }