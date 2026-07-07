import type { RentalRecord } from "../types";

import type { EquipmentRecord } from "@/features/equipment/types";

import type { Operator } from "@/features/operators/types";

import type { ProjectRecord } from "@/features/project/types";

import type { AssignmentRecord } from "@/features/assignment/types";

import type { DeurRecord } from "../deur/types";

export interface BillingSummary {
  totalOperatingCharge: number;

  totalIdleCharge: number;

  totalMobilizationCharge: number;

  totalDemobilizationCharge: number;

  totalAdjustment: number;

  subtotal: number;

  invoiced: number;

  collected: number;

  outstanding: number;
}

export interface RentalAggregate {
  rental: RentalRecord;

  equipment?: EquipmentRecord;

  operator?: Operator;

  project?: ProjectRecord;

  assignment?: AssignmentRecord;

  activeDeur?: DeurRecord;

  billing: BillingSummary;
}