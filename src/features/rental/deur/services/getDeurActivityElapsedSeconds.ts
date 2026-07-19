import type { DeurActivityLog } from "../types";

const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Derives display-only elapsed time from persisted DEUR evidence.
 * Completed logs remain authoritative; running logs advance against the device clock.
 */
export function getDeurActivityElapsedSeconds(
  activity: DeurActivityLog,
  workDate: string,
  now = new Date(),
): number {
  if (activity.endTime) {
    return Math.max(0, Math.round(activity.durationMinutes * 60));
  }

  if (!DATE_PATTERN.test(workDate) || !TIME_PATTERN.test(activity.startTime)) {
    return 0;
  }

  const startedAt = new Date(`${workDate}T${activity.startTime}:00`);
  const elapsedMilliseconds = now.getTime() - startedAt.getTime();

  if (!Number.isFinite(startedAt.getTime()) || elapsedMilliseconds < 0) {
    return 0;
  }

  return Math.floor(elapsedMilliseconds / 1_000);
}

export function formatElapsedTime(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safeSeconds / 3_600);
  const minutes = Math.floor((safeSeconds % 3_600) / 60);
  const seconds = safeSeconds % 60;

  return [hours, minutes, seconds]
    .map((value) => value.toString().padStart(2, "0"))
    .join(":");
}
