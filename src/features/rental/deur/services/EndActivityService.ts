import { deurRepository } from "../repository/deurRepository";
import type { DeurRecord } from "../types";

export class EndActivityService {
  static execute(rentalId: string, deurId?: string): DeurRecord | undefined {
    const today = new Date().toISOString().split("T")[0];
    const record = deurId
      ? deurRepository.getById(deurId)
      : deurRepository.getByRentalId(rentalId).find((item) => item.workDate === today);
    if (!record) return undefined;

    const openIndex = record.logs.findLastIndex((log) => !log.endTime);
    if (openIndex < 0) return record;

    const timestamp = new Date().toISOString();
    const elapsed = Date.parse(timestamp) - Date.parse(record.logs[openIndex].startTime);
    const logs = record.logs.map((log, index) => index === openIndex
      ? {
          ...log,
          endTime: timestamp,
          durationMinutes: Number.isFinite(elapsed) && elapsed >= 0
            ? Math.round(elapsed / 60000)
            : log.durationMinutes,
        }
      : { ...log });
    const minutes = Number.isFinite(elapsed) && elapsed >= 0
      ? Math.round(elapsed / 60000)
      : record.logs[openIndex].durationMinutes;
    const updated: DeurRecord = {
      ...record,
      logs,
      updatedAt: timestamp,
    };

    switch (record.logs[openIndex].activity) {
      case "Operation": updated.totalOperatingMinutes += minutes; break;
      case "Idle": updated.totalIdleMinutes += minutes; break;
      case "Meal Break": updated.totalMealBreakMinutes += minutes; break;
      case "Corrective Maintenance":
      case "Preventive Maintenance": updated.totalMaintenanceMinutes += minutes; break;
      case "Demobilization": updated.totalDemobilizationMinutes += minutes; break;
    }
    deurRepository.update(updated);
    return updated;
  }
}
