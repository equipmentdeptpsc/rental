import type { RentalRecord } from "../types";

import type { RentalContractRecord } from "../types/RentalContract";

import type { EquipmentRecord } from "@/features/equipment/types";

import type { Operator } from "@/features/operators/types";

import type { ProjectRecord } from "@/features/project/types";

import type { AssignmentRecord } from "@/features/assignment/types";

import type { DeurRecord } from "../deur/types";
import type { RentalEquipmentLine } from "../equipment-line";
import type { RentalCollectionStatus } from "../collections/collectionStatusProjection";
import type { DeurExpectationDisposition } from "../remote/contracts";

export interface BillingSummary {

  hasStatement?: boolean;

  invoiceStatus?: string;

  invoicePreparationComplete?: boolean;
  totalOperatingCharge: number;

  totalIdleCharge: number;

  totalMobilizationCharge: number;

  totalDemobilizationCharge: number;

  totalAdjustment: number;

  subtotal: number;

  invoiced: number;

  collected: number;

  outstanding: number;
  collectionStatus?: RentalCollectionStatus;
}

export interface RentalAggregate {
  rental: RentalRecord;

  rentalEquipmentLines: RentalEquipmentLine[];

  /**
   * Commercial Contract
   * (Billing Rules)
   */
  contract?: RentalContractRecord;

  equipment?: EquipmentRecord;

  operator?: Operator;

  project?: ProjectRecord;

  assignment?: AssignmentRecord;

  activeDeur?: DeurRecord;

/**
 * All DEUR records belonging
 * to this rental.
 */
deurs: DeurRecord[];
expectationDispositions?: DeurExpectationDisposition[];

billing: BillingSummary;
}
