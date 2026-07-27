import { deurRepository } from "../repository/deurRepository";
import type { CanonicalDeurEvent } from "../types";
import type { User } from "@/features/auth/domain/user";
import { assertMutationPermission } from "@/features/auth/services/assertMutationPermission";

function manualEvents(workDate: string, operatingMinutes: number, idleMinutes: number): CanonicalDeurEvent[] {
  const start = Date.parse(`${workDate}T00:00:00.000Z`);
  let sequence = 0;
  const events: CanonicalDeurEvent[] = [];
  const add = (activityType: CanonicalDeurEvent["activityType"], action: "start" | "end", offset: number) =>
    events.push({ id: crypto.randomUUID(), activityType, action, timestamp: new Date(start + offset * 60_000).toISOString(), sequence: ++sequence, source: "user" });
  add("shift", "start", 0);
  let offset = 0;
  if (operatingMinutes > 0) { add("operation", "start", offset); offset += operatingMinutes; add("operation", "end", offset); }
  if (idleMinutes > 0) { add("idle", "start", offset); offset += idleMinutes; add("idle", "end", offset); }
  add("shift", "end", offset);
  return events;
}

export function saveDeurHours(id: string, operatingHours: string, idleHours: string, workDate: string, complete = false, authenticatedUser?: User | null) {
  assertMutationPermission(authenticatedUser, complete ? "deur.review" : "deur.create");
  const record = deurRepository.getById(id);
  if (!record) return { success: false, message: "DEUR not found." };
  const operating = Number(operatingHours);
  const idle = Number(idleHours);
  if (!workDate || !/^\d{4}-\d{2}-\d{2}$/.test(workDate)) return { success: false, message: "Enter a valid entry date." };
  if (!operatingHours.trim() || !Number.isFinite(operating) || operating < 0) return { success: false, message: "Operating hours must be a non-negative number." };
  if (!idleHours.trim() || !Number.isFinite(idle) || idle < 0) return { success: false, message: "Idle hours must be a non-negative number." };
  if (operating + idle > 24) return { success: false, message: "Operating and idle hours cannot exceed 24 hours." };
  if (record.endOfDay || record.status === "Billed") return { success: false, message: "This DEUR is already completed and cannot be edited." };
  const operatingMinutes = Math.round(operating * 60);
  const idleMinutes = Math.round(idle * 60);
  const updated = {
    ...record,
    workDate,
    events: manualEvents(workDate, operatingMinutes, idleMinutes),
    totals: { shiftMinutes: operatingMinutes + idleMinutes, operationMinutes: operatingMinutes, idleMinutes, mealBreakMinutes: 0, breakdownMinutes: 0 },
    legacy: false,
    totalOperatingMinutes: operatingMinutes,
    totalIdleMinutes: idleMinutes,
    endOfDay: complete ? new Date().toISOString() : record.endOfDay,
    status: complete ? "In Progress" as const : record.status,
    updatedAt: new Date().toISOString(),
  };
  const persisted = deurRepository.update(updated);
  if (!persisted) return { success: false, message: "DEUR could not be saved." };
  if (complete) {
    const submitted = deurRepository.submit(persisted.id, { name: authenticatedUser?.displayName ?? "Rental Company" }, authenticatedUser);
    if (!submitted.success) return submitted;
    return { success: true, record: submitted.record };
  }
  return { success: true, record: persisted };
}
