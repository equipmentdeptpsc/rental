import type { RentalAggregate } from "@/features/rental/aggregate";

import type { TimelineEvent } from "./types";

export function buildTimeline(
  aggregate: RentalAggregate
): TimelineEvent[] {
  const events: TimelineEvent[] = [];

  //
  // Rental Created
  //
  events.push({
    id: "rental",

    type: "rental",

    title: "Rental Created",

    description:
      `${aggregate.rental.customer} • ${aggregate.rental.project}`,

    date: aggregate.rental.dateOut,

    completed: true,
  });

  //
  // Equipment Assignment
  //
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

  //
  // Operator Assignment
  //
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

  //
  // DEUR History
  //
  for (const deur of aggregate.deurs) {
    for (const log of deur.logs) {
      events.push({
        id: log.id,

        type: "deur",

        title: log.activity,

        description:
          log.remarks ??
          "Daily Equipment Utilization Record",

        date: log.startTime,

        completed: Boolean(log.endTime),
      });
    }
  }

  //
  // Expected Return
  //
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