import { deurRepository } from "../repository/deurRepository";

import type {
  DeurRecord,
  DeurActivityType,
} from "../types";

export interface StartActivityRequest {
  rentalId: string;
  equipmentId: string;
  operatorId: string;
  activity: DeurActivityType;
}

export class StartActivityService {

  static execute(
    request: StartActivityRequest
  ): DeurRecord {

    const now = new Date();

    const today =
      now.toISOString().split("T")[0];

    const timestamp =
      now.toISOString();

    const existing =
      deurRepository
        .getByRentalId(request.rentalId)
        .find(
          d => d.workDate === today
        );

    if (existing) {

      existing.logs.push({

        id: crypto.randomUUID(),

        activity: request.activity,

        startTime: timestamp,

        durationMinutes: 0,

      });

      existing.updatedAt =
        timestamp;

      deurRepository.update(
        existing
      );

      return existing;

    }

    const record: DeurRecord = {

      id: crypto.randomUUID(),

      rentalId: request.rentalId,

      equipmentId: request.equipmentId,

      operatorId: request.operatorId,

      workDate: today,

      logs: [

        {

          id: crypto.randomUUID(),

          activity: request.activity,

          startTime: timestamp,

          durationMinutes: 0,

        },

      ],

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