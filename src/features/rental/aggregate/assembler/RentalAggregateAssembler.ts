import type { RentalRecord } from "../../types";

import type { EquipmentRecord } from "@/features/equipment/types";

import type { AssignmentRecord } from "@/features/assignment/types";

import type { ProjectRecord } from "@/features/project/types";

import type { Operator } from "@/features/operators/types";

import type { DeurRecord } from "../../deur/types";

import type {
  RentalAggregate,
} from "../types";

import {
  buildRentalAggregate,
} from "../builders/buildRentalAggregate";

export interface RentalAggregateAssemblerData {
  rental: RentalRecord;

  equipment?: EquipmentRecord;

  assignment?: AssignmentRecord;

  project?: ProjectRecord;

  operator?: Operator;

  /**
   * Today's active DEUR.
   */
  activeDeur?: DeurRecord;

  /**
   * Complete DEUR history
   * for this rental.
   */
  deurs?: DeurRecord[];

  billing?: Partial<RentalAggregate["billing"]>;
}

export class RentalAggregateAssembler {
  static assemble(
    data: RentalAggregateAssemblerData
  ): RentalAggregate {
    return buildRentalAggregate({
      rental: data.rental,

      equipment: data.equipment,

      assignment: data.assignment,

      project: data.project,

      operator: data.operator,

      activeDeur: data.activeDeur,

      deurs: data.deurs,

      billing: data.billing,
    });
  }
}
