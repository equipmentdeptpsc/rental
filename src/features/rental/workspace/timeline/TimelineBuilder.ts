import type { RentalAggregate } from "@/features/rental/aggregate";

import type { TimelineEvent } from "./types";

export function buildTimeline(
  aggregate: RentalAggregate
): TimelineEvent[] {
  const events: TimelineEvent[] = [];

  events.push({
    id: "rental",

    type: "rental",

    title: "Rental Created",

    description:
      `${aggregate.rental.customer} • ${aggregate.rental.project}`,

    date: aggregate.rental.dateOut,

    completed: true,
  });

  if (aggregate.assignment) {
    events.push({
      id: "assignment",

      type: "assignment",

      title: "Equipment Assigned",

      description:
        aggregate.equipment?.equipmentName ??
        "Equipment assigned",

      date:
        aggregate.assignment.assignedDate,

      completed: true,
    });
  }

  if (aggregate.operator) {
    events.push({
      id: "operator",

      type: "operator",

      title: "Operator Assigned",

      description:
        aggregate.operator.name,

      date:
        aggregate.assignment?.assignedDate ??
        "",

      completed: true,
    });
  }

  events.push({
    id: "return",

    type: "return",

    title: "Expected Return",

    description:
      "Scheduled completion",

    date:
      aggregate.rental.expectedReturn,

    completed:
      aggregate.rental.status ===
      "Returned",
  });

  return events.sort(
    (a, b) =>
      new Date(a.date).getTime() -
      new Date(b.date).getTime()
  );
}