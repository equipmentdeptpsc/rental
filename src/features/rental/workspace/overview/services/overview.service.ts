import type {
  RentalAggregate,
} from "@/features/rental/aggregate";

import type {
  RentalOverviewModel,
} from "../types";

import {
  RentalOverviewMapper,
} from "../mapper/RentalOverviewMapper";

export function buildRentalOverview(
  aggregate: RentalAggregate
): RentalOverviewModel {
  return RentalOverviewMapper.map(
    aggregate
  );
}