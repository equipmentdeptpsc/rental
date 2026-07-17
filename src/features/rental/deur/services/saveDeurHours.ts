import { deurRepository } from "../repository/deurRepository";

export function saveDeurHours(id: string, operatingHours: string, idleHours: string, workDate: string, complete = false) {
  const record = deurRepository.getById(id);
  if (!record) return { success: false, message: "DEUR not found." };
  const operating = Number(operatingHours);
  const idle = Number(idleHours);
  if (!workDate || !/^\d{4}-\d{2}-\d{2}$/.test(workDate)) return { success: false, message: "Enter a valid entry date." };
  if (!operatingHours.trim() || !Number.isFinite(operating) || operating < 0) return { success: false, message: "Operating hours must be a non-negative number." };
  if (!idleHours.trim() || !Number.isFinite(idle) || idle < 0) return { success: false, message: "Idle hours must be a non-negative number." };
  if (operating + idle > 24) return { success: false, message: "Operating and idle hours cannot exceed 24 hours." };
  if (record.endOfDay || record.status === "Billed") return { success: false, message: "This DEUR is already completed and cannot be edited." };
  const updated = {
    ...record,
    workDate,
    totalOperatingMinutes: Math.round(operating * 60),
    totalIdleMinutes: Math.round(idle * 60),
    endOfDay: complete ? new Date().toISOString() : record.endOfDay,
    status: complete ? "Pending Acknowledgement" as const : record.status,
    updatedAt: new Date().toISOString(),
  };
  const persisted = deurRepository.update(updated);
  if (!persisted) return { success: false, message: "DEUR could not be saved." };
  return { success: true, record: persisted };
}
