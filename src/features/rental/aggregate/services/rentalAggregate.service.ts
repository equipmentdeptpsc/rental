import type {
  RentalAggregate,
} from "../types";

import {
  RentalAggregateAssembler,
  type RentalAggregateAssemblerData,
} from "../assembler/RentalAggregateAssembler";

export function createRentalAggregate(
  data: RentalAggregateAssemblerData
): RentalAggregate {
  return RentalAggregateAssembler.assemble(
    data
  );
}