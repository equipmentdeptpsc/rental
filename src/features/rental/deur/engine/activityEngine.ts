import type {
  DeurActivityLog,
  DeurActivityType,
} from "../types";

function nowTime(): string {
  return new Date()
    .toTimeString()
    .slice(0, 5);
}

function minutesBetween(
  start: string,
  end: string
): number {
  const [sh, sm] =
    start.split(":").map(Number);

  const [eh, em] =
    end.split(":").map(Number);

  return (
    eh * 60 +
    em -
    (sh * 60 + sm)
  );
}

export function closeCurrentActivity(
  logs: DeurActivityLog[]
): DeurActivityLog[] {
  if (logs.length === 0) {
    return logs;
  }

  const updated = [...logs];

  const current =
    updated[updated.length - 1];

  if (current.endTime) {
    return updated;
  }

  const end = nowTime();

  current.endTime = end;

  current.durationMinutes =
    minutesBetween(
      current.startTime,
      end
    );

  return updated;
}

export function startActivity(
  logs: DeurActivityLog[],
  activity: DeurActivityType
): DeurActivityLog[] {
  const updated =
    closeCurrentActivity(logs);

  updated.push({
    id: crypto.randomUUID(),

    activity,

    startTime: nowTime(),

    durationMinutes: 0,
  });

  return updated;
}