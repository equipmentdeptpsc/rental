import { useMemo } from "react";

import { useRentalWorkspaceAggregate } from "..";

import { buildDailyOperations } from "./DeurBuilder";

export function useDailyOperations() {
  const aggregate =
    useRentalWorkspaceAggregate();

  return useMemo(
    () =>
      buildDailyOperations(
        aggregate
      ),
    [aggregate]
  );
}