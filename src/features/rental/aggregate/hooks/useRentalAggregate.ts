import { useMemo } from "react";

import {
  createRentalAggregate,
} from "../services/rentalAggregate.service";

import type {
  RentalAggregateAssemblerData,
} from "../assembler/RentalAggregateAssembler";

export function useRentalAggregate(
  data: RentalAggregateAssemblerData
) {
  return useMemo(
    () =>
      createRentalAggregate(
        data
      ),
    [data]
  );
}