import type { DeurRecord } from "@/features/rental/deur/types";

export interface DailyOperationsSummary {
  hasActiveRecord: boolean;

  latestRecord?: DeurRecord;

  operatingHours: number;

  idleHours: number;

  fuelIssued: number;

  remarks: string;
}