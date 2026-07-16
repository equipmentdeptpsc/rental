import { deurRepository } from "../repository/deurRepository";

import type { DeurRecord } from "../types";

export class EndActivityService {

  static execute(
    rentalId: string
  ): DeurRecord | undefined {

    const today =
      new Date()
        .toISOString()
        .split("T")[0];

    const record =
      deurRepository
        .getByRentalId(rentalId)
        .find(
          d => d.workDate === today
        );

    if (!record) {
      return;
    }

    const log =
      record.logs.at(-1);

    if (!log) {
      return record;
    }

    if (log.endTime) {
      return record;
    }

    const now =
      new Date();

    log.endTime =
      now.toISOString();

    const start =
      new Date(log.startTime);

    const minutes =
      Math.max(
        0,
        Math.round(
          (now.getTime() - start.getTime())
          / 60000
        )
      );

    log.durationMinutes =
      minutes;

    switch (log.activity) {

      case "Operation":

        record.totalOperatingMinutes +=
          minutes;

        break;

      case "Idle":

        record.totalIdleMinutes +=
          minutes;

        break;

      case "Meal Break":

        record.totalMealBreakMinutes +=
          minutes;

        break;

      case "Corrective Maintenance":

      case "Preventive Maintenance":

        record.totalMaintenanceMinutes +=
          minutes;

        break;

      case "Demobilization":

        record.totalDemobilizationMinutes +=
          minutes;

        break;

    }

    record.updatedAt =
      now.toISOString();

    deurRepository.update(record);

    return record;

  }

}