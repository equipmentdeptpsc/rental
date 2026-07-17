import { deurRepository } from "../repository/deurRepository";
import type { DeurActivityType, DeurRecord } from "../types";

export interface StartActivityRequest {
  rentalId: string;
  equipmentId: string;
  operatorId: string;
  deurId?: string;
  activity: DeurActivityType;
}

export class StartActivityService {
  static execute(request: StartActivityRequest): DeurRecord {
    const now = new Date();
    const today = now.toISOString().split("T")[0];
    const timestamp = now.toISOString();
    const existing = request.deurId
      ? deurRepository.getById(request.deurId)
      : deurRepository.getByRentalId(request.rentalId).find((record) => record.workDate === today);

    if (existing) {
      const logs = existing.logs.map((log) => ({ ...log }));
      const openIndex = logs.findLastIndex((log) => !log.endTime);

      if (openIndex >= 0 && logs[openIndex].activity === request.activity) {
        return existing;
      }

      if (openIndex >= 0) {
        const open = logs[openIndex];
        const elapsed = Date.parse(timestamp) - Date.parse(open.startTime);
        logs[openIndex] = {
          ...open,
          endTime: timestamp,
          durationMinutes: Number.isFinite(elapsed) && elapsed >= 0
            ? Math.round(elapsed / 60000)
            : open.durationMinutes,
        };
      }

      const updated = {
        ...existing,
        logs: [...logs, {
          id: crypto.randomUUID(),
          activity: request.activity,
          startTime: timestamp,
          durationMinutes: 0,
        }],
        updatedAt: timestamp,
      };
      deurRepository.update(updated);
      return updated;
    }

    const record: DeurRecord = {
      id: crypto.randomUUID(),
      rentalId: request.rentalId,
      equipmentId: request.equipmentId,
      operatorId: request.operatorId,
      workDate: today,
      logs: [{ id: crypto.randomUUID(), activity: request.activity, startTime: timestamp, durationMinutes: 0 }],
      totalOperatingMinutes: 0,
      totalIdleMinutes: 0,
      totalMaintenanceMinutes: 0,
      totalMealBreakMinutes: 0,
      totalMobilizationMinutes: 0,
      totalDemobilizationMinutes: 0,
      status: "Draft",
      billingLocked: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    deurRepository.create(record);
    return record;
  }
}
