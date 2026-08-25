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
  aggregate: RentalAggregate,
  billingMethod?: string,
): RentalOverviewModel {
  return RentalOverviewMapper.map(
    aggregate,
    billingMethod,
  );
}
