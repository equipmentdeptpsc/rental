import type { RentalAggregate } from "@/features/rental/aggregate";

import type { RentalOverviewModel } from "../types";

export class RentalOverviewMapper {
  static map(
    aggregate: RentalAggregate
  ): RentalOverviewModel {
    return {
      contract: {
        contractNo: aggregate.rental.id,

        customerName: aggregate.rental.customer,

        projectName:
          aggregate.project?.projectName ??
          aggregate.rental.project,

        projectLocation:
          aggregate.project?.location ?? "-",

        rentalType: aggregate.rental.rentalType ?? "Not specified",

        billingMethod: aggregate.rental.billingMethod ?? "Not specified",

        contractStatus: aggregate.rental.status,

        contractStart: aggregate.rental.dateOut,

        contractEnd:
          aggregate.rental.expectedReturn ?? "Not specified",

        totalDays: 0,

        daysRemaining: 0,
      },

      equipment: {
        equipmentId:
          aggregate.equipment?.id ??
          aggregate.rental.equipmentId,

        assetNo:
          aggregate.equipment?.assetNo ?? "-",

        equipmentName:
          aggregate.equipment?.equipmentName ??
          "-",

        equipmentStatus:
          aggregate.equipment?.status ?? "-",
      },

      operator: {
        operatorId:
          aggregate.operator?.id ?? "",

        operatorName:
          aggregate.operator?.name ?? "-",

        operatorStatus:
          aggregate.operator?.status ?? "-",
      },

      today: {
        currentStatus:
          aggregate.activeDeur
            ? "In Progress"
            : "No Active Session",

        currentActivity:
          aggregate.activeDeur?.logs.at(-1)
            ?.activity ?? "-",

        operator:
          aggregate.operator?.name ?? "-",

        activityStarted:
          aggregate.activeDeur?.logs.at(-1)
            ?.startTime ?? "-",

        operatingMinutes:
          aggregate.activeDeur
            ?.totalOperatingMinutes ?? 0,

        idleMinutes:
          aggregate.activeDeur
            ?.totalIdleMinutes ?? 0,

        mealBreakMinutes:
          aggregate.activeDeur
            ?.totalMealBreakMinutes ?? 0,

        correctiveMaintenanceMinutes: 0,

        preventiveMaintenanceMinutes:
          aggregate.activeDeur
            ?.totalMaintenanceMinutes ?? 0,

        endOfShiftSubmitted:
          Boolean(
            aggregate.activeDeur?.endOfDay
          ),
      },

      financial: {
        operatingCharges:
          aggregate.billing
            .totalOperatingCharge,

        idleCharges:
          aggregate.billing.totalIdleCharge,

        mobilizationCharges:
          aggregate.billing
            .totalMobilizationCharge,

        demobilizationCharges:
          aggregate.billing
            .totalDemobilizationCharge,

        adjustments:
          aggregate.billing.totalAdjustment,

        subtotal:
          aggregate.billing.subtotal,

        invoiced:
          aggregate.billing.invoiced,

        collected:
          aggregate.billing.collected,

        outstanding:
          aggregate.billing.outstanding,
      },

      timeline: [],

      alerts: [],
    };
  }
}
