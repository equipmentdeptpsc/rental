import type { RentalRecord } from "../../types";

import type { EquipmentRecord } from "@/features/equipment/types";

import type { AssignmentRecord } from "@/features/assignment/types";

import type { ProjectRecord } from "@/features/project/types";

import type { Operator } from "@/features/operators/types";

import type { DeurRecord } from "../../deur/types";
import type { RentalContractRecord } from "../../types/RentalContract";
import type { RentalEquipmentLine } from "../../equipment-line";

import type {
  RentalAggregate,
} from "../types";

interface BuildRentalAggregateParams {
  rental: RentalRecord;

  equipment?: EquipmentRecord;

  assignment?: AssignmentRecord;

  project?: ProjectRecord;

  operator?: Operator;

  /**
   * Today's active DEUR
   */
  activeDeur?: DeurRecord;

  /**
   * Complete DEUR history
   * for this rental.
   */
  deurs?: DeurRecord[];

  billing?: Partial<RentalAggregate["billing"]>;
  contract?: RentalContractRecord;
  rentalEquipmentLines?: RentalEquipmentLine[];
}

export function buildRentalAggregate({
  rental,
  equipment,
  assignment,
  project,
  operator,
  activeDeur,
  deurs = [],
  billing,
  contract,
  rentalEquipmentLines = [],
}: BuildRentalAggregateParams): RentalAggregate {
  return {
    rental,
    rentalEquipmentLines,
    contract,

    equipment,

    assignment,

    project,

    operator,

    activeDeur,

    deurs,

    billing: {
      hasStatement: false,

      invoicePreparationComplete: false,
      totalOperatingCharge: 0,

      totalIdleCharge: 0,

      totalMobilizationCharge: 0,

      totalAdjustment: 0,

      totalDemobilizationCharge: 0,

      subtotal: 0,

      invoiced: 0,

      collected: 0,

      outstanding: 0,

      ...billing,
    },
  };
}
