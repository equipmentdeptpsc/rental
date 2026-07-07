import { useMemo } from "react";

import type {
  RentalAggregate,
} from "@/features/rental/aggregate";

import { buildRentalOverview } from "../services/overview.service";

export function useRentalOverview(
  aggregate: RentalAggregate
) {
  return useMemo(
    () => buildRentalOverview(aggregate),
    [aggregate]
  );
}