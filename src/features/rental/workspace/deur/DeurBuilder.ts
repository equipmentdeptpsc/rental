import type {
    RentalAggregate,
  } from "@/features/rental/aggregate";
  
  import type {
    DailyOperationsSummary,
  } from "./types";
  
  export function buildDailyOperations(
    aggregate: RentalAggregate
  ): DailyOperationsSummary {
    const record =
      aggregate.activeDeur;
  
    return {
      hasActiveRecord:
        !!record,
  
      latestRecord:
        record,
  
      operatingHours: record
        ? Number(
            (
              record.totalOperatingMinutes /
              60
            ).toFixed(2)
          )
        : 0,
  
      idleHours: record
        ? Number(
            (
              record.totalIdleMinutes /
              60
            ).toFixed(2)
          )
        : 0,
  
      /*
       * Fuel is not yet part of
       * the DEUR domain.
       * Reserved for future Fuel module.
       */
      fuelIssued: 0,
  
      /*
       * Display the latest activity
       * as the operational summary.
       */
      remarks:
        record?.logs.at(-1)?.remarks ??
        "-",
    };
  }